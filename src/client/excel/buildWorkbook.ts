// src/client/excel/buildWorkbook.ts
// Genera el archivo Excel en el navegador a partir de una tabla ya construida
// (headers + filas) y, opcionalmente, estadísticas. Conserva el formato de salida
// anterior: hoja "Datos" + hoja "Estadisticas", anchos de columna y altura de fila.

import type { PDFFormat } from "@/core/domain/format";
import { EXCEL_BASE_FILENAME } from "@/core/domain/format";
import type { ConversionStats } from "@/core/domain/result";
import { sanitizarNombre } from "@/core/extraction/shared";
import type { Table } from "@/core/pipeline/buildTable";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const COLUMN_WIDTH_FACTOR = 1.2;
const MIN_COLUMN_WIDTH = 10;
const BASE_ROW_HEIGHT = 15;
const APPROX_CHARS_PER_LINE = 20;

export interface WorkbookFile {
  blob: Blob;
  fileName: string;
}

/** Elimina etiquetas HTML de un valor (defensa: los mensajes de error van a una celda). */
function stripHtml(value: unknown): string {
  return String(value ?? "").replace(/<[^>]*>/g, "");
}

function setColumnWidths(sheet: any, headers: string[], rows: string[][]): void {
  const maxLengths = headers.map((h) => h.length);
  for (const row of rows) {
    for (let i = 0; i < headers.length; i++) {
      const len = (row[i] ?? "").length;
      if (len > maxLengths[i]) maxLengths[i] = len;
    }
  }
  for (let i = 0; i < headers.length; i++) {
    sheet.column(i + 1).width(Math.max(maxLengths[i] * COLUMN_WIDTH_FACTOR, MIN_COLUMN_WIDTH));
  }
}

function setRowHeights(sheet: any, rows: string[][]): void {
  rows.forEach((row, rowIndex) => {
    const first = row[0] ?? "";
    const lineCount = Math.max(1, Math.ceil(first.length / APPROX_CHARS_PER_LINE));
    sheet.row(rowIndex + 2).height(BASE_ROW_HEIGHT * lineCount);
  });
}

/**
 * Construye el libro de Excel y lo devuelve como Blob descargable.
 */
export async function buildWorkbook(
  table: Table,
  format: PDFFormat,
  stats?: ConversionStats
): Promise<WorkbookFile> {
  // Carga dinámica del build de navegador de xlsx-populate (sin dependencia de
  // `fs`). Al ser dinámico, NO entra en el bundle inicial: solo se descarga
  // cuando el usuario realmente genera un Excel.
  const XlsxPopulate = (await import("xlsx-populate/browser/xlsx-populate")).default as any;
  const workbook = await XlsxPopulate.fromBlankAsync();
  const dataSheet = workbook.sheet(0);
  dataSheet.name("Datos");

  if (table.rows.length === 0) {
    dataSheet.cell(1, 1).value("No se encontraron datos para generar el Excel.");
  } else {
    dataSheet.cell("A1").value([table.headers, ...table.rows]);
    setColumnWidths(dataSheet, table.headers, table.rows);
    setRowHeights(dataSheet, table.rows);
  }

  if (stats) {
    const s = workbook.addSheet("Estadisticas");
    s.cell(1, 1).value("Estadísticas de Conversión").style({ bold: true });
    s.cell(3, 1).value("Total Procesados:");
    s.cell(3, 2).value(stats.totalProcesados);
    s.cell(4, 1).value("Total Exitosos:");
    s.cell(4, 2).value(stats.totalExitosos).style({ fill: "C6EFCE" });
    s.cell(5, 1).value("Total Fallidos:");
    s.cell(5, 2).value(stats.totalFallidos).style({ fill: "FFC7CE" });
    s.cell(7, 1).value("Archivos Fallidos").style({ bold: true });
    s.cell(8, 1).value("Nombre Archivo");
    s.cell(8, 2).value("Error");
    let row = 9;
    for (const fallo of stats.fallidos) {
      s.cell(row, 1).value(fallo.fileName);
      s.cell(row, 2).value(stripHtml(fallo.error));
      row++;
    }
  }

  const out: Uint8Array = await workbook.outputAsync("uint8array");
  const blob = new Blob([out], { type: XLSX_MIME });
  const fileName = `${sanitizarNombre(EXCEL_BASE_FILENAME[format])}.xlsx`;
  return { blob, fileName };
}
