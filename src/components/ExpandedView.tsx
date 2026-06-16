"use client";

import React, { useEffect, useState } from "react";
import { FixedSizeList as List } from "react-window";
import { X, Table } from "./icons";

interface ExpandedViewProps {
  memoizedHeaders: string[];
  memoizedRows: string[][];
  setIsExpanded: (value: boolean) => void;
}

const ROW_HEIGHT = 38;

const ExpandedView: React.FC<ExpandedViewProps> = ({ memoizedHeaders, memoizedRows, setIsExpanded }) => {
  const [height, setHeight] = useState(480);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setHeight(window.innerHeight - 150);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setIsExpanded(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setIsExpanded]);

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
          {Array.isArray(row) ? (row[colIdx] ?? "") : ""}
        </div>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-3000 flex animate-fade-in flex-col bg-neutral-950/40 backdrop-blur-sm">
      <div className="m-2 flex flex-1 animate-scale-in flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900 sm:m-4">
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <Table className="text-[1.05rem] text-neutral-500 dark:text-neutral-400" />
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Vista expandida
            </h2>
            <span className="text-xs text-neutral-400 dark:text-neutral-500">
              {memoizedRows.length} filas
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsExpanded(false)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-600 transition-all duration-200 hover:bg-neutral-100 active:scale-95 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <X className="text-[1rem]" />
            Cerrar
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          <div style={{ minWidth: Math.max(720, memoizedHeaders.length * 130) }}>
            <div
              style={{ display: "table", tableLayout: "fixed", width: "100%" }}
              className="sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-800/80"
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
            <List height={height} itemCount={memoizedRows.length} itemSize={ROW_HEIGHT} width="100%">
              {({ index, style }) => renderRow(memoizedRows[index], style, index)}
            </List>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExpandedView;
