// src/client/engine/convertBatch.ts
// Servicio de aplicación: convierte un lote completo y deja todo listo para la UI
// (tabla de vista previa, estadísticas y archivo Excel). Coordina motor + tabla +
// writer; no contiene lógica de React ni de extracción.

import type { PDFFormat } from "@/core/domain/format";
import type {
  ConversionOutcome,
  ConversionSuccess,
  ConversionFailure,
  ConversionStats,
} from "@/core/domain/result";
import { isSuccess } from "@/core/domain/result";
import { buildTable, type Table } from "@/core/pipeline/buildTable";
import { convertFiles, type Progress } from "./conversionEngine";
import { buildWorkbook, type WorkbookFile } from "@/client/excel/buildWorkbook";
import type { RejectedFile } from "@/client/files/validateFiles";

export interface BatchResult {
  successes: ConversionSuccess[];
  failures: ConversionFailure[];
  table: Table;
  stats: ConversionStats;
  excel: WorkbookFile;
}

export interface BatchOptions {
  signal?: AbortSignal;
  onProgress?: (p: Progress) => void;
  /** Archivos descartados en la validación previa (se reportan como fallos). */
  preRejected?: RejectedFile[];
}

export async function convertBatch(
  files: File[],
  format: PDFFormat,
  opts: BatchOptions = {}
): Promise<BatchResult> {
  const outcomes: ConversionOutcome[] = await convertFiles(files, format, {
    signal: opts.signal,
    onProgress: opts.onProgress,
  });

  const successes = outcomes.filter(isSuccess);

  const preRejectedFailures: ConversionFailure[] = (opts.preRejected ?? []).map((r) => ({
    status: "error",
    fileName: r.fileName,
    code: "FILE_INVALID",
    error: r.error,
  }));
  const failures: ConversionFailure[] = [
    ...outcomes.filter((o): o is ConversionFailure => o.status === "error"),
    ...preRejectedFailures,
  ];

  const table = buildTable(successes, format);

  const stats: ConversionStats = {
    totalProcesados: outcomes.length + preRejectedFailures.length,
    totalExitosos: successes.length,
    totalFallidos: failures.length,
    fallidos: failures.map((f) => ({ fileName: f.fileName, error: f.error })),
  };

  const excel = await buildWorkbook(table, format, stats);

  return { successes, failures, table, stats, excel };
}
