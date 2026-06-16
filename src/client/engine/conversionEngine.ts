// src/client/engine/conversionEngine.ts
// Orquesta la conversión de un lote de archivos en el navegador usando el pool
// de Web Workers. Devuelve los resultados en el MISMO orden que `files`.
// Mantiene el hilo principal libre: solo lee bytes y agrega progreso.

import { WorkerPool, defaultPoolSize } from "./WorkerPool";
import type { PDFFormat } from "@/core/domain/format";
import type { ConversionOutcome } from "@/core/domain/result";

export interface Progress {
  processed: number;
  total: number;
  successes: number;
  failures: number;
  estimatedMsLeft: number;
  elapsedMs: number;
}

export interface ConvertOptions {
  signal?: AbortSignal;
  onProgress?: (p: Progress) => void;
  /** Override del tamaño del pool (por defecto: nº de núcleos, acotado [2,16]). */
  poolSize?: number;
}

/** Crea un Web Worker de conversión (módulo). El bundler resuelve la URL. */
function createConversionWorker(): Worker {
  return new Worker(new URL("../../workers/conversion.worker.ts", import.meta.url), {
    type: "module",
  });
}

/**
 * Convierte un lote de PDFs a resultados estructurados.
 * @throws DOMException("AbortError") si se cancela vía `signal`.
 */
export async function convertFiles(
  files: File[],
  format: PDFFormat,
  opts: ConvertOptions = {}
): Promise<ConversionOutcome[]> {
  const total = files.length;
  if (total === 0) return [];

  const pool = new WorkerPool(createConversionWorker, { size: opts.poolSize ?? defaultPoolSize() });

  let processed = 0;
  let successes = 0;
  let failures = 0;
  const start = now();
  const throttle = total < 50 ? 1 : total < 500 ? 5 : 20;

  const emitProgress = () => {
    if (!opts.onProgress) return;
    if (processed % throttle !== 0 && processed !== total) return;
    const elapsedMs = now() - start;
    const estimatedMsLeft = processed > 0 ? Math.round((elapsedMs / processed) * (total - processed)) : 0;
    opts.onProgress({ processed, total, successes, failures, estimatedMsLeft, elapsedMs });
  };

  try {
    const tasks = files.map((file) =>
      pool.submit(file.name, format, () => file.arrayBuffer()).then((outcome) => {
        processed++;
        if (outcome.status === "ok") successes++;
        else failures++;
        emitProgress();
        return outcome;
      })
    );

    if (opts.signal) {
      const abortPromise = new Promise<never>((_, reject) => {
        const onAbort = () => reject(new DOMException("Conversión cancelada por el usuario.", "AbortError"));
        if (opts.signal!.aborted) onAbort();
        else opts.signal!.addEventListener("abort", onAbort, { once: true });
      });
      return await Promise.race([Promise.all(tasks), abortPromise]);
    }

    return await Promise.all(tasks);
  } finally {
    pool.terminate();
  }
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
