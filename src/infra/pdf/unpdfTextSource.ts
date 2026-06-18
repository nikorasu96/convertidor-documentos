// src/infra/pdf/unpdfTextSource.ts
// Adaptador concreto de PdfTextSource usando unpdf (pdfjs).
// Es infraestructura (depende de una librería externa), por eso vive fuera de core/.
// Isomórfico: funciona en Node (tests) y en el navegador (Web Worker).

import { getDocumentProxy } from "unpdf";
import type { PdfTextSource } from "@/core/text/PdfTextSource";

/** Tope de páginas por documento. Un PDF puede declarar un árbol de páginas enorme y
 *  forzar a pdf.js a iterar miles de páginas (amplificación CPU/memoria). Ningún
 *  documento vehicular legítimo se acerca a este número. */
const MAX_PAGES = 1000;

/**
 * Tope de caracteres acumulados DURANTE la extracción (defensa anti "text-bomb").
 *
 * unpdf, vía `extractText(pdf, { mergePages: true })`, hace `Promise.all` sobre TODAS
 * las páginas y materializa el string concatenado completo ANTES de devolverlo. Un PDF
 * pequeño (≤10MB tras validar) puede declarar hasta MAX_PAGES páginas de texto denso y
 * expandir a cientos de MB / varios GB en el heap del worker, tumbando la pestaña. El
 * recorte de processDocument (MAX_TEXT_LENGTH) corre DESPUÉS de esa materialización, así
 * que no acota el pico transitorio.
 *
 * Por eso extraemos página a página de forma SECUENCIAL y cortamos en cuanto se alcanza
 * este tope: nunca se materializa el texto de las páginas restantes. Debe ser ≥
 * MAX_TEXT_LENGTH (2_000_000) de processDocument para no recortar contenido legítimo
 * antes que aquel; ningún documento vehicular real se acerca a este tamaño.
 */
const MAX_EXTRACT_CHARS = 2_000_000;

/** Forma mínima de lo que consumimos de pdf.js. Evita acoplarnos al tipo completo y
 *  permite testear `extractBoundedText` con un doble de prueba sin pdf.js real. */
interface TextItemLike {
  str?: string | null;
  hasEOL?: boolean;
}
interface PageLike {
  getTextContent(): Promise<{ items: ReadonlyArray<TextItemLike | unknown> }>;
  cleanup?: (resetStats?: boolean) => unknown;
}
interface DocumentLike {
  numPages: number;
  getPage(pageNumber: number): Promise<PageLike>;
}

function isTextItem(item: TextItemLike | unknown): item is TextItemLike {
  return typeof item === "object" && item !== null && "str" in item;
}

/**
 * Extrae el texto de un documento página a página replicando EXACTAMENTE la
 * normalización de unpdf —por página `items.map(i => i.str + (i.hasEOL ? "\n" : "")).
 * join("")`, páginas unidas por "\n", y finalmente `\s+` colapsado a un solo espacio—
 * pero con CORTE TEMPRANO por longitud acumulada: deja de pedir páginas (y de iterar
 * items) en cuanto se alcanza `maxChars`. Así el pico de memoria queda acotado y NO
 * depende de cuántas páginas densas declare un PDF malicioso.
 *
 * Exportada para test de regresión determinista (sin pdf.js real).
 */
export async function extractBoundedText(
  doc: DocumentLike,
  maxChars: number = MAX_EXTRACT_CHARS
): Promise<string> {
  const parts: string[] = [];
  let total = 0;
  for (let i = 1; i <= doc.numPages; i++) {
    if (total >= maxChars) break; // corte entre páginas: no materializa el resto del PDF
    const page = await doc.getPage(i);
    try {
      const { items } = await page.getTextContent();
      if (i > 1) {
        parts.push("\n");
        total += 1;
      }
      for (const item of items) {
        if (!isTextItem(item) || item.str == null) continue;
        const piece = item.str + (item.hasEOL ? "\n" : "");
        parts.push(piece);
        total += piece.length;
        if (total >= maxChars) break; // corte dentro de la página
      }
    } finally {
      // Libera la página procesada (best-effort): sin esto pdf.js retiene fuentes/streams
      // de cada página y la memoria crece de forma monótona en documentos largos.
      try {
        page.cleanup?.();
      } catch {
        /* liberar la página no debe enmascarar el resultado/causa real */
      }
    }
  }
  return parts.join("").replace(/\s+/g, " ");
}

async function extract(bytes: Uint8Array): Promise<string> {
  // getDocumentProxy puede transferir/“detachar” el buffer; pasamos la vista tal cual.
  const pdf = await getDocumentProxy(bytes);
  try {
    if (typeof pdf.numPages === "number" && pdf.numPages > MAX_PAGES) {
      throw new Error(`El PDF declara ${pdf.numPages} páginas (máximo ${MAX_PAGES}).`);
    }
    return await extractBoundedText(pdf);
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
