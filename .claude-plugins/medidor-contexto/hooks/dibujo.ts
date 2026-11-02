import type { TareaFondo } from '../types'

/**
 * Colores de cada tipo de tarea. Tonos medios que se leen sobre tema claro y
 * oscuro: el SVG no conoce el tema del editor.
 */
export const COLOR_TIPO: Record<TareaFondo['tipo'], string> = {
  workflow: '#a371f7',
  agente: '#4f9cf9',
  comando: '#3fb950',
  monitor: '#d29922',
}

const ETIQUETA: Record<TareaFondo['tipo'], string> = {
  workflow: 'WF',
  agente: 'AGT',
  comando: 'CMD',
  monitor: 'MON',
}

const PISTA = 'rgba(128,128,128,0.35)'

/** Indicador que gira con SMIL, sin redibujar la banda. En el escritorio necesita `isInteractive`. */
export const giroSvg = (color = '#4f9cf9'): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14">` +
  `<circle cx="7" cy="7" r="5.5" fill="none" stroke="${PISTA}" stroke-width="2"/>` +
  `<path d="M7 1.5 A5.5 5.5 0 0 1 12.5 7" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round">` +
  `<animateTransform attributeName="transform" type="rotate" from="0 7 7" to="360 7 7" dur="0.9s" repeatCount="indefinite"/>` +
  `</path></svg>`

/** Chip con el tipo de tarea: `WF`, `AGT`, `CMD`, `MON`. */
export const chipSvg = (tipo: TareaFondo['tipo']): string => {
  const color = COLOR_TIPO[tipo]

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="16" viewBox="0 0 34 16">` +
    `<rect x="0.5" y="0.5" width="33" height="15" rx="7.5" fill="${color}" fill-opacity="0.18" stroke="${color}"/>` +
    `<text x="17" y="11.5" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif" ` +
    `font-size="9" font-weight="700" fill="${color}">${ETIQUETA[tipo]}</text></svg>`
  )
}

/**
 * Barra de avance de un workflow: listos sobre los agentes vistos hasta ahora.
 * Sin agentes todavía, una franja que recorre la pista (indeterminada).
 */
export const barraSvg = (listos: number, trabajando: number, color = COLOR_TIPO.workflow, ancho = 90): string => {
  const total = listos + trabajando
  const abre = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="6" viewBox="0 0 ${ancho} 6">`
  const pista = `<rect width="${ancho}" height="6" rx="3" fill="${PISTA}"/>`

  if (total === 0) {
    const tramo = Math.round(ancho / 3)
    return (
      `${abre}${pista}<rect width="${tramo}" height="6" rx="3" fill="${color}">` +
      `<animate attributeName="x" from="-${tramo}" to="${ancho}" dur="1.4s" repeatCount="indefinite"/>` +
      `</rect></svg>`
    )
  }

  const lleno = Math.round((ancho * Math.min(listos, total)) / total)
  return `${abre}${pista}${lleno > 0 ? `<rect width="${lleno}" height="6" rx="3" fill="${color}"/>` : ''}</svg>`
}
