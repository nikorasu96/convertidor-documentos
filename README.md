
# Conversor PDF a Excel

**Conversor PDF a Excel** es una aplicación desarrollada con Next.js y TypeScript que permite convertir archivos PDF a un documento Excel. Soporta diversos formatos de PDF, incluyendo:

- Certificado de Homologación
- Certificado de Revisión Técnica (CRT)
- SOAP (Seguro Obligatorio)
- Permiso de Circulación

La aplicación extrae datos relevantes de los PDFs utilizando extractores específicos, valida la información y genera un Excel que incluye tanto los datos extraídos como (opcionalmente) estadísticas del procesamiento. Además, se utiliza Server-Sent Events (SSE) para notificar en tiempo real el progreso del procesamiento.

---

## Características

- **Extracción y Validación de Datos:**
  Cada formato de PDF cuenta con un extractor especializado que utiliza expresiones regulares para obtener y validar campos críticos.

- **Generación de Excel:**
  Los datos se organizan en una hoja de Excel, con una hoja adicional opcional para mostrar estadísticas (totales procesados, éxitos, fallos y detalles de archivos fallidos).

- **Feedback en Tiempo Real:**
  Se informa al usuario sobre el progreso del procesamiento de los PDFs mediante SSE, permitiendo visualizar actualizaciones y tiempos estimados.

- **Interfaz de Usuario Intuitiva:**
  Basada en React, facilita la carga de archivos mediante arrastrar y soltar, selección de formato y vista previa de los resultados.

- **Pruebas Automatizadas:**
  Cuenta con una robusta suite de tests con Jest y ESLint para mantener la calidad del código y la estabilidad del proyecto.

---

## Instalación

### Requisitos

- **Node.js y npm:**
  Asegúrate de tener instaladas versiones compatibles con Next.js.

### Pasos

1. **Clona el repositorio:**

   ```bash
   git clone https://github.com/tu_usuario/tu_repositorio.git
   cd tu_repositorio
   ```

2. **Instala las dependencias:**

   ```bash
   npm install
   ```

3. **Configura las variables de entorno:**
   Crea un archivo `.env.local` en la raíz del proyecto y define, al menos, la variable:

   ```env
   NEXT_PUBLIC_MAX_FILE_SIZE=5242880
   ```

   (Puedes ajustar este valor según tus necesidades.)

---

## Uso

### En Desarrollo

1. **Inicia el servidor de desarrollo:**

   ```bash
   npm run dev
   ```

2. Abre la aplicación en [http://localhost:3000](http://localhost:3000).

3. **Carga y Conversión:**
   - Selecciona o arrastra los archivos PDF a la interfaz.
   - Selecciona el formato correspondiente mediante los botones disponibles.
   - Observa el progreso en tiempo real y, al finalizar, visualiza una vista previa del Excel.
   - Descarga el archivo Excel generado haciendo clic en el botón correspondiente.

### Ejecución de Pruebas

Para ejecutar todos los tests automatizados, utiliza:

```bash
npm run test
```

---

## Arquitectura del Proyecto

El proyecto se organiza en las siguientes áreas:

- **Frontend:**
  Implementado en React, con componentes reutilizables como:
  - `FileUpload` y `Parent` para la carga de archivos.
  - `InstructionsModal` para mostrar instrucciones al usuario.
  - `app/page.tsx` que gestiona el flujo de carga, procesamiento y visualización.

- **Backend/API:**
  - La ruta API en `app/api/convert/route.ts` recibe los archivos y el formato seleccionado.
  - Procesa los PDFs de forma concurrente (usando `p-limit`) y envía actualizaciones en tiempo real mediante SSE.

- **Extractores y Utilidades:**
  - Los extractores (en la carpeta `extractors/`) se encargan de extraer datos específicos de cada formato.
  - Las utilidades en `utils/` incluyen funciones para parseo, validaciones, generación del Excel y logging.

- **Pruebas:**
  - Test unitarios escritos en Jest y configurados en `jest.config.js` para asegurar la calidad del código.

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
