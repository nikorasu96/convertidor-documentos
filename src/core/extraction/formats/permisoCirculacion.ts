// src/core/extraction/formats/permisoCirculacion.ts
// Permiso de Circulación. Intenta primero con regex etiquetados; si la mayoría
// de los campos quedan vacíos, recurre a extracción por patrones (sin etiquetas),
// usada por municipios que emiten PDFs sin labels explícitos.
import type { Extractor } from "../Extractor";
import type { DocumentData } from "../../domain/result";
import { ConversionError } from "../../domain/errors";
import { buscar } from "../shared";

const LABELED_REGEXES: Record<string, RegExp> = {
  "Placa Única": /Placa\s+Única\s*[:\-]?\s*([A-Z0-9\-]+)/i,
  "Código SII": /Codigo\s+SII\s*[:\-]?\s*([A-Z0-9]+)/i,
  "Valor Permiso": /Valor\s+Permiso\s*[:\-]?\s*(\d+)/i,
  "Pago total": /Pago\s+total\s*[:\-]?\s*(X)?/i,
  "Pago Cuota 1": /Pago\s+cuota\s+1\s*[:\-]?\s*(X)?/i,
  "Pago Cuota 2": /Pago\s+cuota\s+2\s*[:\-]?\s*(X)?/i,
  "Total a pagar": /Total\s+a\s+pagar\s*[:\-]?\s*(\d+)/i,
  "Fecha de emisión": /Fecha(?:\s+de)?\s+emisi[oó]n\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i,
  "Fecha de vencimiento": /Fecha(?:\s+de)?\s+vencimiento\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i,
  "Forma de Pago": /Forma\s+de\s+Pago\s*[:\-]?\s*(\w+)/i,
};

/** Extracción por patrones para PDFs sin etiquetas (valores sueltos en el texto).
 *  Importante: muchos PDFs (p. ej. Renca) extraen el texto SIN espacios entre
 *  tokens (".../RENCA31/03/2027CAMIONETAVVTY83-7GRIS..."), por lo que NO se puede
 *  usar `\b` (límite de palabra): los valores quedan pegados a letras/dígitos
 *  vecinos y `\b` nunca coincide. Los patrones de abajo son auto-delimitados. */
function extractUnlabeled(t: string): DocumentData {
  // Placa chilena: 4 letras + 2 dígitos + guion + dígito verificador (0-9 o K);
  // el guion entre letras y dígitos es opcional (admite "VVTY83-7" y "PKZW-43-8");
  // formato antiguo: 2 letras + 4 dígitos. Sin `\b` ni flag `i` (placas en mayúscula),
  // para no confundir con códigos de verificación en minúscula del documento.
  const placaMatch = t.match(/[A-Z]{4}-?\d{2}-[0-9K]/) || t.match(/[A-Z]{2}-?\d{4}-[0-9K]/);
  const placa = placaMatch ? placaMatch[0] : "";

  const fechasSlash = t.match(/\d{2}\/\d{2}\/\d{4}/g) || [];
  const fechasDash = (t.match(/\d{2}-\d{2}-\d{4}/g) || []).map((f) => f.replace(/-/g, "/"));
  const fechasUnicas = [...new Set([...fechasSlash, ...fechasDash])];
  let fechaEmision = "";
  let fechaVencimiento = "";
  if (fechasUnicas.length >= 2) {
    const sorted = fechasUnicas
      .map((f) => {
        const [d, m, y] = f.split("/").map(Number);
        return { str: f, ts: new Date(y, m - 1, d).getTime() };
      })
      .sort((a, b) => a.ts - b.ts);
    fechaEmision = sorted[0].str;
    fechaVencimiento = sorted[sorted.length - 1].str;
  } else if (fechasUnicas.length === 1) {
    fechaEmision = fechasUnicas[0];
  }

  // Valor del permiso: el importe (formato 000.000) que más se repite en el documento.
  // Antes se eliminan los RUT (00.000.000-0) para no capturar fragmentos como
  // "608.183" del RUT del propietario en lugar del valor real del permiso.
  const sinRut = t.replace(/\d{1,3}(?:\.\d{3})*-[\dkK]/g, " ");
  const moneyMatches = sinRut.match(/\d{3}\.\d{3}/g) || [];
  let valorConPuntos = "";
  if (moneyMatches.length > 0) {
    const freq: Record<string, number> = {};
    for (const m of moneyMatches) freq[m] = (freq[m] || 0) + 1;
    valorConPuntos = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
  }
  const valor = valorConPuntos.replace(/\./g, "");

  // Modalidad de pago: el PDF no tiene etiquetas de texto "total/cuota"; la "X" va
  // pegada al importe de la casilla marcada. No basta buscar una "X" suelta porque
  // el texto también contiene "4X4" (modelo) o "YN2X" (chasis), que no son marcas.
  //   - X junto al valor total        -> Pago total.
  //   - X junto a un importe de cuota -> 1ª o 2ª cuota. Las dos cuotas suman el total
  //     y la 1ª es mayor que la 2ª, así que la cuota marcada es la 1ª si supera la
  //     mitad del total, y la 2ª en caso contrario.
  // Verificado con PDFs de pago total; la rama de cuotas queda pendiente de muestra real.
  const num = (s: string) => Number(s.replace(/\./g, "")) || 0;
  const marcado = [...t.matchAll(/(\d{3}\.\d{3})\s*X/g)].map((m) => m[1])[0] ?? "";
  let pagoTotal = "No aplica";
  let pagoCuota1 = "No aplica";
  let pagoCuota2 = "No aplica";
  if (marcado && marcado === valorConPuntos) {
    pagoTotal = "X";
  } else if (marcado) {
    if (num(marcado) * 2 > num(valorConPuntos)) pagoCuota1 = "X";
    else pagoCuota2 = "X";
  }

  const formaPago =
    /firma\s+electr[oó]nica\s+avanzada/i.test(t) || /Digitally\s+signed/i.test(t)
      ? "Internet"
      : "Presencial";

  // El orden de las claves define el orden de columnas del Excel para Renca (tras
  // "Nombre PDF", "Placa Única" y "digito verificador", que añade buildTable).
  const data: DocumentData = {};
  data["Placa Única"] = placa;
  data["Fecha de emisión"] = fechaEmision;
  data["Fecha de vencimiento"] = fechaVencimiento;
  data["Código SII"] = "";
  data["Valor Permiso"] = valor;
  data["Total a pagar"] = valor;
  data["Pago total"] = pagoTotal;
  data["Pago Cuota 1"] = pagoCuota1;
  data["Pago Cuota 2"] = pagoCuota2;
  data["Forma de Pago"] = formaPago;
  return data;
}

