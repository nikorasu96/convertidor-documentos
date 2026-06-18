// Regresión de DoS por "text-bomb": la extracción debe acotar el pico de memoria
// consumiendo el texto en STREAMING y DEJANDO DE LEER en cuanto se llena el presupuesto,
// sin materializar el resto del content stream. Antes del 1er fix, unpdf hacía Promise.all
// sobre las 1000 páginas (medido: ~1.1 GB de heap desde 0.72 MB). El 1er fix
// (getTextContent por página) dejó un bypass intra-página; este test cubre el fix con
// streaming pull-based. Validado empíricamente con PDFs-bomba reales (1000 págs y 1 pág
// con 400k líneas posicionadas): pico de heap acotado a ~40 MB en vez de >1 GB.
import { describe, it, expect } from "vitest";
import { extractBoundedText } from "@/infra/pdf/unpdfTextSource";

interface FakeItem {
  str?: string | null;
  hasEOL?: boolean;
}
interface FakeChunk {
  items: FakeItem[];
}

/** Doble de un PDFDocumentProxy con páginas que entregan chunks PRE-construidos vía
 *  streamTextContent. Registra páginas pedidas y liberadas. */
function makeDoc(numPages: number, chunksForPage: (page: number) => FakeChunk[]) {
  const requestedPages: number[] = [];
  const cleanedPages: number[] = [];
  return {
    requestedPages,
    cleanedPages,
    numPages,
    async getPage(n: number) {
      requestedPages.push(n);
      const chunks = chunksForPage(n);
      let idx = 0;
      return {
        streamTextContent() {
          return {
            getReader() {
              return {
                async read() {
                  if (idx >= chunks.length) return { done: true, value: undefined };
                  return { done: false, value: chunks[idx++] };
                },
                releaseLock() {},
              };
            },
          };
        },
        cleanup() {
          cleanedPages.push(n);
          return true;
        },
      };
    },
  };
}

/** Doble que genera chunks PEREZOSAMENTE (no pre-construye nada): simula el coste real
 *  de materialización de pdf.js, de modo que si el código NO dejara de leer, drenaría
 *  hasta `safetyMaxChunks` (test colgado). Permite afirmar el corte temprano de verdad. */
function makeBombDoc(numPages: number, charsPerItem: number, safetyMaxChunks = 5_000_000) {
  const stats = {
    requestedPages: [] as number[],
    pulledChunks: 0,
    cleanedPages: [] as number[],
  };
  return {
    stats,
    numPages,
    async getPage(n: number) {
      stats.requestedPages.push(n);
      let produced = 0;
      return {
        streamTextContent() {
          return {
            getReader() {
              return {
                async read() {
                  if (produced >= safetyMaxChunks) return { done: true, value: undefined };
                  produced++;
                  stats.pulledChunks++;
                  return { done: false, value: { items: [{ str: "x".repeat(charsPerItem) }] } };
                },
                releaseLock() {},
              };
            },
          };
        },
        cleanup() {
          stats.cleanedPages.push(n);
          return true;
        },
      };
    },
  };
}

describe("extractBoundedText (anti text-bomb, streaming)", () => {
  it("deja de leer el stream a media página sin drenar todo (bypass intra-página)", async () => {
    // Una sola página que produciría texto sin fin: 1000 chars por chunk.
    const doc = makeBombDoc(1, 1000);

    const text = await extractBoundedText(doc, 2_000_000);

    // Tope DURO: nunca excede maxChars.
    expect(text.length).toBe(2_000_000);
    // Clave: solo se tiraron ~2000 chunks (2e6/1000), MUY lejos del safetyMax (5e6).
    // El break interrumpe la materialización intra-página (stream pull-based).
    expect(doc.stats.pulledChunks).toBeLessThanOrEqual(2001);
    expect(doc.stats.cleanedPages).toEqual([1]);
  });

  it("corta entre páginas: no pide las páginas restantes cuando ya se llenó el presupuesto", async () => {
    const doc = makeBombDoc(1000, 1000); // 1000 páginas, pero la 1ª ya llena el tope
    const text = await extractBoundedText(doc, 2_000_000);
    expect(text.length).toBe(2_000_000);
    // No se pidió la página 2..1000 -> el pico no depende del nº de páginas.
    expect(doc.stats.requestedPages).toEqual([1]);
  });

  it("replica la normalización de unpdf (str+EOL por item, páginas unidas por \\n, \\s+ -> ' ')", async () => {
    const doc = makeDoc(2, (n) =>
      n === 1 ? [{ items: [{ str: "AB" }, { str: "CD", hasEOL: true }] }] : [{ items: [{ str: "EF" }] }]
    );
    // unpdf: page1="ABCD\n", page2="EF"; join("\n") -> "ABCD\n\nEF"; \s+->" " -> "ABCD EF"
    const text = await extractBoundedText(doc, 2_000_000);
    expect(text).toBe("ABCD EF");
  });

  it("acumula varios chunks de una misma página y respeta el orden", async () => {
    const doc = makeDoc(1, () => [{ items: [{ str: "HO" }] }, { items: [{ str: "LA" }] }]);
    const text = await extractBoundedText(doc, 2_000_000);
    expect(text).toBe("HOLA");
  });

  it("ignora items sin str y libera (cleanup) cada página procesada", async () => {
    const doc = makeDoc(2, (n) =>
      n === 1 ? [{ items: [{ str: null }, {} as FakeItem, { str: "HOLA" }] }] : [{ items: [{ str: "MUNDO" }] }]
    );
    const text = await extractBoundedText(doc, 2_000_000);
    expect(text).toBe("HOLA MUNDO");
    expect(doc.cleanedPages).toEqual([1, 2]);
  });

  it("no añade separador antes de la primera página", async () => {
    const doc = makeDoc(1, () => [{ items: [{ str: "SOLO" }] }]);
    const text = await extractBoundedText(doc, 2_000_000);
    expect(text).toBe("SOLO");
  });
});
