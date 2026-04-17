// src/utils/pdf/pdfWorkerPool.ts
import { Worker } from "worker_threads";
import os from "os";
import logger from "../logger";

const WORKER_CODE = `
const { parentPort } = require('worker_threads');
const PDFParser = require('pdf2json');

parentPort.on('message', (msg) => {
  const buffer = Buffer.from(msg.buffer);
  const pdfParser = new PDFParser();
  pdfParser.on('pdfParser_dataReady', (data) => {
    let allText = '';
    if (data.Pages) {
      allText = data.Pages.map((page) =>
        page.Texts.map((t) => decodeURIComponent(t.R[0]?.T || '')).join(' ')
      ).join(' ');
    }
    parentPort.postMessage({ id: msg.id, text: allText });
  });
  pdfParser.on('pdfParser_dataError', (errData) => {
    parentPort.postMessage({ id: msg.id, error: errData.parserError || 'Error al parsear PDF' });
  });
  pdfParser.parseBuffer(buffer);
});
`;

interface PendingTask {
  resolve: (text: string) => void;
  reject: (err: Error) => void;
}

interface PoolWorker {
  worker: Worker;
  busy: boolean;
}

let pool: PoolWorker[] = [];
let taskQueue: Array<{ buffer: Buffer; resolve: (text: string) => void; reject: (err: Error) => void }> = [];
let pendingTasks = new Map<number, PendingTask>();
let taskIdCounter = 0;
let initialized = false;

function getPoolSize(): number {
  const envSize = parseInt(process.env.PDF_WORKER_POOL_SIZE || "0", 10);
  if (envSize > 0) return envSize;
  return Math.max(2, os.cpus().length - 1);
}

function createWorker(): PoolWorker | null {
  try {
    const worker = new Worker(WORKER_CODE, { eval: true });
    const poolWorker: PoolWorker = { worker, busy: false };

    worker.on("message", (msg: { id: number; text?: string; error?: string }) => {
      const pending = pendingTasks.get(msg.id);
      if (pending) {
        pendingTasks.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error("Error al parsear el PDF: " + msg.error));
        } else if (!msg.text?.trim()) {
          pending.reject(new Error("El PDF no contiene texto extraíble o el formato no es válido"));
        } else {
          pending.resolve(msg.text);
        }
      }
      poolWorker.busy = false;
      processQueue();
    });

    worker.on("error", (err) => {
      logger.error("Worker error:", err);
      // Rechazar todas las tareas pendientes de este worker
      poolWorker.busy = false;
      processQueue();
    });

    return poolWorker;
  } catch {
    return null;
  }
}

function initPool(): void {
  if (initialized) return;
  initialized = true;

  const size = getPoolSize();
  for (let i = 0; i < size; i++) {
    const w = createWorker();
    if (w) pool.push(w);
  }

  if (pool.length > 0) {
    logger.info(`PDF Worker Pool inicializado con ${pool.length} workers`);
  } else {
    logger.warn("No se pudieron crear workers. Se usará parseo en hilo principal.");
  }
}

function processQueue(): void {
  while (taskQueue.length > 0) {
    const freeWorker = pool.find((w) => !w.busy);
    if (!freeWorker) break;

    const task = taskQueue.shift()!;
    freeWorker.busy = true;
    const id = taskIdCounter++;
    pendingTasks.set(id, { resolve: task.resolve, reject: task.reject });
    freeWorker.worker.postMessage({ id, buffer: task.buffer });
  }
}

/**
 * Parsea un PDF usando el pool de worker threads.
 * Retorna el texto extraído del PDF.
 * Si el pool no está disponible, retorna null (debe usarse fallback).
 */
export function parsePDFWithWorker(buffer: Buffer): Promise<string> | null {
  initPool();

  if (pool.length === 0) return null;

  return new Promise<string>((resolve, reject) => {
    taskQueue.push({ buffer, resolve, reject });
    processQueue();
  });
}

/**
 * Indica si el pool de workers está disponible.
 */
export function isWorkerPoolAvailable(): boolean {
  initPool();
  return pool.length > 0;
}

/**
 * Destruye el pool de workers (para cleanup en tests o shutdown).
 */
export async function destroyWorkerPool(): Promise<void> {
  const terminatePromises = pool.map((w) => w.worker.terminate());
  await Promise.all(terminatePromises);
  pool = [];
  taskQueue = [];
  pendingTasks.clear();
  initialized = false;
}
