import { buscar } from "@/utils/pdf/pdfUtils";
import logger from "@/utils/logger";

/**
 * Extracción por patrones para PDFs de Permiso de Circulación sin etiquetas.
 * Algunos municipios emiten PDFs donde los datos no tienen labels como "Placa Única:", "Codigo SII:", etc.
 * En su lugar, los valores aparecen sueltos en el texto.
 *
 * NOTA: El campo "Código S.I.I." puede estar vacío en ciertos formatos.
 * No confundir TASACIÓN (ej: 10.973.339) ni Nº Motor (ej: CWS 676903) con Código SII.
 */
function extraerDatosPCSinEtiquetas(t: string): { data: Record<string, string>; regexes: Record<string, RegExp> } {
  const data: Record<string, string> = {};
  const regexes: Record<string, RegExp> = {};

  // === Placa Única ===
  // Formato nuevo: 4 letras + 2 dígitos + guion + dígito verificador (ej: VLBP65-K)
  // Formato antiguo: 2 letras + 4 dígitos + guion + dígito (ej: XX1234-0)
  const placaMatch = t.match(/\b([A-Z]{4}\d{2}-[A-Z0-9K])\b/i)
                  || t.match(/\b([A-Z]{2}\d{4}-\d)\b/i);
  data["Placa Única"] = placaMatch ? placaMatch[1] : "";

  // === Fechas (dd/mm/yyyy) ===
  const fechasUnicas = [...new Set(t.match(/\b\d{2}\/\d{2}\/\d{4}\b/g) || [])];
  if (fechasUnicas.length >= 2) {
    const sorted = fechasUnicas
      .map(f => {
        const [d, m, y] = f.split("/").map(Number);
        return { str: f, ts: new Date(y, m - 1, d).getTime() };
      })
      .sort((a, b) => a.ts - b.ts);
    data["Fecha de emisión"] = sorted[0].str;
    data["Fecha de vencimiento"] = sorted[sorted.length - 1].str;
  } else if (fechasUnicas.length === 1) {
    data["Fecha de emisión"] = fechasUnicas[0];
    data["Fecha de vencimiento"] = "";
  } else {
    data["Fecha de emisión"] = "";
    data["Fecha de vencimiento"] = "";
  }

  // === Código SII ===
  // En muchos formatos de Permiso de Circulación este campo viene vacío.
  // No se extrae por patrones para evitar confundir con TASACIÓN o Nº Motor.
  data["Código SII"] = "";

  // === Valor Permiso ===
  // Buscar valores monetarios con puntos de miles (ej: 169.917)
  // Se buscan todos los matches y se toma el que más se repite (aparece en ambas secciones del comprobante)
  const moneyMatches = t.match(/\b(\d{1,3}\.\d{3})\b/g) || [];
  if (moneyMatches.length > 0) {
    // Contar frecuencias para encontrar el valor más repetido (Valor Permiso/Total a Pagar aparece varias veces)
    const freq: Record<string, number> = {};
    for (const m of moneyMatches) {
      freq[m] = (freq[m] || 0) + 1;
    }
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
    data["Valor Permiso"] = sorted[0][0].replace(/\./g, "");
  } else {
    data["Valor Permiso"] = "";
  }

  // === Total a pagar ===
  data["Total a pagar"] = data["Valor Permiso"];

  // === Pagos ===
  data["Pago total"] = /\bX\b/.test(t) ? "X" : "No aplica";
  data["Pago Cuota 1"] = "No aplica";
  data["Pago Cuota 2"] = "No aplica";

  // === Forma de Pago ===
  // El sello "PAGADO INTERNET" es imagen y no se extrae como texto.
  // Se infiere la forma de pago por indicadores disponibles:
  //   - "firma electrónica avanzada" o "Digitally signed" → Internet
  //   - Si no hay indicadores digitales → Presencial
  if (/firma\s+electr[oó]nica\s+avanzada/i.test(t) || /Digitally\s+signed/i.test(t)) {
    data["Forma de Pago"] = "Internet";
  } else {
    data["Forma de Pago"] = "Presencial";
  }

  logger.info("Datos extraídos (Permiso de Circulación sin etiquetas):", data);
  return { data, regexes };
}

/**
 * Extrae los datos del Permiso de Circulación desde el texto extraído del PDF.
 *
 * Intenta primero con regex etiquetados (formato con labels como "Placa Única:", "Codigo SII:", etc.).
 * Si la mayoría de los campos quedan vacíos, recurre a extracción por patrones (sin etiquetas).
 *
 * Retorna un objeto con:
 *   - data: los datos extraídos (Record<string, string>)
 *   - regexes: las expresiones regulares utilizadas para cada campo (Record<string, RegExp>)
 */
