// src/core/domain/format.ts
// Dominio: formatos de documento soportados y sus metadatos.
// Capa pura: sin dependencias de DOM, Node, React ni librerías de PDF/Excel.

/**
 * Formatos de PDF que el sistema sabe extraer.
 * Se mantiene el mismo contrato de strings que la versión anterior para no romper
 * el frontend ni los datos guardados.
 */
export type PDFFormat =
  | "CERTIFICADO_DE_HOMOLOGACION"
  | "CRT"
  | "SOAP"
  | "PERMISO_CIRCULACION";

export const PDF_FORMATS: readonly PDFFormat[] = [
  "CERTIFICADO_DE_HOMOLOGACION",
  "CRT",
  "SOAP",
  "PERMISO_CIRCULACION",
] as const;

/** Nombre base del archivo Excel generado por cada formato. */
export const EXCEL_BASE_FILENAME: Record<PDFFormat, string> = {
  CERTIFICADO_DE_HOMOLOGACION: "Certificado de Homologación",
  CRT: "Certificado de Revisión Técnica (CRT)",
  SOAP: "Seguro Obligatorio (SOAP)",
  PERMISO_CIRCULACION: "Permiso de Circulación",
};

export function isPDFFormat(value: unknown): value is PDFFormat {
  return typeof value === "string" && (PDF_FORMATS as readonly string[]).includes(value);
}
