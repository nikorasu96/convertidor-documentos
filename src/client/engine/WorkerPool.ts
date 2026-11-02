// src/client/engine/WorkerPool.ts
// Pool de Web Workers para procesar PDFs en paralelo real (multi-core).
//
// Características clave:
//  - Lectura perezosa de bytes: el contenido del archivo se lee SOLO cuando hay
//    un worker libre, por lo que la memoria viva se acota a ~poolSize archivos
//    (procesar 10.000 PDFs no carga 10.000 buffers a la vez).
//  - Transferables: el ArrayBuffer se transfiere (zero-copy) al worker.
//  - Timeout por tarea + reciclaje del worker colgado: un PDF corrupto no puede
//    bloquear el lote para siempre (bug del pool anterior).
//  - Tolerancia a fallos: si un worker muere, se reemplaza y la tarea en vuelo
//    se resuelve como fallo estructurado (nunca queda una promesa colgada).

import type { PDFFormat } from "@/core/domain/format";
import type { ConversionOutcome } from "@/core/domain/result";
import type { ConversionErrorCode } from "@/core/domain/errors";
import type { WorkerResponse } from "@/workers/protocol";

type ReadBytes = () => Promise<ArrayBuffer>;

interface Task {
  id: number;
  fileName: string;
  format: PDFFormat;
  readBytes: ReadBytes;
  resolve: (o: ConversionOutcome) => void;
}

interface Slot {
  worker: Worker;
  task: Task | null;
  timer: ReturnType<typeof setTimeout> | null;
}

export interface WorkerPoolOptions {
  /** Nº de workers. Por defecto navigator.hardwareConcurrency acotado a [2, 16]. */
  size?: number;
  /** Timeout por archivo en ms. Por defecto 30s. */
  taskTimeoutMs?: number;
}

export class WorkerPool {
  private readonly slots: Slot[] = [];
  private readonly queue: Task[] = [];
  private nextId = 0;
  private terminated = false;

  constructor(
    private readonly createWorker: () => Worker,
    private readonly options: WorkerPoolOptions = {}
  ) {
    const size = options.size ?? defaultPoolSize();
    for (let i = 0; i < size; i++) this.slots.push(this.spawn());
  }

  /** Encola un archivo. Los bytes se leen solo al despachar (memoria acotada). */
  submit(fileName: string, format: PDFFormat, readBytes: ReadBytes): Promise<ConversionOutcome> {
    return new Promise((resolve) => {
      this.queue.push({ id: this.nextId++, fileName, format, readBytes, resolve });
      this.pump();
    });
  }

  terminate(): void {
    this.terminated = true;
    for (const slot of this.slots) {
      if (slot.timer) clearTimeout(slot.timer);
      slot.worker.terminate();
    }
    this.slots.length = 0;
    this.queue.length = 0;
  }

  // --- internals ---

  private spawn(): Slot {
    const slot: Slot = { worker: this.createWorker(), task: null, timer: null };
    slot.worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.onMessage(slot, e.data);
    slot.worker.onerror = () => this.onWorkerFailure(slot, "El worker de conversión falló inesperadamente.");
    slot.worker.onmessageerror = () =>
      this.onWorkerFailure(slot, "Error de serialización en el worker de conversión.");
    return slot;
  }

  private pump(): void {
    if (this.terminated) return;
    for (const slot of this.slots) {
      if (slot.task) continue;
      const task = this.queue.shift();
      if (!task) break;
      this.run(slot, task);
    }
  }

  private async run(slot: Slot, task: Task): Promise<void> {
    slot.task = task;
    let bytes: ArrayBuffer;
    try {
      bytes = await task.readBytes();
    } catch {
      // Solo resolvemos si el slot sigue siendo nuestro (no reciclado durante el await).
      if (slot.task === task) {
        slot.task = null;
        task.resolve(failure(task.fileName, "PARSE_ERROR", `No se pudo leer el archivo "${task.fileName}".`));
        this.pump();
      }
      return;
    }
    // Durante el `await` anterior el slot pudo reciclarse (onWorkerFailure) y la tarea
    // ya estar resuelta y reasignada a otro slot/worker. Si el slot dejó de ser nuestro
    // (o el pool terminó), abortamos: postear o armar el timer aquí corrompería el slot
    // (timer huérfano -> timeout espurio atribuido a OTRO archivo).
    if (this.terminated || slot.task !== task) return;

    slot.timer = setTimeout(() => {
      // Worker colgado: lo reciclamos y resolvemos la tarea como fallo.
      const stuck = slot.task;
      this.replaceWorker(slot);
      if (stuck) {
        stuck.resolve(
          failure(
            stuck.fileName,
            "PARSE_ERROR",
            `Tiempo de espera agotado procesando "${stuck.fileName}" (posible PDF corrupto o muy grande).`
          )
        );
      }
      this.pump();
    }, this.options.taskTimeoutMs ?? 30_000);

    slot.worker.postMessage(
      { id: task.id, fileName: task.fileName, format: task.format, bytes },
      [bytes]
    );
  }

  private onMessage(slot: Slot, res: WorkerResponse): void {
    const task = slot.task;
    if (!task || task.id !== res.id) return; // respuesta tardía de un worker reciclado
    if (slot.timer) clearTimeout(slot.timer);
    slot.timer = null;
    slot.task = null;
    task.resolve(res.outcome);
    this.pump();
  }

  private onWorkerFailure(slot: Slot, message: string): void {
    const task = slot.task;
    this.replaceWorker(slot);
    if (task) task.resolve(failure(task.fileName, "INTERNAL", message));
    this.pump();
  }

  private replaceWorker(slot: Slot): void {
    if (slot.timer) clearTimeout(slot.timer);
    slot.timer = null;
    slot.task = null;
    try {
      slot.worker.terminate();
    } catch {
      /* ya terminado */
    }
    if (this.terminated) return;
    slot.worker = this.createWorker();
    slot.worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.onMessage(slot, e.data);
    slot.worker.onerror = () => this.onWorkerFailure(slot, "El worker de conversión falló inesperadamente.");
    slot.worker.onmessageerror = () =>
      this.onWorkerFailure(slot, "Error de serialización en el worker de conversión.");
  }
}

function failure(fileName: string, code: ConversionErrorCode, error: string): ConversionOutcome {
  return { status: "error", fileName, code, error };
}

export function defaultPoolSize(): number {
  const hc =
    typeof navigator !== "undefined" && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 4;
  return Math.max(2, Math.min(16, hc));
}
