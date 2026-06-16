// src/core/extraction/formats/soap.ts
import type { Extractor } from "../Extractor";
import type { DocumentData } from "../../domain/result";
import { ConversionError } from "../../domain/errors";
import { buscar } from "../shared";

function extract(text: string): DocumentData {
  const t = text.replace(/\r?\n|\r/g, " ");

  const inscripcionRegex =
    /INSCRIPC[ÍI]ON\s*R\s*\.?\s*V\s*\.?\s*M\s*\.?\s*(?::|\-)?\s*([A-Z0-9]+\s*-\s*[A-Z0-9]+)/i;
  const inscripcion = (buscar(t, inscripcionRegex) || "").trim();

  const bajoCodigo = (buscar(t, /Bajo\s+el\s+c[óo]digo\s*[:\-]?\s*([A-Z0-9\-]+)/i) || "").trim();

  const rutRegex = /RUT\s*[:\-]?\s*((?:\d{1,3}(?:\.\d{3})+)|\d{7,8})\s*[-]\s*([0-9kK])/i;
  const rutMatch = t.match(rutRegex);
  const rut = rutMatch ? `${rutMatch[1].replace(/[.\s]/g, "")}-${rutMatch[2]}` : "";

  const rigeDesde = (buscar(t, /RIGE\s+DESDE\s*[:\-]?\s*(\d{2}[-/]\d{2}[-/]\d{4})/i) || "").trim();
  const hasta = (buscar(t, /HAST(?:\s*A)?\s*[:\-]?\s*(\d{2}[-/]\d{2}[-/]\d{4})/i) || "").trim();

  const poliza = (buscar(t, /POLI[ZS]A\s*N[°º]?\s*[:\-]?\s*([A-Z0-9]+\s*-\s*[A-Z0-9]+)/i) || "")
    .trim()
    .replace(/\s*-\s*/, "-");

  const prima = (buscar(t, /PRIMA\s*[:\-]?\s*([\d\.]+)/i) || "").trim();

  return {
    "INSCRIPCION R.V.M": inscripcion,
    "Bajo el codigo": bajoCodigo,
    "RUT": rut,
    "RIGE DESDE": rigeDesde,
    "HASTA": hasta,
    "POLIZA N°": poliza,
    "PRIMA": prima,
  };
}

function validate(data: DocumentData, fileName: string): void {
  const expectedPatterns: Record<string, RegExp> = {
    "INSCRIPCION R.V.M": /^[A-Z0-9]{6,}\s*-\s*[A-Z0-9]$/i,
    "Bajo el codigo": /^[A-Z0-9\-]+$/,
    "RUT": /^(?:\d{7,8}|(?:\d{1,3}(?:\.\d{3})+))-[0-9kK]$/,
    "RIGE DESDE": /^\d{2}[-/]\d{2}[-/]\d{4}$/,
    "HASTA": /^\d{2}[-/]\d{2}[-/]\d{4}$/,
    "POLIZA N°": /^\d{6,9}-[A-Z0-9]$/i,
    "PRIMA": /^[\d\.]+$/,
  };

  const errors: string[] = [];
  for (const [field, pattern] of Object.entries(expectedPatterns)) {
    const value = data[field];
    if (!value || value.trim().length < 3) {
      errors.push(`El campo "${field}" está incompleto (menos de 3 caracteres).`);
    } else if (!pattern.test(value)) {
      errors.push(`El campo "${field}" con valor "${value}" no coincide con el formato esperado.`);
    }
  }

  if (errors.length > 0) {
    throw new ConversionError(
      "VALIDATION_ERROR",
      `El archivo ${fileName} presenta problemas en los datos:\n - ${errors.join("\n - ")}`
    );
  }
}

export const soapExtractor: Extractor = {
  format: "SOAP",
  extract,
  validate,
};
