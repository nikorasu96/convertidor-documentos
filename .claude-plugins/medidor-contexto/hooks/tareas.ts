import type { AgenteActivo, Progreso, TareaFondo } from '../types'

/** Estados con los que una tarea ya no está en ejecución. */
const SIGUE = new Set(['running', 'pending'])

const NOMBRE: Record<TareaFondo['tipo'], string> = {
  comando: 'comando',
  monitor: 'monitor',
  agente: 'subagente',
  workflow: 'workflow',
}

const GIRO = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

/** Una línea legible, sin saltos y acotada. */
export const recortar = (texto: string, max = 40): string => {
  // Por grafemas (banderas y emojis compuestos enteros); sin Intl.Segmenter, por puntos de código.
  const limpio = texto.replace(/\s+/g, ' ').trim()
  const plano =
    typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
      ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(limpio), s => s.segment)
      : Array.from(limpio)
  return plano.length <= max ? plano.join('') : `${plano.slice(0, max - 1).join('')}…`
}

export const agregar = (lista: readonly TareaFondo[], nueva: TareaFondo): TareaFondo[] => [
  ...lista.filter(t => t.id !== nueva.id),
  nueva,
]

export const quitar = (lista: readonly TareaFondo[], ids: readonly string[]): TareaFondo[] =>
  lista.filter(t => !ids.includes(t.id))

/**
 * Las tareas que un aviso `<task-notification>` da por terminadas. Un aviso
 * sin estado, o con `running` (el evento de un monitor), no termina nada.
 */
export const terminadasEn = (texto: string): string[] => {
  const ids: string[] = []

  for (const bloque of texto.split('</task-notification>')) {
    const id = /<task-id>\s*([^<\s]+)\s*<\/task-id>/.exec(bloque)?.[1]
    const estado = /<status>\s*([^<\s]+)\s*<\/status>/.exec(bloque)?.[1]

    if (id !== undefined && estado !== undefined && !SIGUE.has(estado.toLowerCase())) {
      ids.push(id)
    }
  }

  return ids
}

export const duracion = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))

  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

/** Un cuadro del giro por cada segundo, el paso del reloj. */
export const giro = (ahora: number): string => GIRO[Math.floor(ahora / 1000) % GIRO.length] ?? '⠋'

/** `2 tareas en ejecución: comando «Levantar API» 1m 5s · subagente «Revisar» 12s` */
export const resumenTareas = (lista: readonly TareaFondo[], ahora: number): string => {
  if (lista.length === 0) return ''

  const cabeza = cabeceraTareas(lista.length)
  const detalle = lista
    .map(t => `${NOMBRE[t.tipo]} «${recortar(t.descripcion, 30)}» ${duracion(ahora - t.desde)}`)
    .join(' · ')

  return `${cabeza}: ${detalle}`
}

/** Último tramo de una ruta, con `/` o `\`. */
const base = (ruta: string): string => ruta.split(/[\\/]/).filter(Boolean).pop() ?? ruta

const texto = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined)

/** Lo que hace una llamada de herramienta, en pocas palabras: `Read register.tsx`. */
export const accion = (tool: string, input: Readonly<Record<string, unknown>>): string => {
  const ruta = texto(input.file_path) ?? texto(input.notebook_path) ?? texto(input.path)
  const detalle =
    texto(input.description) ??
    (ruta !== undefined ? base(ruta) : undefined) ??
    (texto(input.pattern) !== undefined ? `«${texto(input.pattern)}»` : undefined) ??
    texto(input.command) ??
    texto(input.query) ??
    texto(input.url)

  return recortar(detalle === undefined ? tool : `${tool} ${detalle}`, 45)
}

/** La clave de avance a la que cuenta un agente, si cuenta a alguna tarea. */
export const claveDe = (
  lista: readonly TareaFondo[],
  activos: readonly AgenteActivo[],
  agentId: string,
): string | undefined =>
  activos.find(a => a.id === agentId)?.clave ?? (lista.some(t => t.id === agentId) ? agentId : undefined)

export const conAccion = (
  progreso: Readonly<Record<string, Progreso>>,
  clave: string,
  ultima: string,
): Record<string, Progreso> => ({ ...progreso, [clave]: { listos: progreso[clave]?.listos ?? 0, ultima } })

export const conListo = (progreso: Readonly<Record<string, Progreso>>, clave: string): Record<string, Progreso> => ({
  ...progreso,
  [clave]: { ...progreso[clave], listos: (progreso[clave]?.listos ?? 0) + 1 },
})

/** Las claves de avance de unas tareas: su `runId` y su id. */
export const clavesDe = (lista: readonly TareaFondo[], ids: readonly string[]): string[] =>
  lista.filter(t => ids.includes(t.id)).flatMap(t => (t.runId === undefined ? [t.id] : [t.id, t.runId]))

export const sinClaves = (
  progreso: Readonly<Record<string, Progreso>>,
  claves: readonly string[],
): Record<string, Progreso> => Object.fromEntries(Object.entries(progreso).filter(([k]) => !claves.includes(k)))

const plural = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`

/** Lo que la banda muestra de una tarea, por partes, para dibujarlas por separado. */
export type PartesTarea = {
  descripcion: string
  duracion: string
  /** Solo de un workflow: agentes que terminaron y los que siguen trabajando. */
  listos: number
  trabajando: number
  ultima?: string
}

export const partesTarea = (
  t: TareaFondo,
  activos: readonly AgenteActivo[],
  progreso: Readonly<Record<string, Progreso>>,
  ahora: number,
): PartesTarea => {
  const clave = t.runId ?? t.id
  const p = progreso[clave]
  const base = {
    descripcion: recortar(t.descripcion, 30),
    duracion: duracion(ahora - t.desde),
    listos: t.tipo === 'workflow' ? (p?.listos ?? 0) : 0,
    trabajando: t.tipo === 'workflow' ? activos.filter(a => a.clave === clave).length : 0,
  }

  return p?.ultima === undefined ? base : { ...base, ultima: p.ultima }
}

/** Una línea por tarea, para la banda: qué es, cuánto lleva y qué hacen sus agentes. */
export const lineaTarea = (
  t: TareaFondo,
  activos: readonly AgenteActivo[],
  progreso: Readonly<Record<string, Progreso>>,
  ahora: number,
): { principal: string; ultima?: string } => {
  const p = partesTarea(t, activos, progreso, ahora)
  let principal = `${NOMBRE[t.tipo]} «${p.descripcion}» ${p.duracion}`

  if (t.tipo === 'workflow') {
    principal += ` · ${plural(p.trabajando, 'agente trabajando', 'agentes trabajando')}`
    if (p.listos > 0) principal += `, ${plural(p.listos, 'listo', 'listos')}`
  }

  return p.ultima === undefined ? { principal } : { principal, ultima: p.ultima }
}

/** Cabecera de la banda: `2 tareas en ejecución`. */
export const cabeceraTareas = (n: number): string =>
  n === 1 ? '1 tarea en ejecución' : `${n} tareas en ejecución`
