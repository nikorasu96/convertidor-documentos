# convertidor-documentos

SPA 100 % cliente (React 19 + Vite 8 + TypeScript) que convierte PDFs vehiculares chilenos
(Homologación, CRT, SOAP, Permiso de Circulación) a Excel en un pool de Web Workers.
Arquitectura y modelo de amenaza: `docs/ARCHITECTURE.md` y `docs/SECURITY.md`.

## Reglas

- **Solo pnpm** (≥ 12.16.1). Nunca `npm`/`yarn`/`bun`: `devEngines` los rechaza.
- Dependencias nuevas o actualizadas: respetar la cuarentena de `minimumReleaseAge` y
  `trustPolicy` de `pnpm-workspace.yaml`; no excluir paquetes sin verificar su procedencia.
- Documentación nueva va en `docs/`; el `README.md` se queda en la raíz.

## Validación (todo en verde antes de dar algo por terminado)

```bash
pnpm typecheck && pnpm test && pnpm lint && pnpm build && pnpm audit
```

Regresión con el corpus real (~6.800 PDFs, fuera del repo en `C:\Users\nicolas.endress\Desktop\pdf pruebas`),
ejecutado desde el Escritorio:

```bash
TSX_TSCONFIG_PATH="<repo>/tsconfig.json" "<repo>/node_modules/.bin/tsx" "<repo>/scripts/validate-extractors.ts"
```

## Handoffs

Los handoffs de sesión (los pide el plugin `medidor-contexto`) van en `docs/handoffs/`,
un archivo por sesión: `AAAA-MM-DD-tema.md`.
