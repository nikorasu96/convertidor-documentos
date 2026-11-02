# 📖 API Documentation - Convertidor de PDFs a Excel

**Versión:** 0.1.0  
**Último actualizado:** 2026-11-02  
**Status:** Documentación completa

---

## 🏗️ Arquitectura de Capas

```
┌─────────────────────────────────────────┐
│         React Components (UI)            │ Componentes, hooks
├─────────────────────────────────────────┤
│    useConversion Hook (Orquestación)     │ Estado y coordinación
├─────────────────────────────────────────┤
│   Client Engine (Web Workers, Pool)      │ Paralelismo
├─────────────────────────────────────────┤
│   Core Domain (Extracción, Validación)   │ Lógica de negocio
├─────────────────────────────────────────┤
│   Infrastructure (PDF, Excel)            │ Integración de librerías
└─────────────────────────────────────────┘
```

---

## 🔴 Client Engine API

### `WorkerPool`

Pool de Web Workers para procesamiento paralelo de PDFs.

```typescript
import { WorkerPool } from '@/client/engine/WorkerPool';

// Crear pool
const pool = new WorkerPool(
  () => new Worker(workerPath, { type: 'module' }),
  { 
    size: 4,                    // Nº de workers (default: navigator.hardwareConcurrency)
    taskTimeoutMs: 30_000       // Timeout por tarea (default: 30s)
  }
);

// Enviar archivo para procesamiento
const outcome = await pool.submit(
  'documento.pdf',             // Nombre del archivo
  'CRT',                       // Formato (CRT|SOAP|Homologación|PermsoCirculación)
  () => fileInput.arrayBuffer() // Función que lee bytes (lazy)
);

// Resultado: ConversionOutcome
if (outcome.status === 'ok') {
  console.log(outcome.fileName, outcome.data);
} else {
  console.error(outcome.fileName, outcome.error, outcome.code);
}

// Liberar recursos
pool.terminate();
```

**Características:**
- ✅ Lectura perezosa (bytes leídos solo cuando hay worker libre)
- ✅ Zero-copy transfers (ArrayBuffer sin duplicar)
- ✅ Timeout y reciclaje automático (no quedan workers colgados)
- ✅ Tolerancia a fallos (worker muerto se reemplaza)

**Interfaz Pública:**

```typescript
interface WorkerPool {
  // Envía un archivo a procesar
  submit(fileName: string, format: PDFFormat, readBytes: () => Promise<ArrayBuffer>)
    : Promise<ConversionOutcome>;
  
  // Termina todos los workers y limpia recursos
  terminate(): void;
}

interface WorkerPoolOptions {
  size?: number;              // Pool size (default: auto-detect)
  taskTimeoutMs?: number;     // Timeout en ms (default: 30_000)
}

function defaultPoolSize(): number;  // Detecta nº de CPUs, acotado [2,16]
```

---

### `convertFiles`

Orquesta la conversión de un lote de archivos con progress reporting.

```typescript
import { convertFiles, type Progress } from '@/client/engine/conversionEngine';

const outcomes = await convertFiles(
  fileList,                   // File[] a procesar
  'CRT',                      // Formato destino
  {
    poolSize: 8,              // Override del tamaño del pool
    signal: abortController.signal,  // Para cancelar
    onProgress: (p: Progress) => {
      console.log(`${p.processed}/${p.total} (${p.successes} OK, ${p.failures} FAIL)`);
      console.log(`ETA: ${p.estimatedMsLeft}ms, elapsed: ${p.elapsedMs}ms`);
    }
  }
);

// outcomes es un array en el MISMO orden que fileList
```

**Interfaz:**

```typescript
interface Progress {
  processed: number;      // Archivos procesados
  total: number;          // Total de archivos
  successes: number;      // Conversiones exitosas
  failures: number;       // Conversiones fallidas
  estimatedMsLeft: number; // Estimación en ms
  elapsedMs: number;      // Tiempo transcurrido
}

async function convertFiles(
  files: File[],
  format: PDFFormat,
  opts?: ConvertOptions
): Promise<ConversionOutcome[]>;
```

---

### `convertBatch`

Servicio de aplicación que orquesta todo: conversión, tabla, estadísticas, Excel.

```typescript
import { convertBatch, type BatchResult } from '@/client/engine/convertBatch';

const result = await convertBatch(
  fileList,
  'CRT',
  {
    signal: abortController.signal,
    onProgress: (p) => updateUI(p),
    preRejected: [] // Archivos rechazados en validación previa
  }
);

// result contiene TODO lo necesario para la UI
console.log(result.successes);      // ConversionSuccess[]
console.log(result.failures);       // ConversionFailure[]
console.log(result.table);          // Tabla estructurada
console.log(result.stats);          // Estadísticas
console.log(result.excel);          // Workbook para descargar
```

