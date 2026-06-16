# Checklists

## QA (antes de entregar)

- [ ] `pnpm test` en verde (unitarios de core/cliente).
- [ ] `pnpm validate:extractors` con los PDF reales: Homologación/SOAP/Permiso ~100 %.
- [ ] `pnpm build` sin errores de TypeScript ni ESLint.
- [ ] Conversión real por formato (Homologación, CRT, SOAP, Permiso): datos y Excel correctos.
- [ ] Casos borde: PDF escaneado (→ `NO_TEXT_LAYER`), formato equivocado (→ `FORMAT_MISMATCH`),
      archivo no-PDF / vacío / grande (→ rechazado), lote 0 archivos, lote grande (1000+).
- [ ] Excel: hojas *Datos* + *Estadisticas*, orden de columnas y dígito verificador correctos.
- [ ] UX: estados de carga, error, cancelado y vacío; botón Cancelar funciona.
- [ ] Responsive: 320 / 375 / 768 / 1280 px sin scroll horizontal; tabla con scroll interno.
- [ ] Tema claro y oscuro; sin parpadeo al recargar.
- [ ] Consola del navegador sin errores ni violaciones de CSP.

## Despliegue

- [ ] Variables `VITE_*` definidas si se cambian los límites (ver `.env.example`).
- [ ] `pnpm build` (type-check + Rolldown) genera `dist/`; `pnpm preview` para verificar.
- [ ] Publicar `dist/` como sitio estático (CDN / hosting estático).
- [ ] **Replicar las cabeceras de seguridad de `vite.config.ts`** (CSP, X-Frame-Options,
      X-Content-Type-Options, Referrer-Policy, Permissions-Policy) en el CDN/reverse proxy:
      Vite no emite cabeceras en archivos estáticos servidos por terceros.
- [ ] `pnpm audit` revisado; sin vulnerabilidades altas en dependencias de producción.
- [ ] Verificar en producción: una conversión de prueba + descarga del Excel.
- [ ] Plan de rollback: volver al commit/release anterior (no hay estado ni migraciones).
