// src/utils/excel/excelUtils.ts
import XlsxPopulate from "xlsx-populate";
import { setColumnWidths } from "./columnUtils";
import { adjustRowHeights } from "./rowUtils";
import { sanitizarNombre } from "@/utils/pdf/pdfUtils";
import logger from "@/utils/logger";

export interface ExcelStats {
  totalProcesados: number;
  totalExitosos: number;
  totalFallidos: number;
  fallidos: Array<{ fileName: string; error: string }>;
}

/**
 * Función auxiliar para eliminar etiquetas HTML de un string.
 * Se asegura de que el valor recibido sea tratado como cadena.
 * @param htmlString Valor que puede contener HTML.
 * @returns Cadena limpia sin etiquetas HTML.
 */
function stripHtmlTags(htmlString: any): string {
  if (typeof htmlString !== "string") {
    htmlString = String(htmlString);
  }
  return htmlString.replace(/<[^>]*>/g, "");
}

/**
 * Normaliza un valor de placa o similar eliminando todos los guiones.
 * Si el resultado (sin guiones) tiene:
 *   - EXACTAMENTE 6 caracteres, se toma tal cual (no hay dígito verificador).
 *   - Más de 6 caracteres, se toman los primeros 6 como la patente y el resto se asigna como dígito verificador.
 *
 * Ejemplos:
 *   "LXWJ75-4"   => { plate: "LXWJ75", checkDigit: "4" }
 *   "LXW-J75-4"  => { plate: "LXWJ75", checkDigit: "4" }
 *   "THJL54"     => { plate: "THJL54" }
 *   "THJL-11"    => { plate: "THJL11" }
 */
function normalizePlateWithCheck(value: string): { plate: string; checkDigit?: string } {
  // Se eliminan todos los guiones y todos los espacios.
  const cleaned = value.replace(/-/g, "").replace(/\s/g, "");
  if (cleaned.length > 6) {
    return { plate: cleaned.substring(0, 6), checkDigit: cleaned.substring(6) };
  }
  return { plate: cleaned };
}

/**
 * Genera un archivo Excel con dos hojas:
 *  - "Datos": Contiene los registros exitosos, transformados según la lógica de normalización.
 *  - "Estadisticas": Muestra el resumen de procesamiento (totales y lista de archivos fallidos).
 *
 * @param registros Datos a incluir en la hoja "Datos".
 * @param fileName Nombre base del archivo.
 * @param pdfFormat (Opcional) Formato de PDF.
 * @param stats (Opcional) Estadísticas de conversión.
 * @returns Objeto con el buffer del Excel y el nombre codificado.
 */
