"use client";

import React, { useRef, useState, type DragEvent } from "react";
import { UploadCloud, FileText } from "./icons";

interface FileSelectorProps {
  files: FileList | null;
  loading: boolean;
  onFileChange: (fileList: FileList | null) => void;
}

const FileSelector: React.FC<FileSelectorProps> = ({ files, loading, onFileChange }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    if (loading) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    if (loading) return;
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.length) onFileChange(e.dataTransfer.files);
  };

  const count = files?.length ?? 0;

  return (
    <div>
      <div
        role="button"
        tabIndex={loading ? -1 : 0}
        onClick={() => !loading && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!loading && (e.key === "Enter" || e.key === " ")) inputRef.current?.click();
        }}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={[
          "group relative flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-8 text-center outline-none transition-all duration-300",
          loading ? "cursor-not-allowed opacity-60" : "cursor-pointer",
          dragActive
            ? "border-neutral-900 bg-neutral-100 dark:border-neutral-100 dark:bg-neutral-900"
            : "border-neutral-300 bg-white hover:border-neutral-400 hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-neutral-900/20 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600 dark:hover:bg-neutral-800/60 dark:focus-visible:ring-neutral-100/20",
        ].join(" ")}
      >
        <span
          className={[
            "flex h-12 w-12 items-center justify-center rounded-full text-[1.4rem] transition-transform duration-300",
            "bg-neutral-100 text-neutral-700 group-hover:scale-105 dark:bg-neutral-800 dark:text-neutral-300",
            dragActive ? "scale-110" : "",
          ].join(" ")}
        >
          <UploadCloud />
        </span>
        <div>
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Arrastra tus PDF aquí</p>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            o haz clic para seleccionarlos · se procesan en tu equipo
          </p>
        </div>

        <input
          id="file-upload"
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          disabled={loading}
          onChange={(e) => onFileChange(e.target.files)}
        />
      </div>

      {count > 0 && (
        <div className="mt-3 animate-fade-in rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              {count} archivo{count > 1 ? "s" : ""} seleccionado{count > 1 ? "s" : ""}
            </span>
          </div>
          <ul className="max-h-28 space-y-1 overflow-y-auto border-t border-neutral-100 px-4 py-2 text-sm dark:border-neutral-800">
            {Array.from(files!)
              .slice(0, 200)
              .map((file, idx) => (
                <li key={idx} className="flex items-center gap-2 text-neutral-600 dark:text-neutral-300">
                  <FileText className="shrink-0 text-neutral-400 dark:text-neutral-500" />
                  <span className="truncate">{file.name}</span>
                </li>
              ))}
            {count > 200 && (
              <li className="pl-6 text-xs text-neutral-400 dark:text-neutral-500">…y {count - 200} más</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default FileSelector;
