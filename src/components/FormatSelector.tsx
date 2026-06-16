"use client";

import React from "react";
import type { PDFFormat } from "@/core/domain/format";
import { Check } from "./icons";

interface FormatSelectorProps {
  pdfFormat: PDFFormat | null;
  loading: boolean;
  onFormatChange: (format: PDFFormat) => void;
}

const FORMATS: { value: PDFFormat; label: string; hint: string }[] = [
  { value: "CERTIFICADO_DE_HOMOLOGACION", label: "Homologación", hint: "Certificado de homologación de vehículos." },
  { value: "CRT", label: "Revisión Técnica", hint: "Certificado de Revisión Técnica (CRT)." },
  { value: "SOAP", label: "SOAP", hint: "Seguro Obligatorio de Accidentes Personales." },
  { value: "PERMISO_CIRCULACION", label: "Permiso de Circulación", hint: "Permiso de circulación anual." },
];

const FormatSelector: React.FC<FormatSelectorProps> = ({ pdfFormat, loading, onFormatChange }) => {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        Tipo de documento
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {FORMATS.map((f) => {
          const active = pdfFormat === f.value;
          return (
            <button
              key={f.value}
              type="button"
              disabled={loading}
              title={f.hint}
              aria-pressed={active}
              onClick={() => onFormatChange(f.value)}
              className={[
                "relative flex min-h-13 items-center justify-center rounded-xl border px-3 py-2.5 text-center text-sm font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50",
                active
                  ? "border-neutral-900 bg-neutral-900 text-white shadow-sm dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                  : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50 active:scale-[0.98] dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-700 dark:hover:bg-neutral-800/60",
              ].join(" ")}
            >
              <span className="leading-tight">{f.label}</span>
              {active && (
                <span className="absolute right-1.5 top-1.5 text-[0.8rem] opacity-90">
                  <Check />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default FormatSelector;