function extract(text: string): DocumentData {
  const t = text.replace(/\r?\n|\r/g, " ");

  const data: DocumentData = {};
  for (const key in LABELED_REGEXES) {
    data[key] = buscar(t, LABELED_REGEXES[key]) || "";
  }

  for (const key in data) {
    if (data[key].trim() === "") {
      data[key] = ["Pago total", "Pago Cuota 1", "Pago Cuota 2"].includes(key) ? "No aplica" : "";
    }
  }

  const camposClave = [
    "Placa Única",
    "Valor Permiso",
    "Total a pagar",
    "Fecha de emisión",
    "Fecha de vencimiento",
  ];
  const camposLlenos = camposClave.filter((f) => data[f] && data[f].trim() !== "").length;

  if (camposLlenos < 3) {
    return extractUnlabeled(t);
  }

  return data;
}

function validate(data: DocumentData, fileName: string): void {
  const errors: string[] = [];

  const obligatorios = [
    "Placa Única",
    "Valor Permiso",
    "Total a pagar",
    "Fecha de emisión",
    "Fecha de vencimiento",
  ];
  for (const field of obligatorios) {
    const value = data[field];
    if (!value || value.trim().length < 3) {
      errors.push(`Campo "${field}" es obligatorio y debe tener al menos 3 caracteres.`);
    }
  }

  const opcionales = ["Código SII", "Forma de Pago"];
  for (const field of opcionales) {
    const value = data[field];
    if (value && value.trim().length > 0 && value.trim().length < 3) {
      errors.push(`Campo "${field}" debe tener al menos 3 caracteres si está presente.`);
    }
  }

  const pagosPattern: Record<string, RegExp> = {
    "Pago total": /^(X|No aplica)$/i,
    "Pago Cuota 1": /^(X|No aplica)$/i,
    "Pago Cuota 2": /^(X|No aplica)$/i,
  };
  for (const field of Object.keys(pagosPattern)) {
    if (!pagosPattern[field].test(data[field])) {
      errors.push(`Campo "${field}" con valor "${data[field]}" no es válido.`);
    }
  }

  if (errors.length > 0) {
    throw new ConversionError(
      "VALIDATION_ERROR",
      `El archivo ${fileName} presenta problemas:\n - ${errors.join("\n - ")}`
    );
  }
}

export const permisoCirculacionExtractor: Extractor = {
  format: "PERMISO_CIRCULACION",
  extract,
  validate,
};
