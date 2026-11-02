/**
 * @module client/engine/WorkerPool
 * @description Pool de Web Workers para procesamiento paralelo de PDFs.
 *
 * Proporciona paralelismo REAL en multi-core con características avanzadas:
 * - Lectura perezosa (lazy reading): bytes se leen solo cuando hay worker libre
 * - Zero-copy transfers: ArrayBuffer se transfiere sin duplicación
 * - Timeout y reciclaje automático: Workers colgados se reemplazan
 * - Tolerancia a fallos: nunca quedan promesas colgadas
 * - Memory efficient: memoria viva acotada a ~poolSize × max_file_size
 */

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

/**
 * Opciones de configuración para WorkerPool.
 * @interface WorkerPoolOptions
 * @property {number} [size] - Número de workers en el pool
 *   - Si no se especifica: auto-detect vía navigator.hardwareConcurrency
 *   - Rango acotado: [2, 16] para evitar overhead en CPUs muy grandes
 * @property {number} [taskTimeoutMs] - Timeout por tarea en milisegundos
 *   - Default: 30000 (30 segundos)
 *   - Workers que cuelguen más tiempo se reciclan automáticamente
 */
export interface WorkerPoolOptions {
  size?: number;
  taskTimeoutMs?: number;
}

/**
 * Pool de Web Workers para procesamiento paralelo de PDFs.
 *
 * @description
 * Gestiona un conjunto de Web Workers que procesan archivos en paralelo real.
 * Características principales:
 * - Lectura perezosa: bytes se leen solo cuando hay worker disponible
 * - Zero-copy: ArrayBuffer se transfiere, no se copia
 * - Timeout: workers colgados se reciclan automáticamente
 * - Tolerancia a fallos: workers que crashean se reemplazan
 *
 * @example
 * ```typescript
 * const pool = new WorkerPool(() => new Worker(...), { size: 4 });
 * const outcome = await pool.submit('file.pdf', 'CRT', () => file.arrayBuffer());
 * pool.terminate();
 * ```
 */
export class WorkerPool {
  private readonly slots: Slot[] = [];
  private readonly queue: Task[] = [];
  private nextId = 0;
  private terminated = false;

  /**
   * Crea una nueva instancia de WorkerPool.
   * @param {() => Worker} createWorker - Factory para crear Workers
   * @param {WorkerPoolOptions} [options] - Configuración del pool
   */
  constructor(
    private readonly createWorker: () => Worker,
    private readonly options: WorkerPoolOptions = {}
  ) {
    const size = options.size ?? defaultPoolSize();
    for (let i = 0; i < size; i++) this.slots.push(this.spawn());
  }

  /**
   * Encola un archivo para procesamiento.
   *
   * @description
   * No lee los bytes inmediatamente. La lectura ocurre cuando hay un worker
   * disponible, lo que mantiene la memoria viva acotada.
   *
   * @param {string} fileName - Nombre del archivo (para reportes)
   * @param {PDFFormat} format - Formato del documento
   * @param {ReadBytes} readBytes - Función que retorna Promise<ArrayBuffer>
   *
   * @returns {Promise<ConversionOutcome>} Resultado de conversión
   *
   * @example
   * ```typescript
   * const outcome = await pool.submit(
   *   'documento.pdf',
   *   'CRT',
   *   () => fileInput.arrayBuffer()
   * );
   * ```
   */
  submit(fileName: string, format: PDFFormat, readBytes: ReadBytes): Promise<ConversionOutcome> {
    return new Promise((resolve) => {
      this.queue.push({ id: this.nextId++, fileName, format, readBytes, resolve });
      this.pump();
    });
  }

  /**
   * Detiene el pool y libera todos los recursos.
   *
   * @description
   * - Termina todos los workers
   * - Cancela tareas pendientes
   * - Limpia timers
   *
   * Debe llamarse cuando se termina de usar el pool.
   */
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

/**
 * Convierte un error a ConversionOutcome.
 * @internal
 */
function failure(fileName: string, code: ConversionErrorCode, error: string): ConversionOutcome {
  return { status: "error", fileName, code, error };
}

/**
 * Detecta el tamaño óptimo del pool basado en hardware disponible.
 *
 * @description
 * - Intenta leer navigator.hardwareConcurrency (nº de CPUs lógicas)
 * - Si no está disponible, usa default de 4
 * - Acota el resultado a rango [2, 16] para evitar overhead
 *
 * Ejemplos:
 * - CPU 2-core   → Pool size: 2
 * - CPU 4-core   → Pool size: 4
 * - CPU 8-core   → Pool size: 8
 * - CPU 32-core  → Pool size: 16 (máximo)
 *
 * @returns {number} Tamaño recomendado del pool
 */
export function defaultPoolSize(): number {
  const hc =
    typeof navigator !== "undefined" && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 4;
  return Math.max(2, Math.min(16, hc));
}
