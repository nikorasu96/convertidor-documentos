/**
 * @module client/engine/conversionEngine
 * @description Orquesta la conversión de un lote de archivos PDF en el navegador
 * usando Web Workers. Mantiene el hilo principal libre y proporciona callbacks
 * de progreso en tiempo real.
 */

import { WorkerPool, defaultPoolSize } from "./WorkerPool";
import type { PDFFormat } from "@/core/domain/format";
import type { ConversionOutcome } from "@/core/domain/result";

/**
 * Estado de progreso de la conversión en tiempo real.
 * @interface Progress
 * @property {number} processed - Archivos procesados hasta ahora
 * @property {number} total - Total de archivos a procesar
 * @property {number} successes - Conversiones exitosas
 * @property {number} failures - Conversiones fallidas
 * @property {number} estimatedMsLeft - Estimación en milisegundos (basado en velocidad actual)
 * @property {number} elapsedMs - Tiempo transcurrido desde el inicio
 */
export interface Progress {
  processed: number;
  total: number;
  successes: number;
  failures: number;
  estimatedMsLeft: number;
  elapsedMs: number;
}

/**
 * Opciones para la conversión de archivos.
 * @interface ConvertOptions
 * @property {AbortSignal} [signal] - Signal para cancelar la conversión
 * @property {(p: Progress) => void} [onProgress] - Callback de progreso (throttled)
 * @property {number} [poolSize] - Tamaño del pool de workers (default: auto-detect, rango [2,16])
 */
export interface ConvertOptions {
  signal?: AbortSignal;
  onProgress?: (p: Progress) => void;
  poolSize?: number;
}

/**
 * Crea una instancia de Web Worker para conversión de PDFs.
 * El bundler resuelve la URL automáticamente mediante import.meta.url.
 * @returns {Worker} Instancia de Worker listo para procesar mensajes
 * @internal
 */
function createConversionWorker(): Worker {
  return new Worker(new URL("../../workers/conversion.worker.ts", import.meta.url), {
    type: "module",
  });
}

/**
 * Convierte un lote de archivos PDF a datos estructurados usando Web Workers.
 *
 * @description
 * Procesa archivos en paralelo real (multi-core) manteniendo el hilo principal libre.
 * Los archivos se procesan en el MISMO orden que el array de entrada.
 *
 * Características:
 * - Lectura perezosa (lazy reading): bytes leídos solo cuando hay worker disponible
 * - Zero-copy transfers: ArrayBuffer transferido sin duplicación
 * - Timeout automático: PDFs que cuelguen se reciclan (timeout: 30s default)
 * - Cancelación: soporta AbortSignal para parar la conversión
 *
 * @param {File[]} files - Array de archivos File a procesar (desde input file)
 * @param {PDFFormat} format - Formato del documento (CRT|SOAP|Homologación|PermsoCirculación)
 * @param {ConvertOptions} [opts] - Opciones de configuración
 *
 * @returns {Promise<ConversionOutcome[]>} Array de resultados en mismo orden que `files`
 * - ConversionSuccess: { status: 'ok', fileName, data }
 * - ConversionFailure: { status: 'error', fileName, code, error }
 *
 * @throws {DOMException} Con código 'AbortError' si se cancela vía opts.signal
 *
 * @example
 * ```typescript
 * const results = await convertFiles(fileList, 'CRT', {
 *   poolSize: 4,
 *   signal: abortController.signal,
 *   onProgress: (p) => console.log(`${p.processed}/${p.total}`)
 * });
 *
 * results.forEach(outcome => {
 *   if (outcome.status === 'ok') {
 *     console.log(outcome.data.patente);
 *   } else {
 *     console.error(`${outcome.fileName}: ${outcome.error}`);
 *   }
 * });
 * ```
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
