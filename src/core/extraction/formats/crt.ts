// src/core/extraction/formats/crt.ts
// Certificado de Revisión Técnica. Acepta PDFs con uno o ambos certificados
// (Revisión Técnica y/o Emisiones Contaminantes).
import type { Extractor } from "../Extractor";
import type { DocumentData } from "../../domain/result";
import { ConversionError } from "../../domain/errors";

const VALIDO_PATTERN =
  /VÁLIDO HASTA(?:\s*FECHA REVISIÓN:)?\s*(?:(\d{1,2}\s+[A-ZÁÉÍÓÚÑ]+\s+\d{4})\s+)?([A-ZÁÉÍÓÚÑ]+\s+\d{4})/i;

function extract(text: string): DocumentData {
  const datos: DocumentData = {};

  const fechaMatch = text.match(/FECHA REVISIÓN:\s*(\d{1,2}\s+[A-ZÁÉÍÓÚÑ]+\s+\d{4})/i);
  datos["Fecha de Revisión"] = fechaMatch ? fechaMatch[1].trim() : "";

  const plantaMatch = text.match(/PLANTA:\s*([A-Z0-9-]+)/i);
  datos["Planta"] = plantaMatch ? plantaMatch[1].trim() : "";

  const placaMatch = text.match(/PLACA PATENTE\s+([A-Z0-9]+)/i);
  datos["Placa Patente"] = placaMatch ? placaMatch[1].trim() : "";

  const revisionSectionMatch = text.match(
    /CERTIFICADO\s+(?:DE\s+)?REVISI[ÓO]N\s+T[EÉ]CNICA([\s\S]*?)(?=CERTIFICADO\s+(?:DE\s+)?(?:EMISIONES\s+)?CONTAMINANTES|$)/i
  );
  const contaminantesSectionMatch = text.match(
    /CERTIFICADO\s+(?:DE\s+)?(?:EMISIONES\s+)?CONTAMINANTES([\s\S]*?)(?=CERTIFICADO\s|$)/i
  );

  datos["Válido Hasta Revisión Técnica"] = "";
  datos["Válido Hasta Contaminantes"] = "";

  if (revisionSectionMatch) {
    const m = revisionSectionMatch[1].match(VALIDO_PATTERN);
    if (m) datos["Válido Hasta Revisión Técnica"] = (m[2] || m[1] || "").trim();
  }

  if (contaminantesSectionMatch) {
    const m = contaminantesSectionMatch[1].match(VALIDO_PATTERN);
    if (m) datos["Válido Hasta Contaminantes"] = (m[2] || m[1] || "").trim();
  }

  if (!revisionSectionMatch && !contaminantesSectionMatch) {
    throw new ConversionError(
      "VALIDATION_ERROR",
      "El PDF no contiene ningún certificado válido (Revisión Técnica o Emisiones Contaminantes)."
    );
  }

  const folioMatch = text.match(/(N°B\d+)/i);
  datos["Folio"] = folioMatch ? folioMatch[1].trim() : "";

  return datos;
}

function validate(data: DocumentData, fileName: string): void {
  const requiredPatterns: Record<string, RegExp> = {
    "Fecha de Revisión": /^\d{1,2}\s+[A-ZÁÉÍÓÚÑ]+\s+\d{4}$/,
    "Placa Patente": /^[A-Z0-9]+$/,
    "Planta": /^.+$/,
    "Folio": /^N°B\d+$/i,
  };
  const optionalPatterns: Record<string, RegExp> = {
    "Válido Hasta Revisión Técnica": /^[A-ZÁÉÍÓÚÑ]+\s+\d{4}$/i,
    "Válido Hasta Contaminantes": /^[A-ZÁÉÍÓÚÑ]+\s+\d{4}$/i,
  };

  const errors: string[] = [];

  for (const [field, pattern] of Object.entries(requiredPatterns)) {
    const value = data[field];
    if (!value) errors.push(`Falta el campo obligatorio "${field}".`);
    else if (!pattern.test(value))
      errors.push(`Campo "${field}" con valor "${value}" no coincide con el formato esperado.`);
  }

  for (const [field, pattern] of Object.entries(optionalPatterns)) {
    const value = data[field];
    if (value && !pattern.test(value))
      errors.push(`Campo "${field}" con valor "${value}" no coincide con el formato esperado.`);
  }

  const hasRT = !!data["Válido Hasta Revisión Técnica"]?.trim();
  const hasCont = !!data["Válido Hasta Contaminantes"]?.trim();
  if (!hasRT && !hasCont) {
    errors.push(
      'Debe haber al menos uno de los campos "Válido Hasta Revisión Técnica" o "Válido Hasta Contaminantes".'
    );
  }

  if (errors.length > 0) {
    throw new ConversionError(
      "VALIDATION_ERROR",
      `El archivo ${fileName} presenta problemas en los datos:\n - ${errors.join("\n - ")}`
    );
  }
}

export const crtExtractor: Extractor = {
  format: "CRT",
  extract,
  validate,
};
