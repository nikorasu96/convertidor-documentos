// Reglas puras del vigilante de caché: sin `$`, para poder testearlas solas.

import { miles } from './umbrales'

/**
 * Vida de la caché del prompt, en minutos. Con suscripción es de 1 hora; con API key
 * o en overage, de 5 minutos: en ese caso se baja acá.
 */
export const CACHE_TTL_MIN = 60

/** Cuántos minutos antes de vencer se avisa. */
export const CACHE_AVISO_MIN = 5

/** Desde este porcentaje de contexto se sugiere compactar o dejar un handoff. */
export const CONTEXTO_GRANDE = 50

const MS_MIN = 60_000

export type EstadoCache = { vigente: true; minutosRestantes: number } | { vigente: false; minutosVencida: number }

/** Estado de la caché dado el fin del último turno y la hora, ambos en ms. */
export const estadoCache = (ultimoTurno: number, ahora: number, ttlMin = CACHE_TTL_MIN): EstadoCache => {
  const restanteMs = ultimoTurno + ttlMin * MS_MIN - ahora

  return restanteMs > 0
    ? { vigente: true, minutosRestantes: Math.ceil(restanteMs / MS_MIN) }
    : { vigente: false, minutosVencida: Math.max(0, Math.floor(-restanteMs / MS_MIN)) }
}

/** ¿Está dentro del margen de aviso, todavía sin vencer? */
export const porVencer = (estado: EstadoCache, avisoMin = CACHE_AVISO_MIN): boolean =>
  estado.vigente && estado.minutosRestantes <= avisoMin

/** Texto del toast previo al vencimiento. */
export const textoPorVencer = (minutos: number): string =>
  `La caché vence en ${minutos} min: si vas a seguir, mandá el próximo mensaje antes`

/** Línea de la banda: vacía mientras la caché esté vigente. */
export const textoBanda = (estado: EstadoCache, tokens?: number): string => {
  if (estado.vigente) return ''

  const hace = estado.minutosVencida >= 1 ? ` hace ${estado.minutosVencida} min` : ''
  const peso = tokens === undefined ? '' : ` (≈${miles(tokens)} tokens)`

  return `Caché vencida${hace}: el próximo mensaje relee toda la conversación${peso}`
}

/** Texto que lee Claude (nunca el usuario) cuando el mensaje llega con la caché vencida. */
export const avisoCacheParaClaude = (minutosVencida: number, percent?: number): string =>
  [
    `[medidor-contexto] La caché del prompt había vencido hace ${minutosVencida} min: este mensaje re-leyó toda la conversación.`,
    'Decíselo al usuario en esta respuesta, en una línea.',
    percent !== undefined && percent >= CONTEXTO_GRANDE
      ? `El contexto está al ${percent}%: sugerí /compact o dejar un handoff antes de seguir.`
      : 'El contexto es chico: no hace falta sugerir nada más.',
  ].join(' ')
