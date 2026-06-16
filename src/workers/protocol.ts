// src/workers/protocol.ts
// Contrato de mensajes entre el hilo principal y el Web Worker de conversión.
// Tipos puros y serializables (deben sobrevivir a structuredClone/postMessage).

import type { PDFFormat } from "@/core/domain/format";
import type { ConversionOutcome } from "@/core/domain/result";

export interface WorkerRequest {
  /** Identificador de la tarea, para correlacionar respuesta. */
  id: number;
  fileName: string;
  format: PDFFormat;
  /** Contenido del PDF. Se envía como transferable (zero-copy). */
  bytes: ArrayBuffer;
}

export interface WorkerResponse {
  id: number;
  outcome: ConversionOutcome;
}
