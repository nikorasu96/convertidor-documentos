// src/workers/conversion.worker.ts
// Web Worker: procesa un PDF (parse + extracción + validación) fuera del hilo
// principal para mantener la UI fluida. Toda la lógica vive en core/ (puro);
// aquí solo se cablea el motor concreto (unpdf) y el transporte postMessage.

/// <reference lib="webworker" />

import { processDocument } from "@/core/pipeline/processDocument";
import { unpdfTextSource } from "@/infra/pdf/unpdfTextSource";
import { toErrorMessage } from "@/core/domain/errors";
import type { WorkerRequest, WorkerResponse } from "./protocol";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, fileName, format, bytes } = event.data;
  try {
    const outcome = await processDocument(fileName, new Uint8Array(bytes), format, unpdfTextSource);
    const res: WorkerResponse = { id, outcome };
    ctx.postMessage(res);
  } catch (e) {
    // Red de seguridad: processDocument no debería lanzar, pero si lo hace,
    // devolvemos un fallo estructurado en lugar de matar el worker.
    const res: WorkerResponse = {
      id,
      outcome: {
        status: "error",
        fileName,
        code: "INTERNAL",
        error: toErrorMessage(e),
      },
    };
    ctx.postMessage(res);
  }
};
