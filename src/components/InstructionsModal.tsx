"use client";

import { useEffect } from "react";
import { X, UploadCloud, Table, Download, Eraser, ShieldCheck } from "./icons";

interface InstructionsModalProps {
  onClose: () => void;
}

const STEPS = [
  { icon: UploadCloud, title: "Carga tus PDF", text: "Arrastra o selecciona uno o varios archivos PDF." },
  { icon: Table, title: "Elige el formato", text: "Homologación, Revisión Técnica, SOAP o Permiso de Circulación." },
  {
    icon: Download,
    title: "Revisa y descarga",
    text: "Verás una vista previa compacta (usa “Expandir” para verla completa) y descargas el Excel.",
  },
  {
    icon: Eraser,
    title: "Nueva conversión",
    text: "Al terminar, el formulario se contrae; pulsa “Nueva conversión” para procesar otro lote.",
  },
];

export default function InstructionsModal({ onClose }: InstructionsModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-3001 flex animate-fade-in items-center justify-center overflow-y-auto bg-neutral-950/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg animate-scale-in rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4 dark:border-neutral-800">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            Cómo funciona
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <X />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-[1.05rem] text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                <s.icon />
              </span>
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{s.title}</p>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">{s.text}</p>
              </div>
            </div>
          ))}

          <div className="flex items-start gap-3 rounded-xl bg-neutral-50 px-3 py-3 dark:bg-neutral-800/50">
            <ShieldCheck className="mt-0.5 shrink-0 text-[1.05rem] text-emerald-600 dark:text-emerald-400" />
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              Todo se procesa <span className="font-medium text-neutral-800 dark:text-neutral-200">en tu navegador</span>.
              Tus documentos nunca se suben a ningún servidor.
            </p>
          </div>
        </div>

        <div className="flex justify-end border-t border-neutral-100 px-5 py-4 dark:border-neutral-800">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-neutral-800 active:scale-[0.98] dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
