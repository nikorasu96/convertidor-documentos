// src/core/domain/result.ts
// Tipos de resultado del pipeline de conversión. Inmutables y serializables
// (cruzan el límite Web Worker <-> hilo principal vía postMessage).

import type { ConversionErrorCode } from "./errors";

/** Datos extraídos de un documento: pares campo -> valor, en orden de inserción. */
export type DocumentData = Record<string, string>;

/** Conversión exitosa de un archivo. */
export interface ConversionSuccess {
  readonly status: "ok";
  readonly fileName: string;
  readonly data: DocumentData;
}

/** Conversión fallida de un archivo, con causa categorizada. */
export interface ConversionFailure {
  readonly status: "error";
  readonly fileName: string;
  readonly code: ConversionErrorCode;
  readonly error: string;
  readonly detectedFormat?: string;
}

export type ConversionOutcome = ConversionSuccess | ConversionFailure;

export function isSuccess(o: ConversionOutcome): o is ConversionSuccess {
  return o.status === "ok";
}

/** Resumen estadístico de un lote, usado en la hoja "Estadisticas" del Excel. */
export interface ConversionStats {
  readonly totalProcesados: number;
  readonly totalExitosos: number;
  readonly totalFallidos: number;
  readonly fallidos: ReadonlyArray<{ fileName: string; error: string }>;
}
