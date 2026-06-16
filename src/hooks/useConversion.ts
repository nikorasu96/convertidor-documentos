// src/hooks/useConversion.ts
// Hook de estado para la conversión cliente. Encapsula la máquina de estados
// (idle -> processing -> done/error/cancelled) y delega TODO el trabajo pesado
// en la capa client/ (convertBatch). La UI solo lee estado y llama start/cancel/reset.

import { useCallback, useRef, useState } from "react";
import type { PDFFormat } from "@/core/domain/format";
import type { Table } from "@/core/pipeline/buildTable";
import type { ConversionStats } from "@/core/domain/result";
import type { Progress } from "@/client/engine/conversionEngine";
import { convertBatch } from "@/client/engine/convertBatch";
import { validateFiles } from "@/client/files/validateFiles";

export type ConversionStatus = "idle" | "processing" | "done" | "error" | "cancelled";

export interface ExcelFile {
  blob: Blob;
  fileName: string;
}

interface ConversionState {
  status: ConversionStatus;
  progress: Progress | null;
  table: Table | null;
  excel: ExcelFile | null;
  stats: ConversionStats | null;
  error: string | null;
  durationMs: number | null;
}

const INITIAL: ConversionState = {
  status: "idle",
  progress: null,
  table: null,
  excel: null,
  stats: null,
  error: null,
  durationMs: null,
};

export function useConversion() {
  const [state, setState] = useState<ConversionState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(INITIAL);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const start = useCallback(async (files: FileList | File[], format: PDFFormat) => {
    const { accepted, rejected, batchError } = validateFiles(files);

    if (batchError) {
      setState({ ...INITIAL, status: "error", error: batchError });
      return;
    }
    if (accepted.length === 0 && rejected.length === 0) {
      setState({ ...INITIAL, status: "error", error: "No se seleccionaron archivos." });
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const startedAt = performance.now();

    setState({
      ...INITIAL,
      status: "processing",
      progress: {
        processed: 0,
        total: accepted.length,
        successes: 0,
        failures: 0,
        estimatedMsLeft: 0,
        elapsedMs: 0,
      },
    });

    try {
      const result = await convertBatch(accepted, format, {
        signal: controller.signal,
        preRejected: rejected,
        onProgress: (p) => setState((s) => (s.status === "processing" ? { ...s, progress: p } : s)),
      });

      setState({
        status: "done",
        progress: null,
        table: result.table,
        excel: result.excel,
        stats: result.stats,
        error: null,
        durationMs: performance.now() - startedAt,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setState({ ...INITIAL, status: "cancelled" });
        return;
      }
      const message =
        e instanceof Error ? e.message : "Ocurrió un error inesperado durante la conversión.";
      setState({ ...INITIAL, status: "error", error: message });
    } finally {
      abortRef.current = null;
    }
  }, []);

  return { ...state, start, cancel, reset };
}
