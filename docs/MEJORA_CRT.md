# Mejora del Sistema de Revisión Técnica (CRT)

> **Documento histórico.** Describe el cambio sobre la arquitectura anterior
> (Next.js, `src/extractors/crtExtractor.ts`). El comportamiento sigue vigente, pero
> hoy vive en [`src/core/extraction/formats/crt.ts`](../src/core/extraction/formats/crt.ts).

## 📋 Resumen de la Mejora

Se ha mejorado el extractor de Certificados de Revisión Técnica (CRT) para que sea **más flexible y robusto**, aceptando PDFs con uno o ambos certificados.

---

## 🎯 Problema Original

El sistema **solo aceptaba PDFs que contenían ambos certificados**:

- ✅ Certificado de Revisión Técnica
- ✅ Certificado de Emisiones Contaminantes

Si un PDF contenía **solo uno de los certificados**, el sistema rechazaba el archivo con un error.

---

## ✨ Solución Implementada

### **Nueva Funcionalidad:**

El sistema ahora acepta **tres tipos de PDFs**:

1. **PDF con ambos certificados** (comportamiento original)
   - Extrae ambos campos "Válido Hasta"

2. **PDF solo con Certificado de Revisión Técnica**
   - Extrae "Válido Hasta Revisión Técnica"
   - Deja vacío "Válido Hasta Contaminantes"

3. **PDF solo con Certificado de Emisiones Contaminantes**
   - Extrae "Válido Hasta Contaminantes"
   - Deja vacío "Válido Hasta Revisión Técnica"

---

## 📊 Campos Extraídos (Mismo Orden)

El sistema extrae **los mismos campos** en el **mismo orden**:

| # | Campo | Obligatorio | Observaciones |
|---|-------|-------------|---------------|
| 1 | **Nombre PDF** | ✅ Sí | Nombre del archivo procesado |
| 2 | **Fecha de Revisión** | ✅ Sí | Formato: "DD MES AAAA" |
| 3 | **Planta** | ✅ Sí | Código de planta |
| 4 | **Placa Patente** | ✅ Sí | Alfanumérico |
| 5 | **Válido Hasta Revisión Técnica** | ⚠️ Condicional | Vacío si no hay certificado RT |
| 6 | **Válido Hasta Contaminantes** | ⚠️ Condicional | Vacío si no hay certificado EC |
| 7 | **Folio** | ✅ Sí | Formato: "N°BXXXXX" |

**Importante:** Al menos uno de los campos "Válido Hasta" debe tener valor.

---

## 🔧 Cambios Técnicos Realizados

### **1. Función `extraerDatosCRT()` - Archivo: `src/extractors/crtExtractor.ts`**

**Antes:**

```typescript
// Lanzaba error si no encontraba ambos certificados
if (!revisionSectionMatch || !contaminantesSectionMatch) {
  throw new Error(
    "El PDF no contiene ambos certificados requeridos..."
  );
}
```

**Ahora:**

```typescript
// Acepta uno o ambos certificados
if (!revisionSectionMatch && !contaminantesSectionMatch) {
  throw new Error(
    "El PDF no contiene ningún certificado válido..."
  );
}

// Procesa cada certificado de forma independiente
if (revisionSectionMatch) {
  // Extrae datos de Revisión Técnica
}

if (contaminantesSectionMatch) {
  // Extrae datos de Contaminantes
}
```

### **2. Función `bestEffortValidationCRT()`**

**Mejoras en validación:**

- ✅ Campos obligatorios: Fecha, Planta, Placa Patente, Folio
- ✅ Campos condicionales: Los "Válido Hasta" se validan solo si están presentes
- ✅ Validación flexible: Al menos uno de los "Válido Hasta" debe tener valor
- ✅ Logging mejorado: Indica qué certificados están presentes

---

## 🧪 Casos de Prueba

### **Caso 1: PDF con ambos certificados**

```text
Entrada: PDF con RT + EC
Resultado: ✅ Extrae ambos "Válido Hasta"
Excel: Todas las columnas con datos
```

### **Caso 2: PDF solo con Revisión Técnica**

