// Regresión de DoS por "text-bomb": la extracción debe acotar el pico de memoria
// cortando ANTES de materializar todas las páginas, y debe replicar exactamente la
// normalización de unpdf. Antes del fix, unpdf hacía Promise.all sobre las 1000 páginas
// y concatenaba el string completo (medido: ~1.1 GB de heap desde un PDF de 0.72 MB)
// antes de que processDocument pudiera recortarlo.
import { describe, it, expect } from "vitest";
import { extractBoundedText } from "@/infra/pdf/unpdfTextSource";

interface FakeItem {
  str?: string | null;
  hasEOL?: boolean;
}

/** Doble de prueba de un PDFDocumentProxy: registra qué páginas se piden y cuáles se
 *  liberan, para poder afirmar que NO se itera el documento completo (corte temprano)
 *  y que cada página procesada se libera (sin fuga). */
function makeDoc(numPages: number, itemsForPage: (page: number) => FakeItem[]) {
  const requestedPages: number[] = [];
  const cleanedPages: number[] = [];
  return {
    requestedPages,
    cleanedPages,
    numPages,
    async getPage(n: number) {
      requestedPages.push(n);
      return {
        async getTextContent() {
          return { items: itemsForPage(n) };
        },
        cleanup() {
          cleanedPages.push(n);
          return true;
        },
      };
    },
  };
}

describe("extractBoundedText (anti text-bomb)", () => {
  it("corta antes de materializar todas las páginas cuando el texto supera el tope", async () => {
    // 1000 páginas × (10.000 items × 100 chars) = 1e9 chars si se materializara todo (OOM).
    // pdf.js emite items cortos, así que el sobrepaso del corte es ≤ 1 item (100 chars).
    const ITEM = "x".repeat(100);
    const pageItems = Array.from({ length: 10_000 }, () => ({ str: ITEM }));
    const doc = makeDoc(1000, () => pageItems);

    const text = await extractBoundedText(doc, 2_000_000);

    // El resultado queda acotado al tope (+ a lo sumo un item de sobrepaso); los 'x' no
    // colapsan por no ser whitespace. Lejísimos de los 1e9 chars del caso sin acotar.
    expect(text.length).toBeLessThanOrEqual(2_000_000 + ITEM.length);
    expect(text.length).toBeGreaterThanOrEqual(2_000_000);
    // Clave: NO se pidieron las 1000 páginas; se cortó tras unas pocas -> pico acotado.
    expect(doc.requestedPages.length).toBeLessThanOrEqual(3);
    expect(doc.requestedPages.length).toBeGreaterThan(0);
  });

  it("corta dentro de una sola página gigante (no depende del nº de páginas)", async () => {
    const doc = makeDoc(1, () => Array.from({ length: 10_000 }, () => ({ str: "y".repeat(10_000) })));
    const text = await extractBoundedText(doc, 2_000_000);
    expect(text.length).toBeLessThanOrEqual(2_000_000);
    expect(doc.requestedPages).toEqual([1]);
  });

  it("replica la normalización de unpdf (str+EOL por item, páginas unidas por \\n, \\s+ -> ' ')", async () => {
    const doc = makeDoc(2, (n) =>
      n === 1 ? [{ str: "AB" }, { str: "CD", hasEOL: true }] : [{ str: "EF" }]
    );
    // unpdf: page1="ABCD\n", page2="EF"; join("\n") -> "ABCD\n\nEF"; \s+->" " -> "ABCD EF"
    const text = await extractBoundedText(doc, 2_000_000);
    expect(text).toBe("ABCD EF");
  });

  it("ignora items sin str y libera (cleanup) cada página procesada", async () => {
    const doc = makeDoc(2, (n) =>
      n === 1 ? [{ str: null }, {}, { str: "HOLA" }] : [{ str: "MUNDO" }]
    );
    const text = await extractBoundedText(doc, 2_000_000);
    expect(text).toBe("HOLA MUNDO");
    expect(doc.cleanedPages).toEqual([1, 2]);
  });

  it("no añade separador antes de la primera página", async () => {
    const doc = makeDoc(1, () => [{ str: "SOLO" }]);
    const text = await extractBoundedText(doc, 2_000_000);
    expect(text).toBe("SOLO");
  });
});
