// Regresión de ReDoS: entradas patológicas (runs largos de espacios que casi-casan
// los patrones de extracción) deben resolverse en tiempo lineal. Antes del fix, el
// regex de "Modelo" (homologación) y varios de SOAP tenían backtracking catastrófico:
// 6.000 espacios tardaban ~20-30s. Tras colapsar el whitespace, son microsegundos.
// Umbral generoso (1s) para no ser flaky pero atrapar cualquier regresión catastrófica.
import { describe, it, expect } from "vitest";
import { homologacionExtractor } from "@/core/extraction/formats/homologacion";
import { soapExtractor } from "@/core/extraction/formats/soap";
import { permisoCirculacionExtractor } from "@/core/extraction/formats/permisoCirculacion";

const THRESHOLD_MS = 1000;

function timed(fn: () => void): number {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

describe("ReDoS regression", () => {
  it("homologación: MODELO seguido de un run enorme de espacios sin COLOR termina rápido", () => {
    const evil = "CERTIFICADO DE HOMOLOGACIÓN MODELO " + " ".repeat(50_000) + "Z";
    const ms = timed(() => homologacionExtractor.extract(evil));
    expect(ms).toBeLessThan(THRESHOLD_MS);
  });

  it("homologación: COLOR seguido de un run enorme de espacios termina rápido", () => {
    const evil = "COLOR " + " ".repeat(50_000) + "X";
    const ms = timed(() => homologacionExtractor.extract(evil));
    expect(ms).toBeLessThan(THRESHOLD_MS);
  });

  it("homologación: COLOR + letras + run de saltos de línea sin VIN termina rápido (clase con \\s)", () => {
    // Antes del clamp {1,60}, la clase del color incluía \s (matchea \n, no colapsado)
    // y se solapaba con el \s+ del lookahead -> O(n²). Con el clamp es lineal.
    const evil = "COLOR " + "A".repeat(60_000) + "\n".repeat(60_000);
    const ms = timed(() => homologacionExtractor.extract(evil));
    expect(ms).toBeLessThan(THRESHOLD_MS);
  });

  it("permiso (extractUnlabeled): run enorme de '.000' sin guion no cuelga el strip de RUT", () => {
    // Texto que enruta a Permiso (PLACA ÚNICA) y cae en extractUnlabeled (<3 campos
    // clave), golpeando el replace de RUT /\\d{1,3}(?:\\.\\d{3}){0,4}-[\\dkK]/g.
    const evil = "PLACA ÚNICA\n1" + ".000".repeat(200_000);
    const ms = timed(() => permisoCirculacionExtractor.extract(evil));
    expect(ms).toBeLessThan(THRESHOLD_MS);
  });

  it("SOAP: tokens + runs enormes de espacios (INSCRIPCION/HASTA/RIGE/RUT/POLIZA) terminan rápido", () => {
    const evil =
      "INSCRIPCION R.V.M " +
      " ".repeat(40_000) +
      "HASTA " +
      " ".repeat(40_000) +
      "RIGE DESDE " +
      " ".repeat(40_000) +
      "RUT " +
      " ".repeat(40_000) +
      "POLIZA N° " +
      " ".repeat(40_000);
    const ms = timed(() => soapExtractor.extract(evil));
    expect(ms).toBeLessThan(THRESHOLD_MS);
  });
});
