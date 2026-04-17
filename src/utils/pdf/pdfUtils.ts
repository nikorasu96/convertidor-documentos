// src/utils/pdf/pdfUtils.ts
import PDFParser from "pdf2json";
import logger from "../logger";
import type { PDFFormat } from "@/types/pdfFormat";
import { parsePDFWithWorker } from "./pdfWorkerPool";

// Importa los extractores y validadores (ajusta las rutas según tu proyecto)
import { extraerDatosHomologacion, bestEffortValidationHomologacion } from "@/extractors/homologacionExtractor";
import { extraerDatosCRT, bestEffortValidationCRT } from "@/extractors/crtExtractor";
import { extraerDatosSoapSimplificado, bestEffortValidationSoap } from "@/extractors/soapExtractor";
import { extraerDatosPermisoCirculacion, bestEffortValidationPermisoCirculacion } from "@/extractors/permisoCirculacionExtractor";

/**
 * Busca en el texto la primera coincidencia del patrón RegExp y retorna el grupo 1 (si existe).
 * @param text Texto en el cual buscar.
 * @param pattern Patrón a buscar.
 * @returns Cadena encontrada o null.
 */
export function buscar(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  return match && match[1] ? match[1].trim() : null;
}

/**
 * Parsea el contenido de un archivo PDF y extrae el texto.
 * Intenta usar worker threads para paralelismo real; si no están disponibles, usa parseo directo.
 * @param file Archivo PDF.
 * @returns Una promesa que resuelve con el texto extraído.
 */
export async function parsePDFBuffer(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Intentar parseo con worker threads (paralelismo multi-core)
  const workerResult = parsePDFWithWorker(buffer);
  if (workerResult) {
    return workerResult;
  }

  // Fallback: parseo en hilo principal
  return parsePDFBufferDirect(buffer);
}

/**
 * Parseo directo en el hilo principal (fallback cuando workers no están disponibles).
 */
function parsePDFBufferDirect(buffer: Buffer): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const pdfParser = new PDFParser();
    pdfParser.on("pdfParser_dataError", (errData: any) => {
      logger.error("Error en pdfParser_dataError:", errData);
      reject(new Error("Error al parsear el PDF: " + errData.parserError));
    });
    pdfParser.on("pdfParser_dataReady", (data: any) => {
      let allText = "";
      if (data.Pages) {
        allText = data.Pages.map((page: any) =>
          page.Texts.map((t: any) => decodeURIComponent(t.R[0]?.T || "")).join(" ")
        ).join(" ");
      }
      if (!allText.trim()) {
        return reject(new Error("El PDF no contiene texto extraíble o el formato no es válido"));
      }
      resolve(allText);
    });
    pdfParser.parseBuffer(buffer);
  });
}

/**
 * Sanitiza un nombre eliminando acentos y caracteres especiales.
 * @param str Cadena de entrada.
 * @returns Cadena sanitizada.
 */
export function sanitizarNombre(str: string): string {
  let sanitized = str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s\-_().]/gu, "_")
    .trim();
  sanitized = sanitized.replace(/\s+A$/, "");
  return sanitized;
}

/**
 * Detecta el formato del PDF según palabras clave en el texto extraído.
 * @param texto Texto extraído del PDF.
 * @returns El formato detectado (uno de los PDFFormat) o "DESCONOCIDO" si no se identifica.
 */
function detectarFormato(texto: string): PDFFormat | "DESCONOCIDO" {
  const upperText = texto.toUpperCase();
  if (upperText.includes("CERTIFICADO DE HOMOLOGACIÓN")) return "CERTIFICADO_DE_HOMOLOGACION";
  if (upperText.includes("CERTIFICADO DE REVISIÓN TÉCNICA") || upperText.includes("FECHA REVISIÓN")) return "CRT";
  if (upperText.includes("SEGURO OBLIGATORIO") || upperText.includes("SOAP")) return "SOAP";
  if (upperText.includes("PERMISO DE CIRCULACIÓN") || upperText.includes("PLACA ÚNICA")) return "PERMISO_CIRCULACION";
  // Fallback: PDFs de Permiso de Circulación sin etiquetas (ej: municipalidades que emiten sin keywords explícitos)
  // "VERDE-0", "VERDE-1", etc. es el sello verde, exclusivo de Permiso de Circulación
  if (/VERDE-\d/.test(upperText)) return "PERMISO_CIRCULACION";
  return "DESCONOCIDO";
}

/**
 * Función principal que combina el parseo, detección de formato, extracción y validación de datos.
 * @param file Archivo PDF.
 * @param pdfFormat Formato de PDF esperado (opcional).
 * @param returnRegex Indica si se debe retornar la información de regex (por ejemplo, en permiso de circulación).
 * @returns Objeto con las propiedades: datos (los datos extraídos), título (si se extrajo alguno) y regexes (si corresponde).
 */
export async function procesarPDF(
  file: File,
  pdfFormat?: PDFFormat,
  returnRegex = false
): Promise<{ datos: Record<string, string>; titulo?: string; regexes?: Record<string, RegExp> | null }> {
  // 1. Parsear el PDF para obtener el texto
  const allText = await parsePDFBuffer(file);

  // 2. Detectar el formato real del PDF
  const formatoDetectado = detectarFormato(allText);

  // Si se especifica un formato esperado y no coincide, lanzar error con mensaje ajustado
  if (pdfFormat && formatoDetectado !== pdfFormat) {
    throw new Error(
      `El archivo ${file.name} no corresponde al formato esperado (${pdfFormat}). Se detectó que pertenece a: ${
        formatoDetectado === "DESCONOCIDO" ? "Formato Desconocido" : formatoDetectado
      }.`
    );
  }

  // 3. Extraer datos y aplicar validaciones según el formato detectado
  let datos: Record<string, string> = {};
  let titulo: string | undefined;
  let regexes: Record<string, RegExp> | undefined;

  switch (formatoDetectado) {
    case "CERTIFICADO_DE_HOMOLOGACION":
      datos = extraerDatosHomologacion(allText);
      bestEffortValidationHomologacion(datos, file.name);
      titulo = allText.match(/CERTIFICADO DE HOMOLOGACIÓN\s+(.*?)\s+REEMPLAZA/i)?.[1]?.trim();
      break;
    case "CRT":
      datos = extraerDatosCRT(allText);
      bestEffortValidationCRT(datos, file.name);
      break;
    case "SOAP":
      datos = extraerDatosSoapSimplificado(allText);
      bestEffortValidationSoap(datos, file.name);
      break;
    case "PERMISO_CIRCULACION":
      const result = extraerDatosPermisoCirculacion(allText);
      datos = result.data;
      regexes = returnRegex ? result.regexes : undefined;
      bestEffortValidationPermisoCirculacion(datos, file.name);
      break;
    default:
      throw new Error(`El archivo ${file.name} no pudo ser identificado como un formato válido.`);
  }

  return { datos, titulo, regexes: regexes || null };
}
