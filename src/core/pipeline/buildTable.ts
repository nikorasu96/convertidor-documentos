// src/core/pipeline/buildTable.ts
// Transforma los resultados exitosos en una tabla (headers + filas) lista para
// el Excel y para la vista previa. Pura y determinista.
//
// Replica exactamente la normalización y el orden de columnas de la versión
// anterior (separación de dígito verificador, orden por formato) para no romper
// el formato de salida esperado por los usuarios.

import type { PDFFormat } from "../domain/format";
import type { ConversionSuccess } from "../domain/result";
import { normalizePlateWithCheck } from "../extraction/shared";

const CHECK_DIGIT = "digito verificador";
const PLATE_KEYS = ["Patente", "Placa Única", "INSCRIPCION R.V.M"];

export interface Table {
  headers: string[];
  /** Filas alineadas a `headers`. */
  rows: string[][];
}

type Record_ = { [key: string]: string };

/** Aplica la normalización de placa/dígito verificador según el formato. */
function normalize(format: PDFFormat, rec: Record_): Record_ {
  const r: Record_ = { ...rec };

  if (format === "CERTIFICADO_DE_HOMOLOGACION") {
    if (typeof r["Patente"] === "string") r["Patente"] = r["Patente"].replace(/-/g, "").trim();
    delete r[CHECK_DIGIT];
  } else if (format === "PERMISO_CIRCULACION") {
    if (typeof r["Placa Única"] === "string") {
      const n = normalizePlateWithCheck(r["Placa Única"]);
      r["Placa Única"] = n.plate;
      if (n.checkDigit) r[CHECK_DIGIT] = n.checkDigit;
      else delete r[CHECK_DIGIT];
    }
  } else if (format === "SOAP") {
    if (typeof r["INSCRIPCION R.V.M"] === "string") {
      const n = normalizePlateWithCheck(r["INSCRIPCION R.V.M"]);
      r["INSCRIPCION R.V.M"] = n.plate;
      if (n.checkDigit) r[CHECK_DIGIT] = n.checkDigit;
      else delete r[CHECK_DIGIT];
    }
    for (const key of ["Patente", "Placa Única"]) {
      if (typeof r[key] === "string") {
        const m = r[key].match(/^(.+)-(.+)$/);
        if (m) {
          r[key] = m[1].trim();
          r[CHECK_DIGIT] = m[2].trim();
        }
      }
    }
  } else {
    for (const key of PLATE_KEYS) {
      if (typeof r[key] === "string" && r[key].includes("-")) {
        const parts = r[key].split("-");
        if (parts.length > 1) {
          const combined = parts.join("").trim();
          r[key] = combined.substring(0, 6);
          r[CHECK_DIGIT] = combined.substring(6);
        }
      }
    }
  }

  return r;
}

/** Reordena las claves de un registro: Nombre PDF -> campo placa -> dígito -> resto. */
function order(format: PDFFormat, rec: Record_): Record_ {
  const out: Record_ = {};
  if ("Nombre PDF" in rec) out["Nombre PDF"] = rec["Nombre PDF"];

  const pushField = (key: string, withCheck: boolean) => {
    if (key in rec) {
      out[key] = rec[key];
      if (withCheck && CHECK_DIGIT in rec) out[CHECK_DIGIT] = rec[CHECK_DIGIT];
    }
  };

  if (format === "CERTIFICADO_DE_HOMOLOGACION") {
    pushField("Patente", false);
  } else if (format === "PERMISO_CIRCULACION") {
    pushField("Placa Única", true);
  } else if (format === "SOAP") {
    pushField("INSCRIPCION R.V.M", true);
    if ("Patente" in rec) pushField("Patente", true);
    else pushField("Placa Única", true);
  } else {
    if ("Patente" in rec) pushField("Patente", true);
    else if ("Placa Única" in rec) pushField("Placa Única", true);
    else pushField("INSCRIPCION R.V.M", true);
  }

  for (const key of Object.keys(rec)) {
    if (!["Nombre PDF", ...PLATE_KEYS, CHECK_DIGIT].includes(key)) out[key] = rec[key];
  }
  return out;
}

/**
 * Construye la tabla final a partir de los resultados exitosos.
 */
export function buildTable(successes: ReadonlyArray<ConversionSuccess>, format: PDFFormat): Table {
  const ordered = successes.map((s) => order(format, normalize(format, { "Nombre PDF": s.fileName, ...s.data })));

  // Si algún registro tiene dígito verificador, la columna debe existir en todos.
  const hasCheck = ordered.some((r) => CHECK_DIGIT in r);
  if (hasCheck) {
    for (const r of ordered) if (!(CHECK_DIGIT in r)) r[CHECK_DIGIT] = "";
  }

  // Encabezados: unión de claves preservando el orden de aparición.
  const headerSet = new Set<string>();
  for (const r of ordered) for (const k of Object.keys(r)) headerSet.add(k);
  const headers = [...headerSet];

  const rows = ordered.map((r) => headers.map((h) => r[h] ?? ""));
  return { headers, rows };
}
