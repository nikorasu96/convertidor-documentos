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
| `MODELO\s+(.+?)[ \t]+COLOR` con `"MODELO "` repetido sin `COLOR` *(2026-11)* | `formats/homologacion.ts` | O(n²), ~85 s con un PDF de 4,7 KB | acotar la captura a `{1,200}` |
| `INSCRIPCION`/`POLIZA` con prefijo repetido sin espacios *(2026-11)* | `formats/soap.ts` | O(n²), ~30 s con 600 KB | acotar la captura a `{1,30}` por segmento |
| Validador de `Nº Motor` (clases solapadas) *(2026-11)* | `formats/homologacion.ts` | O(n²), >30 s con un PDF de 1,8 KB | acotar la captura a `{1,40}` por segmento |

Defensa adicional en `pipeline/processDocument.ts`: **cota de texto a 2 MB** antes de
extraer (anti *text-bomb* y acota la amplitud de cualquier regex).

**Lección de la auditoría de 2026-11:** la afirmación previa de que "todas las regex
restantes son lineales" era falsa. Colapsar el whitespace cierra los runs de espacios,
pero no el vector que queda: un **prefijo repetido** que cabe entero en una clase sin tope
seguida de un sufijo obligatorio (`"POLIZAN"` dentro de `[A-Z0-9]+…-`). Regla para regex
nuevas: toda captura seguida de un sufijo obligatorio debe tener un tope (`{1,N}`).

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

*(2026-11)* Dos fallos de integridad que dejaban **inutilizable el Excel de toda la
tanda** con un solo PDF malicioso: los no-caracteres **U+FFFE/U+FFFF** (ilegales en XML;
Excel no lo abre ni reparando) ahora se eliminan, y cada celda se **trunca a 32.767
caracteres** (límite de Excel), contando el apóstrofo y sin partir pares surrogate.

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

*(2026-11)* `pnpm audit` **completo** (incluye desarrollo) daba 70 vulnerabilidades en
herramientas de build/test/lint. Se migró de `rolldown-vite` 7 y eslint 9 (ambos
deprecados) a `vite` 8 y eslint 10, se actualizaron las demás dentro de su major y se
forzó `minimatch` 11 → **0**. Endurecimiento contra gusanos de npm (Shai-Hulud/ChainDrop):
`minimumReleaseAge` de 3 días y `trustPolicy: no-downgrade` en `pnpm-workspace.yaml`, y
`devEngines` para que solo pnpm pueda instalar. Se verificó que el lockfile no contiene
ninguna versión comprometida de ChainDrop (familia `keyv`/`cacheable`: están las versiones
seguras, publicadas antes del ataque, con hash igual al del registro).

### 5. Datos de terceros en el historial de git *(2026-11)*
El repo es **público** y el commit `2944fe0` agregó dos certificados CRT reales
(`pdf de prueba/`, con patente, VIN y firmante). Se borraron del árbol, pero siguen en el
historial. `.gitignore` ahora bloquea `*.pdf`, `*.xlsx`, `*.xls`, `*.csv` y
`docs/handoffs/`. **Pendiente de decisión del dueño:** purgar el historial (reescritura +
force-push) y pedir a GitHub que limpie su caché.

## Revisado y sin vulnerabilidad explotable
XSS (React escapa; cero sinks peligrosos), prototype pollution en `buildTable` (las claves
son literales de los extractores; ningún valor del PDF se vuelve clave), el `eval` del shim
`vm-browserify` empaquetado en `xlsx-populate` (no se alcanza al *escribir*).

## Diferido conscientemente (bajo impacto / sin frontera de confianza / refactor)
- Generación del Excel en el hilo principal (puede congelar la pestaña con lotes enormes):
  DoS auto-infligido y recuperable; el fix limpio es moverla a un Web Worker.
- `detectFormat` forjable y validadores permisivos (`/^.+$/`): el usuario elige el formato y
  procesa sus propios archivos; el Excel ya queda neutralizado contra fórmulas.
- `file.name` con caracteres de control/RTL mostrado crudo en la lista de la UI
  (`FileSelector`): el Excel ya lo sanea; la UI muestra archivos que el propio usuario eligió.

## Tests
Cobertura ampliada de **24 → 50** tests: `neutralizeFormula` (inyección de fórmulas) y
regresión de ReDoS (`__tests__/core/redos.test.ts`, entradas patológicas que deben
resolverse en tiempo lineal).
