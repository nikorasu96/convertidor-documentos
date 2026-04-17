// src/services/pdfService.ts
import pLimit from "p-limit";
import { procesarPDF } from "@/utils/pdf/pdfUtils";
import { generateExcel, ExcelStats } from "@/utils/excel/excelUtils"; // <-- Usamos la función generateExcel
import type { PDFFormat } from "@/types/pdfFormat";

export type ConversionSuccess = {
  fileName: string;
  datos: Record<string, string>;
  titulo?: string;
  regexes?: Record<string, RegExp> | null;
};

export type ConversionFailure = {
  fileName: string;
  error: string;
};

// Exportamos SettledFailure para que otros módulos puedan importarlo si lo requieren
export type SettledFailure = {
  status: "rejected";
  reason: {
    fileName: string;
    error: string;
  };
};

// Elimina el genérico T y usa ConversionSuccess directamente
type SettledSuccess = { status: "fulfilled"; value: ConversionSuccess };
export type SettledResult = SettledSuccess | SettledFailure;

interface ProcessOptions {
  files: File[];
  pdfFormat: PDFFormat;
  returnRegex: boolean;
  onEvent: (data: any) => void;
  concurrency?: number; // Nuevo parámetro opcional
}

/**
 * Procesa un arreglo de archivos PDF con p-limit para concurrencia controlada.
 * Emite eventos de progreso con throttle adaptativo y retorna un arreglo de resultados "settled" para cada archivo.
 */
export async function processPDFFiles({
  files,
  pdfFormat,
  returnRegex,
  onEvent,
  concurrency = 15,
}: ProcessOptions): Promise<SettledResult[]> {
  const limit = pLimit(concurrency);
  const totalFiles = files.length;
  let processedCount = 0;
  let successesCount = 0;
  let failuresCount = 0;
  const start = Date.now();

  // Throttle adaptativo: menos eventos SSE para lotes grandes
  const throttleInterval = totalFiles < 50 ? 1 : totalFiles < 500 ? 5 : 20;

  const promises: Array<Promise<SettledResult>> = files.map((file) =>
    limit(async () => {
      try {
        const result = await procesarPDF(file, pdfFormat, returnRegex);
        processedCount++;
        successesCount++;
        const elapsedMsSoFar = Date.now() - start;

        // Solo emitir SSE cada N archivos o al final
        if (processedCount % throttleInterval === 0 || processedCount === totalFiles) {
          const avgTimePerFile = elapsedMsSoFar / processedCount;
          const remaining = totalFiles - processedCount;
          const estimatedMsLeft = Math.round(avgTimePerFile * remaining);

          onEvent({
            progress: processedCount,
            total: totalFiles,
            file: file.name,
            status: "fulfilled",
            estimatedMsLeft,
            elapsedMsSoFar,
            successes: successesCount,
            failures: failuresCount,
          });
        }

        return {
          status: "fulfilled",
          value: {
            fileName: file.name,
            ...result,
          },
        } as SettledSuccess;
      } catch (error: any) {
        processedCount++;
        failuresCount++;
        const elapsedMsSoFar = Date.now() - start;

        let errorMsg = error.message || "Error desconocido";
        if (errorMsg.includes("Se detectó que pertenece a:")) {
          errorMsg = errorMsg.replace(
            /Se detectó que pertenece a:\s*(.*)/,
            '<span style="background-color: yellow; font-weight: bold;">Se detectó que pertenece a: $1</span>'
          );
        }

        // Siempre emitir eventos de error para visibilidad
        if (processedCount % throttleInterval === 0 || processedCount === totalFiles) {
          const avgTimePerFile = elapsedMsSoFar / processedCount;
          const remaining = totalFiles - processedCount;
          const estimatedMsLeft = Math.round(avgTimePerFile * remaining);

          onEvent({
            progress: processedCount,
            total: totalFiles,
            file: file.name,
            status: "rejected",
            error: errorMsg,
            estimatedMsLeft,
            elapsedMsSoFar,
            successes: successesCount,
            failures: failuresCount,
          });
        }

        return {
          status: "rejected",
          reason: {
            fileName: file.name,
            error: errorMsg,
          },
        } as SettledFailure;
      }
    })
  );

  return Promise.all(promises);
}

/**
 * Genera un Excel a partir de los resultados exitosos y, opcionalmente, incluye la hoja de estadísticas.
 * Llama internamente a generateExcel (definida en excelUtils.ts).
 */
export async function generateExcelFromResults(
  successes: ConversionSuccess[],
  pdfFormat: PDFFormat,
  stats?: ExcelStats
): Promise<{ excelBuffer: Buffer; fileName: string }> {
  let baseFileName = "";
  switch (pdfFormat) {
    case "CERTIFICADO_DE_HOMOLOGACION":
      baseFileName = "Certificado de Homologación";
      break;
    case "CRT":
      baseFileName = "Certificado de Revisión Técnica (CRT)";
      break;
    case "SOAP":
      baseFileName = "Seguro Obligatorio (SOAP)";
      break;
    case "PERMISO_CIRCULACION":
      baseFileName = "Permiso de Circulación";
      break;
    default:
      baseFileName = "Consolidado";
  }

  // Siempre usar el nombre base, nunca el título extraído del PDF
  const nombreArchivo = baseFileName;

  const registros = successes.map((r) => ({
    "Nombre PDF": r.fileName,
    ...r.datos, // Los campos extraídos del PDF
  })) as Array<{ [key: string]: any }>;

  const { buffer, encodedName } = await generateExcel(registros, nombreArchivo, pdfFormat, stats);
  return { excelBuffer: buffer, fileName: encodedName };
}
