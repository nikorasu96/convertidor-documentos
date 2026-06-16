// src/core/domain/errors.ts
// Errores de dominio tipados. Cada error lleva un `code` estable para que la UI
// y los logs puedan diferenciar categorías (validación, formato, parseo, etc.)
// sin depender de strings de mensaje. (Best practice: códigos de error consistentes.)

export type ConversionErrorCode =
  | "NO_TEXT_LAYER" // PDF escaneado / sin capa de texto extraíble
  | "PARSE_ERROR" // el archivo no pudo parsearse como PDF
  | "FORMAT_MISMATCH" // el PDF no corresponde al formato seleccionado
  | "UNKNOWN_FORMAT" // no se pudo identificar el formato
  | "VALIDATION_ERROR" // los datos extraídos no cumplen el formato esperado
  | "FILE_INVALID" // el archivo no superó la validación previa (tipo/tamaño)
  | "INTERNAL"; // error inesperado

export class ConversionError extends Error {
  readonly code: ConversionErrorCode;
  /** Formato detectado (cuando aplica), útil para FORMAT_MISMATCH. */
  readonly detectedFormat?: string;

  constructor(code: ConversionErrorCode, message: string, detectedFormat?: string) {
    super(message);
    this.name = "ConversionError";
    this.code = code;
    this.detectedFormat = detectedFormat;
    // Necesario para que `instanceof` funcione al transpilar a ES5/ES2017.
    Object.setPrototypeOf(this, ConversionError.prototype);
  }
}

export function isConversionError(e: unknown): e is ConversionError {
  return e instanceof ConversionError;
}

/**
 * Normaliza cualquier valor lanzado a un mensaje legible (nunca expone stack ni
 * detalles internos). (Best practice: no exponer detalles internos en errores públicos.)
 */
export function toErrorMessage(e: unknown, fallback = "Error desconocido"): string {
  if (isConversionError(e)) return e.message;
  if (e instanceof Error && typeof e.message === "string") return e.message;
  if (typeof e === "string") return e;
  return fallback;
}
