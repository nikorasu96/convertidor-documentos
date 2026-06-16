# Variables de Entorno

El procesamiento de PDFs ocurre **100% en el navegador** (Web Workers); no hay
backend ni subida de archivos. La app es una SPA con **Vite**, que solo expone al
cliente las variables con prefijo `VITE_`. Todas son **opcionales**.

## Variables

### `VITE_MAX_FILE_SIZE`

- **Descripción**: Tamaño máximo permitido por archivo PDF, en bytes.
- **Valor por defecto**: `10485760` (10 MB)
- **Ejemplo**: `VITE_MAX_FILE_SIZE=5242880` (5 MB)

### `VITE_MAX_FILES`

- **Descripción**: Número máximo de archivos por lote.
- **Valor por defecto**: `20000`
- **Ejemplo**: `VITE_MAX_FILES=10000`

> La concurrencia de procesamiento **no se configura**: se ajusta automáticamente
> al número de núcleos del equipo (`navigator.hardwareConcurrency`, acotado a `[2, 16]`).

## Configuración local (opcional)

Copia `.env.example` a `.env.local` y ajusta los valores que necesites:

```bash
cp .env.example .env.local
```

> **Nota**: `.env.local` está en `.gitignore` y no debe committearse. Como el
> procesamiento es client-side, estas variables NO son secretos.
