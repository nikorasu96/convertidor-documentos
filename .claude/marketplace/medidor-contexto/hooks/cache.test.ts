import { expect, test } from 'claude-code/testing'

import {
  avisoCacheParaClaude,
  CACHE_AVISO_MIN,
  CACHE_TTL_MIN,
  estadoCache,
  porVencer,
  textoBanda,
  textoPorVencer,
} from './cache'

const MIN = 60_000
const T0 = 1_000_000

test('vigente, por vencer y vencida según la hora', async () => {
  expect(estadoCache(T0, T0)).toEqual({ vigente: true, minutosRestantes: CACHE_TTL_MIN })
  expect(estadoCache(T0, T0 + 30 * MIN)).toEqual({ vigente: true, minutosRestantes: 30 })
  // Los segundos sueltos cuentan como un minuto más de margen.
  expect(estadoCache(T0, T0 + 54 * MIN + 30_000)).toEqual({ vigente: true, minutosRestantes: 6 })
  expect(estadoCache(T0, T0 + CACHE_TTL_MIN * MIN)).toEqual({ vigente: false, minutosVencida: 0 })
  expect(estadoCache(T0, T0 + (CACHE_TTL_MIN + 12) * MIN + 59_000)).toEqual({ vigente: false, minutosVencida: 12 })
})

test('el TTL se puede bajar a 5 min (API key u overage)', async () => {
  expect(estadoCache(T0, T0 + 3 * MIN, 5)).toEqual({ vigente: true, minutosRestantes: 2 })
  expect(estadoCache(T0, T0 + 8 * MIN, 5)).toEqual({ vigente: false, minutosVencida: 3 })
})

test('el aviso previo salta en el margen y no antes ni después de vencer', async () => {
  expect(porVencer(estadoCache(T0, T0 + 50 * MIN))).toBe(false)
  expect(porVencer(estadoCache(T0, T0 + (CACHE_TTL_MIN - CACHE_AVISO_MIN) * MIN))).toBe(true)
  expect(porVencer(estadoCache(T0, T0 + 59 * MIN))).toBe(true)
  expect(porVencer(estadoCache(T0, T0 + 61 * MIN))).toBe(false)
})

test('textos del toast, de la banda y del aviso para Claude', async () => {
  expect(textoPorVencer(5)).toBe('La caché vence en 5 min: si vas a seguir, mandá el próximo mensaje antes')
  expect(textoBanda(estadoCache(T0, T0 + 30 * MIN))).toBe('')
  expect(textoBanda(estadoCache(T0, T0 + 72 * MIN), 120_000)).toBe(
    'Caché vencida hace 12 min: el próximo mensaje relee toda la conversación (≈120k tokens)',
  )
  expect(textoBanda(estadoCache(T0, T0 + 60 * MIN))).toBe(
    'Caché vencida: el próximo mensaje relee toda la conversación',
  )
  expect(avisoCacheParaClaude(12, 62)).toContain('/compact')
  expect(avisoCacheParaClaude(12, 20)).not.toContain('/compact')
  expect(avisoCacheParaClaude(12)).not.toContain('/compact')
})

test('el mensaje que llega con la caché vencida lleva el aviso para Claude, y solo una vez', async ($, on) => {
  const vistos: (readonly string[] | undefined)[] = []
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  on('ui.status', async () => ({ value: undefined }))
  on('ui.toast', async () => ({ value: undefined }))
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
  on('prompt.submit', async (_$, e) => {
    vistos.push(e.context)
    return { text: e.text }
  })

  const enviar = () => $.prompt.submit({ text: 'hola', wait: false, origin: { kind: 'composer' } })

  let ahora = T0
  on('clock.now', async () => ({ value: ahora }))
  await $.session.measure({ context: { percent: 62, tokens: 620_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] })
  await $.turn.complete({ answer: 'ok', reason: 'answer' })
  // Dentro de la hora: nada.
  await enviar()
  // Pasada la hora.
  ahora = T0 + 72 * MIN
  await enviar()
  await enviar()

  expect(vistos[0]?.some(c => c.includes('Caché')) ?? false).toBe(false)
  expect(vistos[1]?.join(' ')).toContain('hace 12 min')
  expect(vistos[1]?.join(' ')).toContain('/compact')
  expect(vistos[2]).toBeUndefined()
})

test('la banda muestra la línea de caché vencida y se apaga con el siguiente turno', async ($, on) => {
  let ahora = T0
  on('clock.now', async () => ({ value: ahora }))
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  on('ui.status', async () => ({ value: undefined }))
  on('turn.complete', async (_$, e) => ({ text: e.answer }))

  const banda = {
    plugin: 'medidor-contexto',
    component: 'AbovePrompt',
    surface: 'terminal',
    props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 80, scroll: { offset: 0, bodyRows: 19 }, view: {} },
  } as const
  const linea = async () => (await (await $.ui.mount(banda)).find({ type: 'Text', text: /Caché vencida/ }))?.text

  await $.session.measure({ context: { percent: 40, tokens: 400_000, window: 1_000_000 }, rateLimits: [], changed: ['context'] })
  await $.turn.complete({ answer: 'ok', reason: 'answer' })
  expect(await linea()).toBeUndefined()

  ahora = T0 + 72 * MIN
  expect(await linea()).toContain('hace 12 min')
  expect(await linea()).toContain('≈400k tokens')

  await $.turn.complete({ answer: 'ok', reason: 'answer' })
  expect(await linea()).toBeUndefined()
})
