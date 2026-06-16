// src/core/extraction/formats/homologacion.ts
import type { Extractor } from "../Extractor";
import type { DocumentData } from "../../domain/result";
import { ConversionError } from "../../domain/errors";
import { buscar } from "../shared";

function extract(text: string): DocumentData {
  // Colapsamos los espacios/tabs horizontales (preservando los saltos de línea, que
  // el campo "Firmado por" usa como delimitador) a un único espacio. Esto elimina el
  // backtracking catastrófico (ReDoS) del regex de "Modelo" (`\s+(.+?)[ \t]+COLOR`) y
  // del de "Color" ante un run largo de espacios sin la palabra de cierre.
  text = text.replace(/[^\S\r\n]+/g, " ");
  return {
    "Fecha de Emisión": buscar(text, /FECHA DE EMISIÓN\s+([0-9A-Z\/]+)/i) || "",
    "Nº Correlativo": buscar(text, /N[°º]\s*CORRELATIVO\s+([A-Z0-9\-]+)/i) || "",
    "Código Informe Técnico": buscar(text, /CÓDIGO DE INFORME TÉCNICO\s+([A-Z0-9\-]+)/i) || "",
    "Patente": ((): string => {
      const value = buscar(text, /PATENTE\s+([A-Z0-9\-]+)/i) || "";
      const cleaned = value.replace(/-/g, "").replace(/\s/g, "").trim();
      return cleaned.length > 6 ? cleaned.substring(0, 6) : cleaned;
    })(),
    "Válido Hasta": buscar(text, /VÁLIDO HASTA\s+([0-9A-Z\/]+)/i) || "",
    "Tipo de Vehículo": buscar(text, /TIPO DE VEHÍCULO\s+([A-ZÑ]+)/i) || "",
    "Marca": buscar(text, /MARCA\s+([A-Z]+)/i) || "",
    "Año": buscar(text, /AÑO\s+([0-9]{4})/i) || "",
    "Modelo": buscar(text, /MODELO\s+(.+?)[ \t]+COLOR/i) || "",
    // El cuantificador del color está acotado a {1,60} (no `+`). Con `+`, la clase
    // incluye `\s` (que matchea \n, no colapsado aquí) y se solapa con el `\s+` del
    // lookahead, dando backtracking O(n²) ante "COLOR " + letras + muchos \n sin VIN.
    // Acotar a 60 (ningún color real lo excede) lo vuelve lineal sin cambiar la captura.
    "Color": buscar(text, /COLOR\s+([A-Z\s\(\)0-9\.\-]{1,60}?)(?=\s+VIN\b|$)/i) || "",
    "VIN": buscar(text, /VIN\s+([A-Z0-9]+)/i) || "",
    "Nº Motor": ((): string => {
      const motor = buscar(text, /N[°º]\s*MOTOR\s+([A-Z0-9]+(?:\s+[A-Z0-9]+)?)/i) || "";
      return motor.replace(/\s+(C|El)$/i, "").trim();
    })(),
    "Firmado por": ((): string => {
      const firmado = buscar(text, /Firmado por:\s+(.+?)(?=\s+AUDITORÍA|\r?\n|$)/i) || "";
      return firmado.split(/\d{2}\/\d{2}\/\d{4}/)[0].trim();
    })(),
  };
}

function validate(data: DocumentData, fileName: string): void {
  const expectedPatterns: Record<string, RegExp> = {
    "Fecha de Emisión": /^\d{1,2}\/[A-Z]{3}\/\d{4}$/,
    "Nº Correlativo": /^[A-Z0-9\-]+$/,
    "Código Informe Técnico": /^[A-Z0-9\-]+$/,
    "Patente": /^[A-Z0-9]{6}$/i,
    "Válido Hasta": /^[A-Z]{3}\/\d{4}$/,
    "Tipo de Vehículo": /^[A-ZÑ]+$/,
    "Marca": /^[A-Z]+$/,
    "Año": /^\d{4}$/,
    "Modelo": /^.+$/,
    "Color": /^[A-Z\s\(\)0-9\.\-]+\.?$/,
    "VIN": /^[A-Z0-9]+$/,
    "Nº Motor": /^[A-Z0-9 ]+(?:\s*[A-Za-z]+)?$/,
    "Firmado por": /^.+$/,
  };

  const errors: string[] = [];
  for (const [field, pattern] of Object.entries(expectedPatterns)) {
    const value = data[field];
    if (!value) {
      errors.push(`Falta el campo "${field}".`);
    } else if (!pattern.test(value.trim())) {
      errors.push(`Campo "${field}" con valor "${value}" no coincide con el formato esperado.`);
    }
  }

  if (errors.length > 0) {
    throw new ConversionError(
      "VALIDATION_ERROR",
      `El archivo ${fileName} presenta problemas en los datos:\n - ${errors.join("\n - ")}`
    );
  }
}

export const homologacionExtractor: Extractor = {
  format: "CERTIFICADO_DE_HOMOLOGACION",
  extract,
  validate,
};