export function extraerDatosPermisoCirculacion(text: string): { data: Record<string, string>; regexes: Record<string, RegExp> } {
  // Unificar saltos de línea
  const t = text.replace(/\r?\n|\r/g, " ");

  const regexes: Record<string, RegExp> = {
    // Placa Única: secuencia de letras, números y guiones
    "Placa Única": /Placa\s+Única\s*[:\-]?\s*([A-Z0-9\-]+)/i,
    // Código SII: secuencia de letras y números
    "Código SII": /Codigo\s+SII\s*[:\-]?\s*([A-Z0-9]+)/i,
    // Valor Permiso: dígitos
    "Valor Permiso": /Valor\s+Permiso\s*[:\-]?\s*(\d+)/i,
    // Pago total: captura "X" si se marca, de lo contrario queda vacío
    "Pago total": /Pago\s+total\s*[:\-]?\s*(X)?/i,
    // Pago Cuota 1: captura "X" si se marca
    "Pago Cuota 1": /Pago\s+cuota\s+1\s*[:\-]?\s*(X)?/i,
    // Pago Cuota 2: captura "X" si se marca
    "Pago Cuota 2": /Pago\s+cuota\s+2\s*[:\-]?\s*(X)?/i,
    // Total a pagar: dígitos
    "Total a pagar": /Total\s+a\s+pagar\s*[:\-]?\s*(\d+)/i,
    // Fecha de emisión: admite "Fecha de emisión:" o "Fecha emisión:" en formato dd/mm/yyyy
    "Fecha de emisión": /Fecha(?:\s+de)?\s+emisi[oó]n\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i,
    // Fecha de vencimiento: admite "Fecha de vencimiento:" o "Fecha vencimiento:" en formato dd/mm/yyyy
    "Fecha de vencimiento": /Fecha(?:\s+de)?\s+vencimiento\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i,
    // Forma de Pago: captura una palabra (alfanumérica)
    "Forma de Pago": /Forma\s+de\s+Pago\s*[:\-]?\s*(\w+)/i,
  };

  const data: Record<string, string> = {};
  for (const key in regexes) {
    data[key] = buscar(t, regexes[key]) || "";
  }

  // Normalización:
  // Si un campo está vacío:
  // - Para "Pago total", "Pago Cuota 1" y "Pago Cuota 2" se asigna "No aplica"
  // - Para los demás se deja como cadena vacía ("")
  for (const key in data) {
    if (data[key].trim() === "") {
      if (["Pago total", "Pago Cuota 1", "Pago Cuota 2"].includes(key)) {
        data[key] = "No aplica";
      } else {
        data[key] = "";
      }
    }
  }

  // Verificar si la extracción con etiquetas fue suficiente
  const camposClave = ["Placa Única", "Valor Permiso", "Total a pagar", "Fecha de emisión", "Fecha de vencimiento"];
  const camposLlenos = camposClave.filter(f => data[f] && data[f].trim() !== "").length;

  if (camposLlenos < 3) {
    logger.info("Extracción con etiquetas insuficiente (" + camposLlenos + "/" + camposClave.length + " campos). Intentando extracción por patrones...");
    return extraerDatosPCSinEtiquetas(t);
  }

  logger.debug("Datos extraídos Permiso de Circulación:", data);
  return { data, regexes };
}

/**
 * Validación "best-effort" para Permiso de Circulación, adaptada para que, si algún campo obligatorio
 * (exceptuando las validaciones especiales de pago, que se mantienen) no cumple, se lance un error.
 *
 * - Para campos obligatorios (Placa Única, Código SII, Valor Permiso, Total a pagar, Fecha de emisión, Fecha de vencimiento, Forma de Pago)
 *   se requiere que tengan al menos 3 caracteres.
 * - Los campos de pago ("Pago total", "Pago Cuota 1", "Pago Cuota 2") se validan contra su patrón.
 */
export function bestEffortValidationPermisoCirculacion(datos: Record<string, string>, fileName: string): void {
  const errors: string[] = [];

  // Validar campos obligatorios (no de pago)
  // "Código SII" y "Forma de Pago" son opcionales porque no todos los formatos de PDF lo incluyen
  const obligatorios = ["Placa Única", "Valor Permiso", "Total a pagar", "Fecha de emisión", "Fecha de vencimiento"];
  for (const field of obligatorios) {
    const value = datos[field];
    if (!value || value.trim().length < 3) {
      errors.push(`Campo "${field}" es obligatorio y debe tener al menos 3 caracteres.`);
    }
  }

  // Validar campos opcionales solo si tienen valor
  const opcionales = ["Código SII", "Forma de Pago"];
  for (const field of opcionales) {
    const value = datos[field];
    if (value && value.trim().length > 0 && value.trim().length < 3) {
      errors.push(`Campo "${field}" debe tener al menos 3 caracteres si está presente.`);
    }
  }

  // Validar campos de pago (manteniendo la lógica especial)
  const pagos = ["Pago total", "Pago Cuota 1", "Pago Cuota 2"];
  const pagosPattern: Record<string, RegExp> = {
    "Pago total": /^(X|No aplica)$/i,
    "Pago Cuota 1": /^(X|No aplica)$/i,
    "Pago Cuota 2": /^(X|No aplica)$/i,
  };
  for (const field of pagos) {
    const value = datos[field];
    if (!pagosPattern[field].test(value)) {
      errors.push(`Campo "${field}" con valor "${value}" no es válido.`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`El archivo ${fileName} presenta problemas:\n - ${errors.join("\n - ")}`);
  }
}
