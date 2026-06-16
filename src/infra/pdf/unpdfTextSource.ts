// src/infra/pdf/unpdfTextSource.ts
// Adaptador concreto de PdfTextSource usando unpdf (pdfjs).
// Es infraestructura (depende de una librería externa), por eso vive fuera de core/.
// Isomórfico: funciona en Node (tests) y en el navegador (Web Worker).

import { extractText, getDocumentProxy } from "unpdf";
import type { PdfTextSource } from "@/core/text/PdfTextSource";

/** Tope de páginas por documento. Un PDF puede declarar un árbol de páginas enorme y
 *  forzar a pdf.js a iterar miles de páginas (amplificación CPU/memoria). Ningún
 *  documento vehicular legítimo se acerca a este número. */
const MAX_PAGES = 1000;

async function extract(bytes: Uint8Array): Promise<string> {
  // getDocumentProxy puede transferir/“detachar” el buffer; pasamos la vista tal cual.
  const pdf = await getDocumentProxy(bytes);
  try {
    if (typeof pdf.numPages === "number" && pdf.numPages > MAX_PAGES) {
      throw new Error(`El PDF declara ${pdf.numPages} páginas (máximo ${MAX_PAGES}).`);
    }
    // mergePages:true -> `text` es un único string con todas las páginas.
    const { text } = await extractText(pdf, { mergePages: true });
    return text ?? "";
  } finally {
    // Libera las cachés internas de pdf.js (fuentes/streams/páginas). Sin esto, el
    // worker reutiliza la misma instancia entre archivos y la memoria crece de forma
    // monótona en lotes grandes hasta agotar la pestaña (OOM).
    try {
      await (pdf as { destroy?: () => Promise<void> }).destroy?.();
    } catch {
      /* destroy es best-effort: no debe enmascarar el resultado/causa real */
    }
  }
}

export const unpdfTextSource: PdfTextSource = { extractText: extract };