```text
Entrada: PDF solo con RT
Resultado: ✅ Extrae "Válido Hasta Revisión Técnica"
Excel: Columna "Válido Hasta Contaminantes" vacía
```

### **Caso 3: PDF solo con Emisiones Contaminantes**

```text
Entrada: PDF solo con EC
Resultado: ✅ Extrae "Válido Hasta Contaminantes"
Excel: Columna "Válido Hasta Revisión Técnica" vacía
```

### **Caso 4: PDF sin certificados válidos**

```text
Entrada: PDF sin RT ni EC
Resultado: ❌ Error descriptivo
```

---

## ✅ Compatibilidad con Funcionalidad Existente

### **Garantías:**

1. ✅ **Orden de columnas preservado**
   - Las 7 columnas siguen en el mismo orden

2. ✅ **Formato de datos sin cambios**
   - Todos los patrones regex y validaciones mantienen compatibilidad

3. ✅ **Retrocompatibilidad total**
   - PDFs con ambos certificados funcionan exactamente igual que antes

4. ✅ **Sin cambios en otros extractores**
   - Homologación, SOAP, Permiso de Circulación no se ven afectados

5. ✅ **Generación de Excel sin cambios**
   - El formato del archivo Excel se mantiene idéntico
   - Estadísticas y resumen funcionan igual

---

## 🔍 Logging y Debugging

El sistema ahora proporciona **mejor información** sobre qué se encontró:

```text
[Server INFO]: Iniciando extracción de datos CRT.
[Server INFO]: Fecha de Revisión extraída: 10 OCTUBRE 2023
[Server INFO]: Planta extraída: PLANTA-01
[Server INFO]: Placa Patente extraída: ABC123
[Server INFO]: Válido Hasta Revisión Técnica extraído: OCTUBRE 2024
[Server INFO]: No se encontró la sección de Certificado de Contaminantes.
[Server INFO]: Folio extraído: N°B12345
[Server INFO]: Validación: Campo "Válido Hasta Contaminantes" está vacío (certificado no presente).
[Server INFO]: Validación completada exitosamente.
```

---

## 📝 Mejores Prácticas Aplicadas

1. ✅ **Principio de responsabilidad única**
   - Cada función tiene una responsabilidad clara

2. ✅ **Código defensivo**
   - Validaciones en cada paso del proceso

3. ✅ **Logging completo**
   - Trazabilidad de cada extracción

4. ✅ **Manejo de errores descriptivo**
   - Mensajes claros sobre qué falló y por qué

5. ✅ **Retrocompatibilidad**
   - No rompe funcionalidad existente

6. ✅ **Validación flexible**
   - Se adapta a diferentes estructuras de PDF

---

## 🚀 Cómo Probar la Mejora

### **Paso 1: Iniciar el servidor**

```bash
bun run dev
```

### **Paso 2: Acceder a la aplicación**

```text
http://localhost:3000
```

### **Paso 3: Seleccionar formato CRT**

- Hacer clic en el botón "CRT"

### **Paso 4: Cargar PDFs de prueba**

- Ubicados en: `pdf de prueba/`
  - `RZVJ90_REV_TEC2025.pdf`
  - `SZRV65_REV_TEC2025.pdf`

### **Paso 5: Verificar resultados**

- Los PDFs se procesan correctamente
- Se genera el Excel con todas las columnas
- Las columnas vacías aparecen en blanco (no como error)

---

## 📦 Archivos Modificados

```text
✅ src/extractors/crtExtractor.ts
   - extraerDatosCRT() - Extracción flexible
   - bestEffortValidationCRT() - Validación condicional
```

---

## 🎓 Conclusión

La mejora implementada hace que el sistema sea **más robusto y flexible** sin comprometer la funcionalidad existente. Ahora puede procesar una mayor variedad de PDFs de Revisión Técnica, manteniendo la calidad y estructura de los datos extraídos.

**Beneficios:**

- ✅ Mayor tasa de éxito en procesamiento
- ✅ Menos rechazos por formato
- ✅ Misma estructura de datos
- ✅ Compatibilidad total con código existente
- ✅ Mejor experiencia de usuario

---

**Fecha de implementación:** 7 de octubre de 2025
**Versión:** 1.1.0 (Mejora CRT)