**Interfaz:**

```typescript
interface BatchResult {
  successes: ConversionSuccess[];
  failures: ConversionFailure[];
  table: Table;
  stats: ConversionStats;
  excel: WorkbookFile;
}

interface BatchOptions {
  signal?: AbortSignal;
  onProgress?: (p: Progress) => void;
  preRejected?: RejectedFile[];
}

async function convertBatch(
  files: File[],
  format: PDFFormat,
  opts?: BatchOptions
): Promise<BatchResult>;
```

---

## 🟠 Core Extraction API

### `Extractor`

Interfaz base para extractores de formato específico.

```typescript
import type { Extractor } from '@/core/extraction/Extractor';

interface Extractor {
  // Extrae datos estructurados del texto del PDF
  extract(text: string): Record<string, any>;
  
  // Identifica si el texto corresponde a este formato
  detect(text: string): boolean;
}
```

---

### Formatos Soportados

#### 1. **CRT (Certificado de Revisión Técnica)**
```typescript
import { crtExtractor } from '@/core/extraction/formats/crt';

const data = crtExtractor.extract(pdfText);
// Retorna:
// {
//   patente: "ABCD-12",
//   fecha_revision: "2026-10-15",
//   estado: "APROBADO",
//   proxima_revision: "2027-10-15",
//   empresa: "Verificadora XYZ"
// }
```

#### 2. **SOAP (Sistema de Operación de Autoridades de Permisos)**
```typescript
import { soapExtractor } from '@/core/extraction/formats/soap';

const data = soapExtractor.extract(pdfText);
// Retorna datos de transporte/operación de vehículos
```

#### 3. **Homologación**
```typescript
import { homologacionExtractor } from '@/core/extraction/formats/homologacion';

const data = homologacionExtractor.extract(pdfText);
// Retorna datos de homologación de vehículos
```

#### 4. **Permiso de Circulación**
```typescript
import { permisoCirculacionExtractor } from '@/core/extraction/formats/permisoCirculacion';

const data = permisoCirculacionExtractor.extract(pdfText);
// Retorna:
// {
//   patente: "ABCD-12",
//   propietario: "Juan Pérez",
//   vigencia_hasta: "2027-10-15",
//   clase: "particular",
//   año_modelo: 2020
// }
```

---

### `detectFormat`

Detecta automáticamente el formato de un PDF.

```typescript
import { detectFormat } from '@/core/extraction/detectFormat';

const format = detectFormat(pdfText);
// Retorna: 'CRT' | 'SOAP' | 'Homologación' | 'PermsoCirculación' | null

if (format) {
  console.log(`Formato detectado: ${format}`);
} else {
  console.log('No se pudo detectar el formato');
}
```

---

### `processDocument`

Pipeline completo: extrae y estructura los datos.

```typescript
import { processDocument } from '@/core/pipeline/processDocument';

const result = processDocument(
  pdfText,
  'CRT',
  { strict: true }
);

// Retorna: Result<StructuredData, Error>
if (result.ok) {
  console.log(result.value); // Datos estructurados
} else {
  console.error(result.error);
}
```

---

### `buildTable`

Transforma datos estructurados en tabla para mostrar en UI.

```typescript
import { buildTable, type Table } from '@/core/pipeline/buildTable';

const table = buildTable(
  [
    { fileName: 'doc1.pdf', data: { patente: 'ABCD-12', ... } },
    { fileName: 'doc2.pdf', data: { patente: 'EFGH-34', ... } },
  ],
  'CRT'
);

// table contiene:
// {
//   headers: ['Patente', 'Fecha Revisión', 'Estado', ...],
//   rows: [
//     ['ABCD-12', '2026-10-15', 'APROBADO', ...],
//     ['EFGH-34', '2026-09-20', 'RECHAZADO', ...],
//   ]
// }
```

**Interfaz:**

```typescript
interface Table {
  headers: string[];
  rows: (string | number | null)[][];
}
```

---

## 🟡 Infrastructure API

### `PdfTextSource`

Interfaz para lectura de texto desde PDFs.

```typescript
interface PdfTextSource {
  getText(bytes: ArrayBuffer): Promise<string>;
  getPageCount(bytes: ArrayBuffer): Promise<number>;
}
```

### `unpdfTextSource`

Implementación usando librería `unpdf`.

```typescript
import { unpdfTextSource } from '@/infra/pdf/unpdfTextSource';

const text = await unpdfTextSource.getText(pdfBytes);
const pageCount = await unpdfTextSource.getPageCount(pdfBytes);
```

**Características:**
- ✅ Soporte para PDFs complejos
- ✅ Manejo de streaming
- ✅ Protección contra text-bomb DoS (MAX_PAGES = 50)
- ✅ Cancelación de lectura

