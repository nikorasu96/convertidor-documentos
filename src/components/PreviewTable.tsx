"use client";

import React, { useEffect, useState } from "react";
import { FixedSizeList as List } from "react-window";
import { saveAs } from "file-saver";
import { Table, Download, Maximize } from "./icons";

interface PreviewTableProps {
  memoizedHeaders: string[];
  memoizedRows: string[][];
  setIsExpanded: (value: boolean) => void;
  excelBlob: Blob | null;
  fileName: string;
}

const ROW_HEIGHT = 38;
const MAX_TABLE_PX = 340; // alto máx. de la vista previa (~9 filas); para ver todo está "Expandir"
const MAX_VIEWPORT_FRACTION = 0.45; // y nunca más del 45% del alto de pantalla

const PreviewTable: React.FC<PreviewTableProps> = ({
  memoizedHeaders,
  memoizedRows,
  setIsExpanded,
  excelBlob,
  fileName,
}) => {
  const [hovered, setHovered] = useState<number | null>(null);

  // Alto de la tabla acotado: crece con las filas pero nunca pasa de ~60vh.
  // Pocas filas -> tabla compacta; muchas -> 60vh con scroll interno (la lista
  // virtual). Así la página no se alarga de más y nada queda "flotando".
  const [listHeight, setListHeight] = useState(320);
  useEffect(() => {
    const compute = () => {
      const contentH = Math.max(ROW_HEIGHT, memoizedRows.length * ROW_HEIGHT);
      setListHeight(Math.min(contentH, MAX_TABLE_PX, Math.round(window.innerHeight * MAX_VIEWPORT_FRACTION)));
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [memoizedRows.length]);

  const renderRow = (row: string[], style: React.CSSProperties, rowIndex: number) => (
    <div
      style={{ ...style, display: "table", tableLayout: "fixed", width: "100%" }}
      key={rowIndex}
      onMouseEnter={() => setHovered(rowIndex)}
      onMouseLeave={() => setHovered(null)}
      className={[
        "text-sm transition-colors",
        hovered === rowIndex
          ? "bg-neutral-100 dark:bg-neutral-800"
          : rowIndex % 2 === 0
            ? "bg-white dark:bg-neutral-900"
            : "bg-neutral-50/60 dark:bg-neutral-900/40",
      ].join(" ")}
    >
      {memoizedHeaders.map((_, colIdx) => (
        <div
          key={colIdx}
          style={{ display: "table-cell" }}
          className="truncate border-b border-neutral-100 px-3 py-2 align-middle text-neutral-700 dark:border-neutral-800 dark:text-neutral-300"
        >
          {row[colIdx] ?? ""}
        </div>
      ))}
    </div>
  );

  const minWidth = Math.max(720, memoizedHeaders.length * 130);

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center gap-2">
        <Table className="text-[1.05rem] text-neutral-500 dark:text-neutral-400" />
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Vista previa</h2>
        <span className="text-xs text-neutral-400 dark:text-neutral-500">
          {memoizedRows.length} fila{memoizedRows.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="overflow-x-auto">
          <div style={{ minWidth }}>
            <div
              style={{ display: "table", tableLayout: "fixed", width: "100%" }}
              className="bg-neutral-50 dark:bg-neutral-800/60"
            >
              {memoizedHeaders.map((header, idx) => (
                <div
                  key={idx}
                  style={{ display: "table-cell" }}
                  className="truncate border-b border-neutral-200 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
                >
                  {header}
                </div>
              ))}
            </div>
            <List height={listHeight} itemCount={memoizedRows.length} itemSize={ROW_HEIGHT} width="100%">
              {({ index, style }) => renderRow(memoizedRows[index], style, index)}
            </List>
          </div>
        </div>
      </div>

      <div className="mt-4 flex shrink-0 flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 transition-all duration-200 hover:border-neutral-300 hover:bg-neutral-50 active:scale-[0.98] dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          <Maximize className="text-[1.05rem]" />
          Expandir
        </button>
        <button
          type="button"
          onClick={() => excelBlob && saveAs(excelBlob, fileName)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-neutral-800 active:scale-[0.98] dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
        >
          <Download className="text-[1.05rem]" />
          Descargar Excel
        </button>
      </div>
    </div>
  );
};

export default PreviewTable;
