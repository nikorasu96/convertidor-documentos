// src/core/extraction/Extractor.ts
import type { PDFFormat } from "../domain/format";
import type { DocumentData } from "../domain/result";

/**
 * Contrato común de un extractor de documento (Strategy pattern).
 * Añadir un nuevo formato = implementar esta interfaz y registrarlo en el registry,
 * sin tocar el pipeline (Open/Closed Principle).
 */
export interface Extractor {
  readonly format: PDFFormat;

  /**
   * Extrae los campos del texto del PDF.
   * @throws ConversionError(VALIDATION_ERROR) si el documento carece de
   *         estructura mínima reconocible para este formato.
   */
  extract(text: string): DocumentData;

  /**
   * Valida que los datos extraídos cumplan el formato esperado.
   * @throws ConversionError(VALIDATION_ERROR) con el detalle de los campos inválidos.
   */
  validate(data: DocumentData, fileName: string): void;
}
