// src/core/extraction/registry.ts
// Registro de extractores por formato (single source of truth).
import type { PDFFormat } from "../domain/format";
import type { Extractor } from "./Extractor";
import { homologacionExtractor } from "./formats/homologacion";
import { crtExtractor } from "./formats/crt";
import { soapExtractor } from "./formats/soap";
import { permisoCirculacionExtractor } from "./formats/permisoCirculacion";

const EXTRACTORS: Record<PDFFormat, Extractor> = {
  CERTIFICADO_DE_HOMOLOGACION: homologacionExtractor,
  CRT: crtExtractor,
  SOAP: soapExtractor,
  PERMISO_CIRCULACION: permisoCirculacionExtractor,
};

export function getExtractor(format: PDFFormat): Extractor {
  return EXTRACTORS[format];
}
