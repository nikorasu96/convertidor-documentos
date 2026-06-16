// src/infra/pdf/unpdfTextSource.ts
// Adaptador concreto de PdfTextSource usando unpdf (pdfjs).
// Es infraestructura (depende de una librería externa), por eso vive fuera de core/.
// Isomórfico: funciona en Node (tests) y en el navegador (Web Worker).

import { extractText, getDocumentProxy } from "unpdf";
import type { PdfTextSource } from "@/core/text/PdfTextSource";

async function extract(bytes: Uint8Array): Promise<string> {
  // getDocumentProxy puede transferir/“detachar” el buffer; pasamos la vista tal cual.
  const pdf = await getDocumentProxy(bytes);
  // mergePages:true -> `text` es un único string con todas las páginas.
  const { text } = await extractText(pdf, { mergePages: true });
  return text ?? "";
}

export const unpdfTextSource: PdfTextSource = { extractText: extract };
