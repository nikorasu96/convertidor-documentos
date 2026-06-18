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
 * Tope DURO de caracteres extraídos (defensa anti "text-bomb").
 *
 * unpdf, vía `extractText(pdf, { mergePages: true })`, hace `Promise.all` sobre TODAS
 * las páginas y materializa el string concatenado completo ANTES de devolverlo. Un PDF
 * pequeño (≤10MB tras validar) puede declarar texto denso —miles de páginas o muchísimos
 * operadores de texto en una sola— y expandir a cientos de MB / varios GB en el heap del
 * worker, tumbando la pestaña. El recorte de processDocument (MAX_TEXT_LENGTH) corre
 * DESPUÉS de esa materialización, así que no acota el pico transitorio.
 *
 * Aquí extraemos consumiendo el texto en STREAMING (chunk a chunk) con un presupuesto de
 * caracteres: en cuanto se alcanza el tope se CANCELA el stream de la página y se aborta,
 * de modo que pdf.js deja de parsear/emitir el resto del content stream (el vector real
 * de bomba es texto posicionado, que se produce incrementalmente). El resultado nunca
 * excede `maxChars`. Debe ser ≥ MAX_TEXT_LENGTH (2_000_000) de processDocument; ningún
 * documento vehicular real se acerca a este tamaño.
 *
 * Residual conocido y NO totalmente eliminable en cliente: pdf.js descomprime el content
 * stream (Flate, sin tope de ratio) para interpretarlo; una única cadena gigantesca o el
 * buffer crudo descomprimido podrían provocar un pico antes de que el streaming pueda
 * cancelar. Empíricamente pdf.js DESCARTA el texto degenerado de un `Tj` gigante (mide
 * ~0 caracteres), por lo que ese sub-vector es poco efectivo; el impacto queda acotado a
 * un OOM auto-infligido de la pestaña (app 100% cliente, sin backend ni multiusuario),
 * mitigado por el aislamiento + reciclaje de workers. La defensa de producto adicional es
 * bajar MAX_FILE_SIZE al tamaño real de los documentos (requiere el corpus para fijarlo).
 */
const MAX_EXTRACT_CHARS = 2_000_000;

/** Forma mínima de lo que consumimos de pdf.js. Evita acoplarnos al tipo completo y
 *  permite testear `extractBoundedText` con un doble de prueba sin pdf.js real. */
interface TextItemLike {
  str?: string | null;
  hasEOL?: boolean;
}
interface TextChunkLike {
  items?: ReadonlyArray<TextItemLike | unknown>;
}
interface ReaderLike {
  read(): Promise<{ done: boolean; value?: TextChunkLike }>;
  releaseLock?: () => void;
}
interface ReadableLike {
  getReader(): ReaderLike;
}
interface PageLike {
  /** Streaming pull-based: permite cancelar y dejar de materializar el resto. */
  streamTextContent(options?: unknown): ReadableLike;
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
 * pero consumiendo el texto en STREAMING con un presupuesto de `maxChars` y CORTE/
 * CANCELACIÓN tempranos: en cuanto el texto acumulado alcanza el tope, se recorta la
 * última pieza (tope DURO, sin sobrepaso), se cancela el stream de la página y se aborta
 * la iteración de páginas. Así el pico de memoria queda acotado con independencia de
 * cuántas páginas o cuántos operadores de texto declare un PDF malicioso.
 *
 * Exportada para test de regresión determinista (sin pdf.js real).
 */
export async function extractBoundedText(
  doc: DocumentLike,
  maxChars: number = MAX_EXTRACT_CHARS
): Promise<string> {
  const parts: string[] = [];
  let total = 0;
  for (let i = 1; i <= doc.numPages && total < maxChars; i++) {
    const page = await doc.getPage(i);
    try {
      // Separador entre páginas: unpdf une las N páginas con "\n" (incluidas las vacías).
      if (i > 1) {
        parts.push("\n");
        total += 1;
        if (total >= maxChars) break;
      }
      const reader = page.streamTextContent().getReader();
      try {
        let capped = false;
        while (!capped) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const item of value?.items ?? []) {
            if (!isTextItem(item) || item.str == null) continue;
            const piece = item.str + (item.hasEOL ? "\n" : "");
            const remaining = maxChars - total;
            if (piece.length >= remaining) {
              parts.push(piece.slice(0, remaining)); // tope duro: sin sobrepaso
              total = maxChars;
              capped = true;
              break;
            }
            parts.push(piece);
            total += piece.length;
          }
        }
        // Al dejar de leer (capped) el stream pull-based de pdf.js deja de producir; NO
        // llamamos reader.cancel() porque puede lanzar un rechazo asíncrono NO capturable
        // ("Controller is already closed") si compite con el cierre natural del stream y
        // tumbar el worker. La liberación efectiva la hace page.cleanup() / pdf.destroy().
      } finally {
        try {
          reader.releaseLock?.();
        } catch {
          /* releaseLock es best-effort */
        }
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
