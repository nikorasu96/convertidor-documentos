# Seguridad — Auditoría y endurecimiento

Este documento resume la auditoría de seguridad realizada sobre el convertidor y los
fixes aplicados. La app es una **SPA 100% cliente** (React + Vite, sin backend): los PDFs
no confiables se parsean en el navegador con `unpdf`/pdf.js dentro de Web Workers, se
extraen campos con regex y se genera un `.xlsx` con `xlsx-populate`. La superficie de
ataque es, por tanto, el **PDF subido** y su **nombre de archivo**.

## Metodología

Ataque manual inicial seguido de un **bucle de auditoría adversaria multi-agente**: caza
por clase de ataque → verificación adversaria (panel escéptico de 2 lentes por hallazgo)
→ repetir hasta que una iteración vuelve sin hallazgos confirmados. Cada hallazgo se
verificó empíricamente (p. ej. midiendo el backtracking en Node) antes de corregir. El
bucle convergió tras 4 iteraciones; la última volvió **limpia** (0 hallazgos confirmados).

Puerta de validación tras cada fix (todo en verde):

```
pnpm typecheck && pnpm test && pnpm lint && pnpm build && pnpm audit --prod
```

## Modelo de amenaza (qué es y qué no es explotable aquí)

- **Sin servidor ni multiusuario**: no hay frontera atacante↔víctima remota. El peor caso
  de DoS es **auto-infligido** y recuperable (afecta a la pestaña del propio usuario).
- **React 19 auto-escapa** todo el JSX; no se usa `dangerouslySetInnerHTML`/`eval`/`innerHTML`.
- **Inyección de fórmulas = defensa en profundidad**: `xlsx-populate` escribe los valores
  como texto (`t="s"`), así que Excel **no** evalúa un `=...` al abrir el `.xlsx` nativo.
  El riesgo se materializa solo al **exportar a CSV** o abrir en **Google Sheets/LibreOffice**.

## Hallazgos corregidos

### 1. ReDoS (backtracking catastrófico) — DoS del worker
Varias regex de extracción colgaban un worker al 100 % de CPU ante entradas adversarias
(el `setTimeout` de 30 s del pool **no** interrumpe código síncrono dentro del worker).

| Regex | Archivo | Complejidad previa | Fix |
|---|---|---|---|
| `MODELO\s+(.+?)[ \t]+COLOR` | `formats/homologacion.ts` | ~O(n³), ~30 s con 6k espacios | colapsar whitespace horizontal antes de extraer |
| `INSCRIPCION/HASTA/RIGE/RUT/POLIZA` (×4) | `formats/soap.ts` | O(n²) | colapsar `\s+`→`" "` antes de extraer |
| Strip de RUT `(?:\.\d{3})*-` (replace global) | `formats/permisoCirculacion.ts` | O(n²), >300 s a 2 MB | acotar a `(?:\.\d{3}){0,4}` |
| `COLOR …` con `\s` en la clase + lookahead | `formats/homologacion.ts` | O(n²) con `\n` | acotar el cuantificador a `{1,60}` |

Defensa adicional en `pipeline/processDocument.ts`: **cota de texto a 2 MB** antes de
extraer (anti *text-bomb* y acota la amplitud de cualquier regex). Se verificó de forma
independiente que **todas** las regex restantes (CRT, `VALIDO_PATTERN`, `Firmado por`,
fechas, importes…) son lineales.

### 2. Inyección de fórmulas / CSV injection (CWE-1236) — `client/excel/buildWorkbook.ts`
La columna **"Nombre PDF"** (= nombre de archivo, 100 % controlado por quien genera el
PDF) y la hoja *Estadísticas* escribían el valor sin sanear. Se introdujo
`neutralizeFormula`, que:

- antepone `'` si **cualquier línea**, tras saltar `\s` y **toda la categoría `\p{Cf}`**
  (espacios Unicode, marcas bidi, zero-width…), empieza por `= + - @`;
- **elimina** controles ilegales en XML/OOXML (C0/C1), saltos de línea Unicode
  (NEL/LS/PS) y controles bidireccionales / RTL override (anti-corrupción y anti-spoofing).

Durante el bucle se cerraron **tres bypasses sucesivos** de esta función (prefijo de
whitespace; NEL/LS/PS; format chars Cf). Cubierta por tests en `__tests__/client/buildWorkbook.test.ts`.

### 3. Recursos del worker / robustez
- **Fuga de memoria**: `infra/pdf/unpdfTextSource.ts` no liberaba el documento de pdf.js
  → `try/finally` con `pdf.destroy()` (la memoria crecía sin límite en lotes grandes).
- **Fan-out por páginas**: PDF que declara un árbol de páginas enorme → cota `numPages > 1000`.
- **Corrupción OOXML**: un nombre de archivo largo producía `width`/`height` fuera de
  rango legal de Excel → clamp `width ≤ 255`, `height ≤ 409`.
- **Carrera en `WorkerPool.run()`**: si un worker fallaba durante `await readBytes()`, el
  slot podía quedar corrupto (timer huérfano → timeout espurio sobre otro archivo) → se
  re-chequea la propiedad del slot tras el `await`.

### 4. Dependencias (supply-chain)
`lodash` (transitivo vía `xlsx-populate`) tenía 1 CVE **alta** (code injection `_.template`)
y 2 **moderadas** (prototype pollution `_.unset`/`_.omit`). Se fijó **`lodash 4.18.1`** vía
`overrides` en `pnpm-workspace.yaml`. `pnpm audit --prod` → **0 vulnerabilidades**.

## Revisado y sin vulnerabilidad explotable
XSS (React escapa; cero sinks peligrosos), prototype pollution en `buildTable` (las claves
son literales de los extractores; ningún valor del PDF se vuelve clave), el `eval` del shim
`vm-browserify` empaquetado en `xlsx-populate` (no se alcanza al *escribir*).

## Diferido conscientemente (bajo impacto / sin frontera de confianza / refactor)
- Generación del Excel en el hilo principal (puede congelar la pestaña con lotes enormes):
  DoS auto-infligido y recuperable; el fix limpio es moverla a un Web Worker.
- `detectFormat` forjable y validadores permisivos (`/^.+$/`): el usuario elige el formato y
  procesa sus propios archivos; el Excel ya queda neutralizado contra fórmulas.
- Higiene de configuración: `.npmrc minimumReleaseAge` contradictorio con
  `pnpm-workspace.yaml`, `rolldown` en beta, directorio `lodash@4.17.21` huérfano en `.pnpm`.
- `file.name` con caracteres de control/RTL mostrado crudo en la lista de la UI
  (`FileSelector`): el Excel ya lo sanea; la UI muestra archivos que el propio usuario eligió.

## Tests
Cobertura ampliada de **24 → 37** tests: `neutralizeFormula` (inyección de fórmulas) y
regresión de ReDoS (`__tests__/core/redos.test.ts`, entradas patológicas que deben
resolverse en tiempo lineal).
