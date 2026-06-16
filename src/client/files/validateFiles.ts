// src/client/files/validateFiles.ts
// Validación previa de archivos en el cliente: tipo, tamaño y nº de archivos.
// Filosofía: no bloquear todo el lote por un archivo malo; los inválidos se
// reportan como fallos claros y el resto se procesa (mejor UX para lotes grandes).
// La validación de CONTENIDO (que sea un PDF real) la hace el motor unpdf en el
// worker, que devuelve PARSE_ERROR de forma segura ante binarios no-PDF.

function readEnvInt(value: string | undefined, fallback: number): number {
  const n = parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Vite expone solo las variables con prefijo VITE_ vía import.meta.env.
// En entornos sin import.meta.env (p.ej. el runner de tests Node) se usan los defaults.
const env: Record<string, string | undefined> =
  typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};

/** Tamaño máximo por archivo (bytes). Configurable vía VITE_MAX_FILE_SIZE. */
export const MAX_FILE_SIZE = readEnvInt(env.VITE_MAX_FILE_SIZE, 10 * 1024 * 1024);

/** Nº máximo de archivos por lote. Configurable vía VITE_MAX_FILES. */
export const MAX_FILES = readEnvInt(env.VITE_MAX_FILES, 20_000);

export interface RejectedFile {
  fileName: string;
  error: string;
}

export interface ValidationResult {
  accepted: File[];
  rejected: RejectedFile[];
  /** Error a nivel de lote (p.ej. demasiados archivos), si aplica. */
  batchError?: string;
}

function describeFileError(file: File): string | null {
  const isPdfExt = file.name.toLowerCase().endsWith(".pdf");
  const isPdfMime = file.type === "application/pdf" || file.type === "";
  if (!isPdfExt && !isPdfMime) return "No es un archivo PDF.";
  if (file.size === 0) return "El archivo está vacío.";
  if (file.size > MAX_FILE_SIZE) {
    return `Supera el tamaño máximo de ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)} MB.`;
  }
  return null;
}

/** Clasifica los archivos en aceptados y rechazados (con motivo). */
export function validateFiles(files: FileList | File[]): ValidationResult {
  const list = Array.from(files);

  if (list.length > MAX_FILES) {
    return {
      accepted: [],
      rejected: [],
      batchError: `Se seleccionaron ${list.length} archivos. El máximo permitido es ${MAX_FILES}. Divide el lote e inténtalo de nuevo.`,
    };
  }

  const accepted: File[] = [];
  const rejected: RejectedFile[] = [];
  for (const file of list) {
    const error = describeFileError(file);
    if (error) rejected.push({ fileName: file.name, error });
    else accepted.push(file);
  }
  return { accepted, rejected };
}
