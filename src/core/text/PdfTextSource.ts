// src/core/text/PdfTextSource.ts
// Abstracción del motor de extracción de texto (Dependency Inversion).
// El pipeline depende de esta interfaz, NO de pdfjs/unpdf/pdf2json.
// - En el navegador: implementada con unpdf (pdfjs) dentro de un Web Worker.
// - En tests/Node: implementada con unpdf o un doble de prueba.
// Esto permite cambiar de motor tocando un solo archivo.

export interface PdfTextSource {
  /**
   * Extrae el texto plano de un PDF.
   * @param bytes Contenido binario del PDF.
   * @returns Texto concatenado de todas las páginas (puede ser "" si no hay capa de texto).
   * @throws Si el binario no es un PDF parseable (debe propagarse como PARSE_ERROR).
   */
  extractText(bytes: Uint8Array): Promise<string>;
}
