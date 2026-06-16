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
// Límites legales de OOXML/Excel. Un nombre de archivo muy largo (la columna "Nombre
// PDF" es controlada por quien genera el PDF) produciría width/height fuera de rango
// y un .xlsx corrupto que Excel se niega a abrir o pide "reparar". Acotamos ambos.
const MAX_COLUMN_WIDTH = 255; // máximo de caracteres por columna en Excel
const MAX_ROW_HEIGHT = 409; // máximo de puntos por fila en Excel

export interface WorkbookFile {
  blob: Blob;
  fileName: string;
}

/** Elimina etiquetas HTML de un valor (defensa: los mensajes de error van a una celda). */
function stripHtml(value: unknown): string {
  return String(value ?? "").replace(/<[^>]*>/g, "");
}

/** Detecta una línea que —tras saltar espacios y caracteres de formato invisibles—
 *  empieza por un carácter de fórmula. `\s` cubre los espacios Unicode (incl. NBSP y
 *  BOM); `\p{Cf}` cubre TODA la categoría de format chars (LRM/RLM/ALM, los de ancho
 *  cero ZWSP/ZWNJ/ZWJ/WJ, y los bidi override/isolate), que algunos importadores
 *  recortan antes de evaluar la fórmula. Requiere el flag `u`. */
const FORMULA_LEAD = /^[\s\p{Cf}]*[=+\-@]/u;

// Rangos a eliminar de cada celda, definidos por codepoint para NO incrustar
// caracteres de control en el fuente. Se conservan tab/LF/CR (válidos en XML y
// usados por los mensajes de error multilínea); todo lo demás se elimina:
//  - C0 ilegales en XML/OOXML (0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F).
//  - DEL + controles C1 (0x7F-0x9F): incluye NEL (U+0085), que NO es `\s` y que
//    algunos importadores tratan como salto de línea (2ª línea con fórmula viva).
//  - Separadores de línea Unicode LS/PS (U+2028-U+2029): mismo riesgo de 2ª línea.
//  - Controles bidireccionales / RTL override (U+202A-202E, U+2066-2069): spoofing.
const UNSAFE_RANGES: ReadonlyArray<[number, number]> = [
  [0x00, 0x08], [0x0b, 0x0c], [0x0e, 0x1f],
  [0x7f, 0x9f],
  [0x2028, 0x2029], [0x202a, 0x202e], [0x2066, 0x2069],
];
const UNSAFE_CHARS = new RegExp(
  "[" +
    UNSAFE_RANGES.map((r) => String.fromCharCode(r[0]) + "-" + String.fromCharCode(r[1])).join("") +
    "]",
  "g"
);

/**
 * Sanea un valor de celda contra inyección de fórmulas / CSV injection (CWE-1236)
 * y contra corrupción/spoofing del .xlsx por caracteres no confiables.
 *
 * xlsx-populate escribe los strings como texto (t="s"), así que Excel NO los evalúa
 * al abrir el .xlsx nativo. Pero un valor que empiece por `= + - @` se convierte en
 * fórmula viva si el usuario hace "Guardar como CSV" y reabre, o si el archivo se abre
 * en Google Sheets / LibreOffice (que recortan el whitespace inicial). El contenido
 * viene de PDFs no confiables y —sobre todo— la columna "Nombre PDF" y la hoja
 * Estadísticas reciben `file.name`, 100% controlado por quien genera el archivo.
 *
 * Defensa en profundidad en dos pasos:
 *  1) Elimina controles ilegales en XML/OOXML (excepto \t \n \r, válidos) y los
 *     controles bidireccionales / RTL override: un nombre con NUL/BEL corrompería el
 *     .xlsx y U+202E permite falsear el nombre mostrado (p.ej. "fdp.exe" → "exe.pdf").
 *  2) Si CUALQUIER línea —tras saltar espacios iniciales— empieza por `= + - @`,
 *     antepone un apóstrofo. Cubre " =cmd" (espacio/NBSP/BOM inicial) y las celdas
 *     multilínea ("...\n=cmd"), sin alterar el dato visible legítimo.
 */
export function neutralizeFormula(value: string): string {
  const clean = value.replace(UNSAFE_CHARS, "");
  const risky = clean.split(/\r\n|\r|\n/).some((line) => FORMULA_LEAD.test(line));
  return risky ? `'${clean}` : clean;
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
    const width = Math.max(maxLengths[i] * COLUMN_WIDTH_FACTOR, MIN_COLUMN_WIDTH);
    sheet.column(i + 1).width(Math.min(width, MAX_COLUMN_WIDTH));
  }
}

function setRowHeights(sheet: any, rows: string[][]): void {
  rows.forEach((row, rowIndex) => {
    const first = row[0] ?? "";
    const lineCount = Math.max(1, Math.ceil(first.length / APPROX_CHARS_PER_LINE));
    sheet.row(rowIndex + 2).height(Math.min(BASE_ROW_HEIGHT * lineCount, MAX_ROW_HEIGHT));
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
    // Saneamos cada celda contra inyección de fórmulas antes de escribirla.
    const safeHeaders = table.headers.map(neutralizeFormula);
    const safeRows = table.rows.map((row) => row.map(neutralizeFormula));
    dataSheet.cell("A1").value([safeHeaders, ...safeRows]);
    setColumnWidths(dataSheet, safeHeaders, safeRows);
    setRowHeights(dataSheet, safeRows);
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
      s.cell(row, 1).value(neutralizeFormula(fallo.fileName));
      s.cell(row, 2).value(neutralizeFormula(stripHtml(fallo.error)));
      row++;
    }
  }

  const out: Uint8Array = await workbook.outputAsync("uint8array");
  const blob = new Blob([out], { type: XLSX_MIME });
  const fileName = `${sanitizarNombre(EXCEL_BASE_FILENAME[format])}.xlsx`;
  return { blob, fileName };
}
