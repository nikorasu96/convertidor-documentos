// scripts/validate-extractors.ts
// Herramienta de regresión: ejecuta el pipeline real (unpdf + core) contra el
// corpus local de PDFs ("pdf pruebas/") y reporta tasas de éxito por formato y
// rendimiento. Uso: `pnpm validate:extractors`  (o `npx tsx scripts/...`).
//
// No forma parte del build ni de los tests unitarios; es una validación manual
// sobre documentos reales (que no se versionan).

import fs from "fs";
import path from "path";
import { unpdfTextSource } from "@/infra/pdf/unpdfTextSource";
import { processDocument } from "@/core/pipeline/processDocument";
import { buildTable } from "@/core/pipeline/buildTable";
import type { PDFFormat } from "@/core/domain/format";
import { isSuccess } from "@/core/domain/result";

const CORPUS = path.join(process.cwd(), "pdf pruebas");
const CASES: { dir: string; format: PDFFormat; minSuccess: number }[] = [
  { dir: "Homologacion", format: "CERTIFICADO_DE_HOMOLOGACION", minSuccess: 0.99 },
  { dir: "SOAP", format: "SOAP", minSuccess: 0.99 },
  { dir: "Permiso de Circulacion", format: "PERMISO_CIRCULACION", minSuccess: 0.99 },
  // CRT: ~48% del corpus son escaneados (sin texto), por eso el umbral es menor.
  { dir: "Certificado de revision tecnica", format: "CRT", minSuccess: 0.3 },
];

function collect(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.toLowerCase().endsWith(".pdf")) out.push(p);
    }
  };
  walk(dir);
  return out;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    })
  );
  return out;
}

async function main() {
  let failed = false;
  for (const c of CASES) {
    const files = collect(path.join(CORPUS, c.dir));
    if (files.length === 0) {
      console.log(`\n### ${c.dir}: (sin archivos, omitido)`);
      continue;
    }
    const byCode: Record<string, number> = {};
    const successes: { fileName: string; data: Record<string, string> }[] = [];
    const start = Date.now();
    const outcomes = await mapLimit(files, 12, async (f) => {
      const buf = fs.readFileSync(f);
      return processDocument(path.basename(f), new Uint8Array(buf), c.format, unpdfTextSource);
    });
    for (const o of outcomes) {
      if (isSuccess(o)) successes.push({ fileName: o.fileName, data: o.data });
      else byCode[o.code] = (byCode[o.code] || 0) + 1;
    }
    const elapsed = (Date.now() - start) / 1000;
    const rate = successes.length / files.length;
    const table = buildTable(successes as never, c.format);
    const ok = rate >= c.minSuccess;
    if (!ok) failed = true;
    console.log(
      `\n### ${c.dir} (${c.format}) — ${files.length} archivos en ${elapsed.toFixed(1)}s (${Math.round(
        files.length / elapsed
      )}/s)`
    );
    console.log(`  ${ok ? "OK " : "FALLO"} éxito=${(rate * 100).toFixed(1)}% (mínimo ${(c.minSuccess * 100).toFixed(0)}%)`);
    console.log(`  fallos por categoría: ${JSON.stringify(byCode)}`);
    console.log(`  headers=[${table.headers.join(", ")}]`);
  }
  if (failed) {
    console.error("\n⚠️  Una o más tasas de éxito quedaron por debajo del mínimo esperado.");
    process.exit(1);
  }
  console.log("\n✅ Validación de extractores completada.");
}

void main();
