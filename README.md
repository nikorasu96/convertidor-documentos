
# Conversor PDF a Excel

**Conversor PDF a Excel** es una aplicación web (React + Vite 7 + TypeScript) que convierte archivos PDF a un documento Excel. Soporta diversos formatos de PDF, incluyendo:

- Certificado de Homologación
- Certificado de Revisión Técnica (CRT)
- SOAP (Seguro Obligatorio)
- Permiso de Circulación

La aplicación extrae datos relevantes de los PDFs utilizando extractores específicos, valida la información y genera un Excel que incluye tanto los datos extraídos como (opcionalmente) estadísticas del procesamiento.

> **El procesamiento ocurre 100% en el navegador** (pool de Web Workers con
> [unpdf](https://github.com/unjs/unpdf)/pdfjs). Los archivos **nunca se suben a
> ningún servidor**. Rendimiento medido: **~1000 PDFs en ~3 s** en un equipo de
> 16 núcleos. La arquitectura completa está documentada en
> [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## Características

- **Procesamiento client-side de alto rendimiento:**
  Un pool de Web Workers (tamaño = núcleos del equipo) parsea los PDFs en paralelo
  sin bloquear la interfaz ni cargar ningún servidor.

- **Extracción y Validación de Datos:**
  Cada formato de PDF cuenta con un extractor especializado (patrón Strategy) que
  obtiene y valida los campos críticos.

- **Generación de Excel:**
  Hoja *Datos* + hoja opcional *Estadisticas* (totales y detalle de fallos).

- **Feedback en tiempo real:**
  Progreso, conteos y tiempo estimado durante la conversión, con opción de cancelar.

- **Privacidad y robustez:**
  Los documentos no salen del equipo. Timeout por archivo, reciclaje de workers
  colgados y errores tipados con mensajes claros.

- **Pruebas Automatizadas:**
  Tests unitarios con Vitest + un script de regresión contra PDFs reales
  (`pnpm validate:extractors`).

---

## Instalación

### Requisitos

- **Node.js 20+** y **pnpm**.

### Pasos

1. **Clona el repositorio e instala dependencias:**

   ```bash
   git clone https://github.com/tu_usuario/tu_repositorio.git
   cd tu_repositorio
   pnpm install
   ```

2. **(Opcional) variables de entorno:**
   Copia `.env.example` a `.env.local` y ajusta límites si lo necesitas
   (ver [`ENV_VARIABLES.md`](./ENV_VARIABLES.md)). Todas son opcionales y NO son secretos.

---

## Uso

### Desarrollo

```bash
pnpm dev        # servidor de desarrollo (Vite) en http://localhost:5173
```

- Selecciona o arrastra los archivos PDF.
- Elige el formato (Homologación, CRT, SOAP, Permiso de Circulación).
- Observa el progreso en tiempo real y, al finalizar, la vista previa del Excel.
- Descarga el `.xlsx` generado.

### Producción

```bash
pnpm build      # type-check + build con Rolldown -> dist/
pnpm preview    # sirve dist/ localmente para verificar
```

> En hosting estático, replica las cabeceras de seguridad de `vite.config.ts`
> (CSP, X-Frame-Options, etc.) en tu CDN/reverse proxy.

### Calidad

```bash
pnpm test                  # tests unitarios (Vitest)
pnpm typecheck             # comprobación de tipos (tsc)
pnpm lint                  # ESLint
pnpm validate:extractors   # regresión sobre los PDFs reales de "pdf pruebas/"
```

---

## Arquitectura del Proyecto

Arquitectura por capas con núcleo puro y procesamiento en Web Workers. Resumen:

- **`core/`** — Lógica pura e isomórfica (sin DOM/Node/React): dominio, detección
  de formato, extractores (patrón Strategy + registry) y pipeline.
- **`infra/`** — Adaptador del motor de texto (`unpdf`/pdfjs) detrás de una interfaz.
- **`workers/`** — Web Worker que ejecuta el pipeline fuera del hilo principal.
- **`client/`** — Orquestación en el navegador: pool de workers, motor, generación
  de Excel y validación de archivos.
- **`hooks/` + `components/` + `app/`** — UI en React (presentación) y el hook
  `useConversion` (máquina de estados).

Detalle completo, principios SOLID y flujo en [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## Contribución

¡Las contribuciones son bienvenidas! Para contribuir:

1. Haz un _fork_ del repositorio.
2. Crea una rama (_branch_) para tu mejora o corrección.
3. Envía un _pull request_ describiendo los cambios realizados.

---

## Licencia

Este proyecto está bajo la licencia [MIT](LICENSE).

---
