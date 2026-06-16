# Arquitectura

Conversor de PDF a Excel para documentos vehiculares chilenos (Homologación,
CRT, SOAP, Permiso de Circulación). **SPA con Vite 7** (bundler Rust **Rolldown**)
donde **todo el procesamiento ocurre en el navegador**: los PDFs nunca salen del
equipo del usuario.

## Stack

- **Vite 7 + Rolldown** (`rolldown-vite`) — build/bundler en Rust (build ~1 s).
- **React 19** + **TypeScript** (SPA, sin SSR ni backend).
- **Tailwind CSS v4** (`@tailwindcss/vite`).
- **unpdf** (pdfjs) para extracción de texto, en un **pool de Web Workers**.
- **xlsx-populate** (carga dinámica) para generar el `.xlsx`.
- **Vitest** para tests; **ESLint** para lint.

## Decisión clave: procesamiento client-side

El motor de PDF corre en un **pool de Web Workers** dentro del navegador:

- **Velocidad**: sin subir ~135 MB por lote ni bufferizar en servidor.
  Medido: **1000 PDFs en ~3 s** (16 núcleos).
- **Privacidad/seguridad**: documentos con RUT/patente nunca se transmiten;
  cero superficie de ataque de manejo de archivos en servidor.
- **Escalabilidad**: la carga la absorbe el equipo del usuario; solo se sirven
  assets estáticos.
- **Fluidez**: el parseo corre fuera del hilo principal → la UI no se congela.

## Capas (de adentro hacia afuera)

```text
index.html              # entrada Vite (script anti-flash de tema)
src/
  main.tsx              # bootstrap React + fuente Inter + estilos
  App.tsx               # cablea hook + componentes
  index.css            # Tailwind v4 + tema (claro/oscuro) + animaciones
  core/                # PURO e isomórfico: sin DOM, sin Node, sin React, sin libs de PDF/Excel
    domain/            # tipos: PDFFormat, resultados, errores tipados (con code)
    text/              # PdfTextSource: interfaz del motor de texto (Dependency Inversion)
    extraction/        # detección de formato + extractores por formato (Strategy + registry)
      formats/         # crt | homologacion | soap | permisoCirculacion
    pipeline/          # processDocument (parse→detecta→extrae→valida) y buildTable
  infra/pdf/           # unpdfTextSource: implementación de PdfTextSource con unpdf (pdfjs)
  workers/             # conversion.worker.ts (cablea processDocument + unpdf) + protocol
  client/              # solo navegador
    engine/            # WorkerPool, conversionEngine, convertBatch (caso de uso)
    excel/             # buildWorkbook (xlsx-populate, import dinámico)
    files/             # validateFiles (tipo/tamaño/límite)
  hooks/useConversion  # máquina de estados (idle→processing→done/error/cancelled)
  components/          # UI (presentación) + icons.tsx (SVG) + ThemeToggle
vite.config.ts         # plugins (react, tailwind), alias @/→src, worker ESM, cabeceras de seguridad, Vitest
```

### Principios SOLID

- **SRP**: cada módulo una responsabilidad. **OCP**: nuevo formato = `Extractor` +
  registrarlo en `extraction/registry.ts`, sin tocar el pipeline. **LSP**: todos
  los extractores cumplen la interfaz `Extractor`. **ISP**: `PdfTextSource` mínima
  (`extractText`). **DIP**: `core/` depende de la abstracción, no de unpdf/pdfjs.

## Flujo de una conversión

1. `useConversion.start(files, format)` → `validateFiles` separa válidos/inválidos.
2. `convertBatch` → `convertFiles` reparte los archivos en el `WorkerPool`
   (tamaño = núcleos). Lectura **perezosa** de bytes + **transferables** (zero-copy)
   → memoria acotada a ~N archivos en vuelo.
3. Cada worker: `unpdf` extrae texto → `processDocument` detecta, extrae y valida →
   resultado estructurado (`ok` o `error` con `code`).
4. Se construyen tabla (vista previa) y `.xlsx` (hojas *Datos* + *Estadisticas*).

## Seguridad

- **CSP + cabeceras** (X-Frame-Options, nosniff, Referrer/Permissions-Policy) en
  `vite.config.ts` para `vite dev`/`vite preview`. **En hosting estático de
  producción deben replicarse en el proveedor (CDN/reverse proxy)** — Vite no
  emite cabeceras en archivos estáticos.
- Errores tipados con `code` (`NO_TEXT_LAYER`, `FORMAT_MISMATCH`, `VALIDATION_ERROR`,
  `PARSE_ERROR`, `FILE_INVALID`). Timeout por archivo + reciclaje de worker colgado.
- PDFs escaneados (sin capa de texto, ~48 % de los CRT de prueba) → `NO_TEXT_LAYER`
  con mensaje accionable (OCR fuera de alcance).

## Validación

- **Unitaria** (`pnpm test`, Vitest): extractores, `processDocument`, `buildTable`,
  `validateFiles` (dobles de prueba; sin archivos externos).
- **Regresión sobre corpus real** (`pnpm validate:extractors`): pipeline real (unpdf)
  contra `pdf pruebas/`. Referencia: Homologación 395/395, SOAP 5550/5550,
  Permiso 428/428, CRT 100 con texto (136 escaneados marcados correctamente).
- **Tipos** (`pnpm typecheck`) y **lint** (`pnpm lint`).
