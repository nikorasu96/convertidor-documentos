// src/utils/excel/columnUtils.ts
const COLUMN_WIDTH_FACTOR = 1.2;
const MIN_COLUMN_WIDTH = 10;

/**
 * Ajusta el ancho de las columnas en función del contenido.
 * Calcula todos los máximos en un solo recorrido de los registros (O(rows) en vez de O(cols*rows)).
 * @param sheet La hoja de Excel.
 * @param headers Arreglo de encabezados.
 * @param registros Arreglo de registros (cada registro es un objeto).
 */
export function setColumnWidths(
  sheet: any,
  headers: string[],
  registros: Record<string, string>[]
): void {
  // Inicializar con la longitud de cada header
  const maxLengths = headers.map((h) => h.length);

  // Un solo pase por todos los registros
  for (const registro of registros) {
    for (let i = 0; i < headers.length; i++) {
      const valor = registro[headers[i]];
      if (valor) {
        const len = valor.toString().length;
        if (len > maxLengths[i]) maxLengths[i] = len;
      }
    }
  }

  // Aplicar anchos calculados
  for (let i = 0; i < headers.length; i++) {
    const width = Math.max(maxLengths[i] * COLUMN_WIDTH_FACTOR, MIN_COLUMN_WIDTH);
    sheet.column(i + 1).width(width);
  }
}