export async function generateExcel(
  registros: Record<string, string>[],
  fileName: string,
  pdfFormat?: string,
  stats?: ExcelStats
): Promise<{ buffer: Buffer; encodedName: string }> {
  // --- Transformación de registros según el formato ---
  if (pdfFormat === "CERTIFICADO_DE_HOMOLOGACION") {
    // Para Homologación: procesar "Patente" eliminando guiones; no se asigna dígito verificador.
    registros.forEach((registro) => {
      if (registro["Patente"] && typeof registro["Patente"] === "string") {
        registro["Patente"] = registro["Patente"].replace(/-/g, "").trim();
      }
      delete registro["digito verificador"];
    });
  } else if (pdfFormat === "PERMISO_CIRCULACION") {
    // Para Permiso de Circulación: procesar "Placa Única" usando normalizePlateWithCheck.
    registros.forEach((registro) => {
      if (registro["Placa Única"] && typeof registro["Placa Única"] === "string") {
        const normalized = normalizePlateWithCheck(registro["Placa Única"]);
        registro["Placa Única"] = normalized.plate;
        if (normalized.checkDigit) {
          registro["digito verificador"] = normalized.checkDigit;
        } else {
          delete registro["digito verificador"];
        }
      }
    });
  } else if (pdfFormat === "SOAP") {
    // Para SOAP: procesar "INSCRIPCION R.V.M" usando la misma lógica.
    registros.forEach((registro) => {
      if (registro["INSCRIPCION R.V.M"] && typeof registro["INSCRIPCION R.V.M"] === "string") {
        const normalized = normalizePlateWithCheck(registro["INSCRIPCION R.V.M"]);
        registro["INSCRIPCION R.V.M"] = normalized.plate;
        if (normalized.checkDigit) {
          registro["digito verificador"] = normalized.checkDigit;
        } else {
          delete registro["digito verificador"];
        }
      }
      if (registro["Patente"] && typeof registro["Patente"] === "string") {
        const match = registro["Patente"].match(/^(.+)-(.+)$/);
        if (match) {
          registro["Patente"] = match[1].trim();
          registro["digito verificador"] = match[2].trim();
        }
      }
      if (registro["Placa Única"] && typeof registro["Placa Única"] === "string") {
        const match = registro["Placa Única"].match(/^(.+)-(.+)$/);
        if (match) {
          registro["Placa Única"] = match[1].trim();
          registro["digito verificador"] = match[2].trim();
        }
      }
    });
  } else {
    // Para otros formatos: procesar los campos "Patente", "Placa Única" y "INSCRIPCION R.V.M" usando una separación simple.
    registros.forEach((registro) => {
      ["Patente", "Placa Única", "INSCRIPCION R.V.M"].forEach((key) => {
        if (
          registro[key] &&
          typeof registro[key] === "string" &&
          registro[key].includes("-")
        ) {
          const parts = registro[key].split("-");
          if (parts.length > 1) {
            const combined = parts.join("").trim();
            registro[key] = combined.substring(0, 6);
            registro["digito verificador"] = combined.substring(6);
          }
        }
      });
    });
  }
  // --- Fin de transformación ---

  // --- Crear el workbook y la hoja "Datos" ---
  const workbook = await XlsxPopulate.fromBlankAsync();
  const dataSheet = workbook.sheet(0) as any;
  (dataSheet as any).name("Datos");

  // --- Reordenar registros ---
  function orderRegistro(registro: { [key: string]: any }): { [key: string]: any } {
    const ordered: { [key: string]: any } = {};
    if ("Nombre PDF" in registro) {
      ordered["Nombre PDF"] = registro["Nombre PDF"];
    }
    if (pdfFormat === "CERTIFICADO_DE_HOMOLOGACION") {
      if ("Patente" in registro) {
        ordered["Patente"] = registro["Patente"];
      }
    } else if (pdfFormat === "PERMISO_CIRCULACION") {
      if ("Placa Única" in registro) {
        ordered["Placa Única"] = registro["Placa Única"];
        if ("digito verificador" in registro) {
          ordered["digito verificador"] = registro["digito verificador"];
        }
      }
    } else if (pdfFormat === "SOAP") {
      if ("INSCRIPCION R.V.M" in registro) {
        ordered["INSCRIPCION R.V.M"] = registro["INSCRIPCION R.V.M"];
        if ("digito verificador" in registro) {
          ordered["digito verificador"] = registro["digito verificador"];
        }
      }
      if ("Patente" in registro) {
        ordered["Patente"] = registro["Patente"];
        if ("digito verificador" in registro) {
          ordered["digito verificador"] = registro["digito verificador"];
        }
      } else if ("Placa Única" in registro) {
        ordered["Placa Única"] = registro["Placa Única"];
        if ("digito verificador" in registro) {
          ordered["digito verificador"] = registro["digito verificador"];
        }
      }
    } else {
      if ("Patente" in registro) {
        ordered["Patente"] = registro["Patente"];
        if ("digito verificador" in registro) {
          ordered["digito verificador"] = registro["digito verificador"];
        }
      } else if ("Placa Única" in registro) {
        ordered["Placa Única"] = registro["Placa Única"];
        if ("digito verificador" in registro) {
          ordered["digito verificador"] = registro["digito verificador"];
        }
      } else if ("INSCRIPCION R.V.M" in registro) {
        ordered["INSCRIPCION R.V.M"] = registro["INSCRIPCION R.V.M"];
        if ("digito verificador" in registro) {
          ordered["digito verificador"] = registro["digito verificador"];
        }
      }
    }
    Object.keys(registro).forEach((key) => {
      if (!["Nombre PDF", "Patente", "Placa Única", "INSCRIPCION R.V.M", "digito verificador"].includes(key)) {
        ordered[key] = registro[key];
      }
    });
    return ordered;
  }

  const orderedRegistros = registros.map(orderRegistro);

  // Forzar la inclusión de "digito verificador"
  const hasCheckDigit = orderedRegistros.some(record => record.hasOwnProperty("digito verificador"));
  if (hasCheckDigit) {
    orderedRegistros.forEach(record => {
      if (!record.hasOwnProperty("digito verificador")) {
        record["digito verificador"] = "";
      }
    });
  }

  const headerSet = new Set<string>();
  orderedRegistros.forEach(record => {
    Object.keys(record).forEach(key => headerSet.add(key));
  });
  const headers = Array.from(headerSet);

  if (orderedRegistros.length === 0) {
    dataSheet.cell(1, 1).value("No se encontraron datos para generar el Excel.");
  } else {
    // Escritura bulk: construir matriz 2D con headers + datos y escribir de una vez
    const matrix: (string | number)[][] = [headers];
    orderedRegistros.forEach((registro) => {
      matrix.push(headers.map((header) => registro[header] || ""));
    });
    dataSheet.cell("A1").value(matrix);

    setColumnWidths(dataSheet, headers, orderedRegistros);
    adjustRowHeights(dataSheet, orderedRegistros);
  }

  if (stats) {
    const statsSheet = (workbook as any).addSheet("Estadisticas");
    (statsSheet as any).name("Estadisticas");

    statsSheet.cell(1, 1).value("Estadísticas de Conversión").style({ bold: true, fill: "ffffff" });
    statsSheet.cell(3, 1).value("Total Procesados:");
    statsSheet.cell(3, 2).value(stats.totalProcesados).style({ fill: "ffffff" });
    statsSheet.cell(4, 1).value("Total Exitosos:");
    statsSheet.cell(4, 2).value(stats.totalExitosos).style({ fill: "C6EFCE" });
    statsSheet.cell(5, 1).value("Total Fallidos:");
    statsSheet.cell(5, 2).value(stats.totalFallidos).style({ fill: "FFC7CE" });

    statsSheet.cell(7, 1).value("Archivos Fallidos").style({ bold: true, fill: "ffffff" });
    statsSheet.cell(8, 1).value("Nombre Archivo");
    statsSheet.cell(8, 2).value("Error");

    let row = 9;
    stats.fallidos.forEach((fallo) => {
      const cleanError = stripHtmlTags(fallo.error);
      statsSheet.cell(row, 1).value(fallo.fileName);
      statsSheet.cell(row, 2).value(cleanError);
      row++;
    });
  } else {
    logger.info("No se proporcionaron estadísticas, por lo que no se creará la hoja 'Estadisticas'.");
  }

  const finalFileName = sanitizarNombre(fileName);
  const encodedName = encodeURIComponent(
    finalFileName.endsWith(".xlsx") ? finalFileName : `${finalFileName}.xlsx`
  );
  const buffer = await workbook.outputAsync();
  return { buffer, encodedName };
}
