// src/core/extraction/shared.ts
// Utilidades puras compartidas por los extractores. Sin estado, sin I/O.

/**
 * Busca la primera coincidencia de `pattern` en `text` y devuelve el grupo 1
 * (trim) o null si no hay coincidencia.
 */
export function buscar(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  return match && match[1] ? match[1].trim() : null;
}

/**
 * Normaliza una placa/inscripción separando un eventual dígito verificador.
 * Se eliminan guiones y espacios:
 *   - exactamente 6 chars  -> { plate } (sin dígito verificador)
 *   - más de 6 chars       -> { plate: primeros 6, checkDigit: resto }
 *
 * Ejemplos: "LXWJ75-4" -> { plate: "LXWJ75", checkDigit: "4" }
 *           "THJL54"   -> { plate: "THJL54" }
 */
export function normalizePlateWithCheck(value: string): { plate: string; checkDigit?: string } {
  const cleaned = value.replace(/-/g, "").replace(/\s/g, "");
  if (cleaned.length > 6) {
    return { plate: cleaned.substring(0, 6), checkDigit: cleaned.substring(6) };
  }
  return { plate: cleaned };
}

/**
 * Sanitiza un nombre de archivo eliminando acentos y caracteres no permitidos.
 * Se usa para el nombre del Excel descargado.
 */
export function sanitizarNombre(str: string): string {
  let sanitized = str
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s\-_().]/gu, "_")
    .trim();
  sanitized = sanitized.replace(/\s+A$/, "");
  return sanitized;
}
