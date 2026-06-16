// src/core/pipeline/processDocument.ts
// Orquestación pura de un documento: parse -> detección -> extracción -> validación.
// No conoce Web Workers ni el DOM; recibe el motor de texto por inyección (DIP),
// por lo que es 100% testeable en Node con un doble de prueba.

import type { PdfTextSource } from "../text/PdfTextSource";
import type { PDFFormat } from "../domain/format";
import { EXCEL_BASE_FILENAME } from "../domain/format";
import type { ConversionOutcome } from "../domain/result";
import { ConversionError, isConversionError, toErrorMessage } from "../domain/errors";
import { detectFormat } from "../extraction/detectFormat";
import { getExtractor } from "../extraction/registry";

/** Bajo este nº de caracteres con texto consideramos que el PDF no tiene capa de texto. */
const MIN_TEXT_LENGTH = 20;

/**
 * Tope de caracteres de texto que se procesan por documento. Defensa contra "bombas
 * de texto" (PDF pequeño con una capa de texto enorme) y contra la amplitud del
 * backtracking de los regex de extracción: ningún documento vehicular legítimo se
 * acerca a este tamaño, así que recortar es seguro y acota CPU/memoria del worker.
 */
const MAX_TEXT_LENGTH = 2_000_000;

const SCANNED_MESSAGE =
  "Documento escaneado sin capa de texto extraíble. Requiere una versión digital con texto (o OCR).";

function fail(
  fileName: string,
  e: ConversionError
): Extract<ConversionOutcome, { status: "error" }> {
  return {
    status: "error",
    fileName,
    code: e.code,
    error: e.message,
    detectedFormat: e.detectedFormat,
  };
}

/**
 * Procesa un único documento PDF ya leído en memoria.
 * @param fileName Nombre del archivo (para mensajes y trazabilidad).
 * @param bytes Contenido del PDF.
 * @param expectedFormat Formato seleccionado por el usuario.
 * @param textSource Motor de extracción de texto (inyectado).
 */
export async function processDocument(
  fileName: string,
  bytes: Uint8Array,
  expectedFormat: PDFFormat,
  textSource: PdfTextSource
): Promise<ConversionOutcome> {
  // 1. Parseo a texto.
  let text: string;
  try {
    text = await textSource.extractText(bytes);
  } catch (e) {
    return fail(
      fileName,
      new ConversionError("PARSE_ERROR", `No se pudo leer el PDF "${fileName}": ${toErrorMessage(e)}`)
    );
  }

  // Cota defensiva de tamaño (anti text-bomb / acota el coste de los regex).
  if (text.length > MAX_TEXT_LENGTH) text = text.slice(0, MAX_TEXT_LENGTH);

  // 2. Sin capa de texto (PDF escaneado).
  if (text.replace(/\s/g, "").length < MIN_TEXT_LENGTH) {
    return fail(fileName, new ConversionError("NO_TEXT_LAYER", `${fileName}: ${SCANNED_MESSAGE}`));
  }

  // 3. Detección de formato y verificación contra el formato esperado.
  const detected = detectFormat(text);
  if (detected !== expectedFormat) {
    const detectedLabel = detected ? EXCEL_BASE_FILENAME[detected] : "Formato Desconocido";
    return fail(
      fileName,
      new ConversionError(
        "FORMAT_MISMATCH",
        `El archivo ${fileName} no corresponde al formato esperado (${EXCEL_BASE_FILENAME[expectedFormat]}). Se detectó que pertenece a: ${detectedLabel}.`,
        detectedLabel
      )
    );
  }

  // 4. Extracción + validación.
  try {
    const extractor = getExtractor(detected);
    const data = extractor.extract(text);
    extractor.validate(data, fileName);
    return { status: "ok", fileName, data };
  } catch (e) {
    if (isConversionError(e)) return fail(fileName, e);
    return fail(
      fileName,
      new ConversionError("INTERNAL", `Error inesperado procesando "${fileName}": ${toErrorMessage(e)}`)
    );
  }
}
