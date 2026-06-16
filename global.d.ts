// global.d.ts

// Definiciones de tipo para "xlsx-populate" basadas en el uso actual en el proyecto.
declare module "xlsx-populate" {
  /**
   * Representa un libro de Excel (Workbook).
   */
  export interface Workbook {
    /**
     * Obtiene una hoja del libro por índice (0 basado) o por nombre.
     */
    sheet(index: number): Sheet;
    sheet(name: string): Sheet;

    /**
     * Genera el archivo Excel como un Buffer.
     */
    outputAsync(options?: { type?: string }): Promise<Buffer>;
  }

  /**
   * Representa una hoja dentro del libro de Excel.
   */
  export interface Sheet {
    /**
     * Retorna una celda específica en la hoja.
     * @param row Número de fila (1 basado).
     * @param col Número de columna (1 basado).
     */
    cell(row: number, col: number): Cell;

    /**
     * Retorna una columna específica en la hoja.
     * @param index Número de columna (1 basado).
     */
    column(index: number): Column;

    /**
     * Retorna una fila específica en la hoja.
     * @param index Número de fila (1 basado).
     */
    row(index: number): Row;
  }

  /**
   * Representa una celda dentro de la hoja.
   */
  export interface Cell {
    /**
     * Sin argumentos, retorna el valor de la celda.
     * Con argumento, establece el valor y retorna la celda.
     */
    value(): any;
    value(newValue: any): this;

    /**
     * Establece un estilo específico en la celda.
     */
    style(key: string, value: any): this;
  }

  /**
   * Representa una columna dentro de la hoja.
   */
  export interface Column {
    /**
     * Sin argumentos, retorna el ancho actual de la columna.
     * Con argumento, establece el ancho y retorna la columna.
     */
    width(): number;
    width(newWidth: number): this;

    /**
     * Establece un estilo específico en la columna.
     */
    style(key: string, value: any): this;
  }

  /**
   * Representa una fila dentro de la hoja.
   */
  export interface Row {
    /**
     * Sin argumentos, retorna la altura actual de la fila.
     * Con argumento, establece la altura y retorna la fila.
     */
    height(): number;
    height(newHeight: number): this;
  }

  /**
   * Métodos estáticos disponibles en XlsxPopulate.
   */
  export interface XlsxPopulateStatic {
    /**
     * Crea un libro de Excel en blanco.
     */
    fromBlankAsync(): Promise<Workbook>;
  }

  /**
   * Exporta la instancia principal de XlsxPopulate.
   */
  const XlsxPopulate: XlsxPopulateStatic;
  export default XlsxPopulate;
}

// Build de navegador (sin dependencia de `fs`). Se usa vía import dinámico en el
// cliente; el tipado preciso no es necesario (se castea a `any` en el writer).
declare module "xlsx-populate/browser/xlsx-populate" {
  const XlsxPopulate: unknown;
  export default XlsxPopulate;
}
