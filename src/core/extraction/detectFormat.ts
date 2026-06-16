// src/core/extraction/detectFormat.ts
import type { PDFFormat } from "../domain/format";

/**
 * Detecta el formato de un PDF según palabras clave en el texto extraído.
 * Devuelve null si no se identifica ningún formato conocido.
 */
export function detectFormat(text: string): PDFFormat | null {
  const upper = text.toUpperCase();
  if (upper.includes("CERTIFICADO DE HOMOLOGACIÓN")) return "CERTIFICADO_DE_HOMOLOGACION";
  if (upper.includes("CERTIFICADO DE REVISIÓN TÉCNICA") || upper.includes("FECHA REVISIÓN"))
    return "CRT";
  if (upper.includes("SEGURO OBLIGATORIO") || upper.includes("SOAP")) return "SOAP";
  if (upper.includes("PERMISO DE CIRCULACIÓN") || upper.includes("PLACA ÚNICA"))
    return "PERMISO_CIRCULACION";
  // Fallback: Permiso de Circulación sin etiquetas (sello verde es exclusivo de este formato).
  if (/VERDE-[\d.]|\*-\d/i.test(upper)) return "PERMISO_CIRCULACION";
  return null;
}
