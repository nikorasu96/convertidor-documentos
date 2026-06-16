// src/core/extraction/formats/permisoCirculacion.ts
// Permiso de Circulación. Intenta primero con regex etiquetados; si la mayoría
// de los campos quedan vacíos, recurre a extracción por patrones (sin etiquetas),
// usada por municipios que emiten PDFs sin labels explícitos.
import type { Extractor } from "../Extractor";
import type { DocumentData } from "../../domain/result";
import { ConversionError } from "../../domain/errors";
import { buscar } from "../shared";

const LABELED_REGEXES: Record<string, RegExp> = {
  "Placa Única": /Placa\s+Única\s*[:\-]?\s*([A-Z0-9\-]+)/i,
  "Código SII": /Codigo\s+SII\s*[:\-]?\s*([A-Z0-9]+)/i,
  "Valor Permiso": /Valor\s+Permiso\s*[:\-]?\s*(\d+)/i,
  "Pago total": /Pago\s+total\s*[:\-]?\s*(X)?/i,
  "Pago Cuota 1": /Pago\s+cuota\s+1\s*[:\-]?\s*(X)?/i,
  "Pago Cuota 2": /Pago\s+cuota\s+2\s*[:\-]?\s*(X)?/i,
  "Total a pagar": /Total\s+a\s+pagar\s*[:\-]?\s*(\d+)/i,
  "Fecha de emisión": /Fecha(?:\s+de)?\s+emisi[oó]n\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i,
  "Fecha de vencimiento": /Fecha(?:\s+de)?\s+vencimiento\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i,
  "Forma de Pago": /Forma\s+de\s+Pago\s*[:\-]?\s*(\w+)/i,
};

/** Extracción por patrones para PDFs sin etiquetas (valores sueltos en el texto). */
function extractUnlabeled(t: string): DocumentData {
  const data: DocumentData = {};

  const placaMatch =
    t.match(/\b([A-Z]{4}\d{2}-[A-Z0-9K])\b/i) || t.match(/\b([A-Z]{2}\d{4}-\d)\b/i);
  data["Placa Única"] = placaMatch ? placaMatch[1] : "";

  const fechasSlash = t.match(/\b\d{2}\/\d{2}\/\d{4}\b/g) || [];
  const fechasDash = (t.match(/\b\d{2}-\d{2}-\d{4}\b/g) || []).map((f) => f.replace(/-/g, "/"));
  const fechasUnicas = [...new Set([...fechasSlash, ...fechasDash])];
  if (fechasUnicas.length >= 2) {
    const sorted = fechasUnicas
      .map((f) => {
        const [d, m, y] = f.split("/").map(Number);
        return { str: f, ts: new Date(y, m - 1, d).getTime() };
      })
      .sort((a, b) => a.ts - b.ts);
    data["Fecha de emisión"] = sorted[0].str;
    data["Fecha de vencimiento"] = sorted[sorted.length - 1].str;
  } else if (fechasUnicas.length === 1) {
    data["Fecha de emisión"] = fechasUnicas[0];
    data["Fecha de vencimiento"] = "";
  } else {
    data["Fecha de emisión"] = "";
    data["Fecha de vencimiento"] = "";
  }

  data["Código SII"] = "";

  const moneyMatches = t.match(/\b(\d{1,3}\.\d{3})\b/g) || [];
  if (moneyMatches.length > 0) {
    const freq: Record<string, number> = {};
    for (const m of moneyMatches) freq[m] = (freq[m] || 0) + 1;
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
    data["Valor Permiso"] = sorted[0][0].replace(/\./g, "");
  } else {
    data["Valor Permiso"] = "";
  }

  data["Total a pagar"] = data["Valor Permiso"];
  data["Pago total"] = /\bX\b/.test(t) ? "X" : "No aplica";
  data["Pago Cuota 1"] = "No aplica";
  data["Pago Cuota 2"] = "No aplica";

  if (/firma\s+electr[oó]nica\s+avanzada/i.test(t) || /Digitally\s+signed/i.test(t)) {
    data["Forma de Pago"] = "Internet";
  } else {
    data["Forma de Pago"] = "Presencial";
  }

  return data;
}

function extract(text: string): DocumentData {
  const t = text.replace(/\r?\n|\r/g, " ");

  const data: DocumentData = {};
  for (const key in LABELED_REGEXES) {
    data[key] = buscar(t, LABELED_REGEXES[key]) || "";
  }

  for (const key in data) {
    if (data[key].trim() === "") {
      data[key] = ["Pago total", "Pago Cuota 1", "Pago Cuota 2"].includes(key) ? "No aplica" : "";
    }
  }

  const camposClave = [
    "Placa Única",
    "Valor Permiso",
    "Total a pagar",
    "Fecha de emisión",
    "Fecha de vencimiento",
  ];
  const camposLlenos = camposClave.filter((f) => data[f] && data[f].trim() !== "").length;

  if (camposLlenos < 3) {
    return extractUnlabeled(t);
  }

  return data;
}

function validate(data: DocumentData, fileName: string): void {
  const errors: string[] = [];

  const obligatorios = [
    "Placa Única",
    "Valor Permiso",
    "Total a pagar",
    "Fecha de emisión",
    "Fecha de vencimiento",
  ];
  for (const field of obligatorios) {
    const value = data[field];
    if (!value || value.trim().length < 3) {
      errors.push(`Campo "${field}" es obligatorio y debe tener al menos 3 caracteres.`);
    }
  }

  const opcionales = ["Código SII", "Forma de Pago"];
  for (const field of opcionales) {
    const value = data[field];
    if (value && value.trim().length > 0 && value.trim().length < 3) {
      errors.push(`Campo "${field}" debe tener al menos 3 caracteres si está presente.`);
    }
  }

  const pagosPattern: Record<string, RegExp> = {
    "Pago total": /^(X|No aplica)$/i,
    "Pago Cuota 1": /^(X|No aplica)$/i,
    "Pago Cuota 2": /^(X|No aplica)$/i,
  };
  for (const field of Object.keys(pagosPattern)) {
    if (!pagosPattern[field].test(data[field])) {
      errors.push(`Campo "${field}" con valor "${data[field]}" no es válido.`);
    }
  }

  if (errors.length > 0) {
    throw new ConversionError(
      "VALIDATION_ERROR",
      `El archivo ${fileName} presenta problemas:\n - ${errors.join("\n - ")}`
    );
  }
}

export const permisoCirculacionExtractor: Extractor = {
  format: "PERMISO_CIRCULACION",
  extract,
  validate,
};
