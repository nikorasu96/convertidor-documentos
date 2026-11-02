// Uso de la cuenta (límites de la suscripción): reglas puras, sin `$`.

import type { LimiteUso } from '../types'

const HORA_MS = 3_600_000
const DIA_MS = 24 * HORA_MS

/** Ventanas conocidas primero; las demás, en el orden en que llegan. */
const ORDEN = ['five_hour', 'seven_day'] as const

const ETIQUETA_BASE: Record<string, string> = {
  five_hour: 'Sesión (5 h)',
  seven_day: 'Semana (todos los modelos)',
  spend_limit: 'Límite de gasto',
}

const capitalizar = (texto: string): string => texto.charAt(0).toUpperCase() + texto.slice(1)

/**
 * Nombre corto de la ventana. Las semanales por modelo llegan como
 * `seven_day_<modelo>` y se rotulan «Semana (<Modelo>)». El motor de Claude
 * Code 2.1.2xx solo documenta `five_hour`, `seven_day` y `spend_limit`: hoy no
 * llega ninguna ventana por modelo (Fable incluido), pero si llega se nombra.
 */
export const etiquetaLimite = (kind: string): string => {
  const base = ETIQUETA_BASE[kind]

  if (base !== undefined) {
    return base
  }

  const modelo = /^seven_day_(.+)$/.exec(kind)?.[1]

  return modelo === undefined ? kind : `Semana (${capitalizar(modelo.replace(/_/g, ' '))})`
}

/** Tiempo hasta el reset, como lo muestra el panel de uso: 3h, 5d, 12m. */
export const faltaParaReset = (resetsAt: string | undefined, ahoraMs: number): string | null => {
  if (resetsAt === undefined) {
    return null
  }

  const resetMs = Date.parse(resetsAt)

  if (Number.isNaN(resetMs)) {
    return null
  }

  const resta = resetMs - ahoraMs

  if (resta <= 0) {
    return 'ya'
  }

  if (resta >= DIA_MS) {
    return `${Math.floor(resta / DIA_MS)}d`
  }

  if (resta >= HORA_MS) {
    return `${Math.floor(resta / HORA_MS)}h`
  }

  return `${Math.max(1, Math.floor(resta / 60_000))}m`
}

const posicion = (kind: string): number => {
  const indice = ORDEN.indexOf(kind as (typeof ORDEN)[number])

  return indice === -1 ? ORDEN.length : indice
}

/** «se reinicia en 3h» / «se reinicia ya»; vacío sin fecha de reset. */
const textoReset = (reset: string | null): string => {
  if (reset === null) {
    return ''
  }

  return reset === 'ya' ? ', se reinicia ya' : `, se reinicia en ${reset}`
}

/**
 * «Sesión (5 h): 4% usado, se reinicia en 3h · Semana (todos los modelos): 10%
 * usado, se reinicia en 5d»; vacío si no hay lecturas.
 */
export const resumenUso = (limites: readonly LimiteUso[], ahoraMs: number): string =>
  [...limites]
    .sort((a, b) => posicion(a.kind) - posicion(b.kind))
    .map(limite => {
      const reset = textoReset(faltaParaReset(limite.resetsAt, ahoraMs))

      return `${etiquetaLimite(limite.kind)}: ${limite.percentUsed}% usado${reset}`
    })
    .join(' · ')

/**
 * Costo de la sesión (`cost.usd`); vacío si el motor no lo lleva.
 *
 * Es una estimación local a precio de lista de la API, no una factura
 * (https://code.claude.com/docs/en/costs). Con un plan Pro/Max el uso va
 * incluido y la doc aclara que esa cifra «isn't relevant for billing
 * purposes»: ahí se rotula como equivalente API que no se cobra. Lo que mide
 * el plan son las ventanas de uso; el motor solo las manda a suscriptores, así
 * que su presencia es la señal de plan. Con API key sí es el gasto (estimado).
 * El total no se separa por modelo: el uso de Fable no se puede mostrar aparte.
 */
export const gastoSesion = (usd: number | null, conPlan = false): string => {
  if (usd === null) return ''
  const monto = `US$ ${usd.toFixed(2).replace('.', ',')}`

  return conPlan ? `Equivalente API: ${monto} (no se cobra en el plan)` : `Gasto de la sesión: ${monto}`
}

/** Ventanas de la cuenta más el costo de la sesión, en una sola línea. */
export const resumenCuenta = (
  limites: readonly LimiteUso[],
  usd: number | null,
  ahoraMs: number,
): string =>
  [resumenUso(limites, ahoraMs), gastoSesion(usd, limites.length > 0)].filter(t => t !== '').join(' · ')

/** El mayor porcentaje usado, para colorear la banda; 0 si no hay lecturas. */
export const usoMaximo = (limites: readonly LimiteUso[]): number =>
  limites.reduce((mayor, limite) => Math.max(mayor, limite.percentUsed), 0)
