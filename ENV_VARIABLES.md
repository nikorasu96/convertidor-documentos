# Variables de Entorno

El proyecto utiliza las siguientes variables de entorno opcionales:

## Variables de Configuración

### `NEXT_PUBLIC_MAX_FILE_SIZE`

- **Descripción**: Tamaño máximo permitido para archivos PDF en bytes
- **Valor por defecto**: `5242880` (5MB)
- **Ejemplo**: `NEXT_PUBLIC_MAX_FILE_SIZE=10485760` (para 10MB)

### `PDF_CONCURRENCY`

- **Descripción**: Número máximo de PDFs que se pueden procesar simultáneamente
- **Valor por defecto**: `15`
- **Ejemplo**: `PDF_CONCURRENCY=10`

### `NODE_ENV`

- **Descripción**: Entorno de ejecución (controla el logging)
- **Valores**: `development`, `production`
- **Ejemplo**: `NODE_ENV=production`

## Configuración Local (Opcional)

Si necesitas personalizar estos valores, puedes crear un archivo `.env.local` en la raíz del proyecto:

```bash
NEXT_PUBLIC_MAX_FILE_SIZE=10485760
PDF_CONCURRENCY=10
NODE_ENV=development
```

> **Nota**: El archivo `.env.local` está incluido en `.gitignore` y no debe ser committeado al repositorio.
