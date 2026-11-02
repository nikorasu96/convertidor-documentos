// Reglas puras del medidor: sin `$`, para poder testearlas solas.

/** Umbrales de aviso, de menor a mayor. */
export const UMBRALES = [60, 75, 85] as const

export type Nivel = 'ok' | 'atento' | 'alto' | 'critico'

export const nivelDe = (percent: number): Nivel =>
  percent >= UMBRALES[2] ? 'critico' : percent >= UMBRALES[1] ? 'alto' : percent >= UMBRALES[0] ? 'atento' : 'ok'

/**
 * Umbral más alto cruzado que todavía no se avisó, o null.
 * `yaAvisado` es el último umbral avisado (0 si ninguno).
 */
export const umbralNuevo = (percent: number, yaAvisado: number): number | null => {
  const mayor = UMBRALES.filter(u => percent >= u).at(-1) ?? 0

  return mayor > yaAvisado ? mayor : null
}

/**
 * Tras una compactación el porcentaje baja: se rearma el aviso para que vuelva
 * a dispararse si el contexto crece de nuevo.
 */
export const rearmar = (percent: number, yaAvisado: number): number =>
  UMBRALES.filter(u => u <= yaAvisado && percent >= u).pop() ?? 0

export const barra = (percent: number, ancho = 20): string => {
  const llenos = Math.max(0, Math.min(ancho, Math.round((percent / 100) * ancho)))

  return '█'.repeat(llenos) + '░'.repeat(ancho - llenos)
}

export const miles = (n: number): string => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

/** Texto que lee Claude (nunca el usuario) al cruzar un umbral. */
export const avisoParaClaude = (percent: number, umbral: number): string =>
  [
    `[medidor-contexto] El contexto de esta conversación está al ${percent}% (umbral ${umbral}%).`,
    'Decíselo al usuario en esta respuesta, en una línea, y ofrecé dejar un handoff antes de',
    'quedarse sin margen, donde lo indique el CLAUDE.md del proyecto; si no dice dónde,',
    'preguntá en vez de crear carpetas nuevas.',
    umbral >= UMBRALES[2]
      ? 'Nivel crítico: priorizá cerrar o documentar el trabajo en curso.'
      : 'No interrumpas la tarea en curso: el aviso va al final de la respuesta.',
  ].join(' ')