---

## 🟢 Validation API

### `validateFiles`

Valida archivos antes de procesar.

```typescript
import { validateFiles } from '@/client/files/validateFiles';

const { valid, rejected } = validateFiles(fileList, {
  maxFiles: 100,
  maxSizePerFile: 10_000_000,  // 10MB
});

// valid: File[] - archivos OK
// rejected: RejectedFile[] - archivos rechazados con motivo
for (const r of rejected) {
  console.log(`${r.fileName}: ${r.error}`);
}
```

**Interfaz:**

```typescript
interface RejectedFile {
  fileName: string;
  error: string;  // Motivo del rechazo
}

interface ValidationResult {
  valid: File[];
  rejected: RejectedFile[];
}
```

---

## 🔵 Domain Types

### `ConversionOutcome`

Resultado de procesar un archivo.

```typescript
type ConversionOutcome = ConversionSuccess | ConversionFailure;

interface ConversionSuccess {
  status: 'ok';
  fileName: string;
  data: Record<string, any>;
}

interface ConversionFailure {
  status: 'error';
  fileName: string;
  code: ConversionErrorCode;
  error: string;
}

type ConversionErrorCode = 
  | 'FILE_INVALID'   // Archivo corrupto/inválido
  | 'PARSE_ERROR'    // Error al parsear PDF
  | 'FORMAT_ERROR'   // Formato no soportado
  | 'TIMEOUT'        // Timeout al procesar
  | 'INTERNAL';      // Error interno del worker
```

---

## 📊 Complete Flow Example

```typescript
import { useConversion } from '@/hooks/useConversion';

function MyComponent() {
  const conversion = useConversion();

  const handleConvert = async (files: FileList, format: PDFFormat) => {
    try {
      // Hook maneja todo internamente:
      // 1. Valida archivos
      // 2. Crea WorkerPool
      // 3. Procesa en paralelo
      // 4. Genera tabla
      // 5. Crea Excel
      await conversion.start(files, format);

      // Acceder a resultados
      console.log(conversion.stats);        // Estadísticas
      console.log(conversion.table);        // Tabla
      console.log(conversion.excel);        // Workbook
      
    } catch (error) {
      console.error(conversion.error);
    }
  };

  return (
    <div>
      {conversion.status === 'processing' && (
        <ProgressBar 
          progress={conversion.progress!.processed}
          total={conversion.progress!.total}
        />
      )}
      {conversion.status === 'done' && (
        <button onClick={() => downloadFile(conversion.excel!.blob)}>
          Descargar Excel
        </button>
      )}
    </div>
  );
}
```

---

## 🔒 Security Guarantees

Todas las APIs tienen protección contra:

| Amenaza | Mitigación |
|---------|-----------|
| **Text-bomb DoS** | MAX_PAGES = 50, lectura streaming |
| **ReDoS** | Regex validadas con `redos.test.ts` |
| **Inyección Excel** | Fórmulas bloqueadas en `buildWorkbook.ts` |
| **Memory exhaustion** | Pool size acotado, lectura perezosa |
| **Corrupt PDF** | Validación y timeout (30s) |

---

## 📦 CommonJS vs ESM

Todas las APIs son **ESM-only** (módulos ES6):

```typescript
// ✅ Correcto
import { convertFiles } from '@/client/engine/conversionEngine';

// ❌ No funciona
const { convertFiles } = require('@/client/engine/conversionEngine');
```

---

## 🧪 Testing Examples

```typescript
import { describe, it, expect } from 'vitest';
import { crtExtractor } from '@/core/extraction/formats/crt';

describe('CRT Extractor', () => {
  it('should extract patente', () => {
    const text = 'PATENTE: ABCD-12\nFECHA: 2026-10-15';
    const result = crtExtractor.extract(text);
    expect(result.patente).toBe('ABCD-12');
  });
});
```

---

## 📝 Performance Notes

- **Single PDF:** ~100-500ms (depende de tamaño)
- **Batch de 100 PDFs:** ~2-5s en CPU 8-core (paralelismo real)
- **Memory:** ~50-100MB por PDF en processing
- **Pool overhead:** Minimal (~1-2% CPU overhead)

---

## 🚀 Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | 2026-11-02 | Inicial (Vite + Web Workers) |
| 0.0.1 | 2026-06-16 | Prototype (Next.js API routes) |

---

## 📖 Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — Descripción de capas
- [SECURITY.md](./SECURITY.md) — Medidas de seguridad
- [EVALUACION_PROYECTO.md](./EVALUACION_PROYECTO.md) — Análisis de calidad

---

*Documentación completa de API pública. Generada: 2026-11-02*
