import { expect, mock, test } from 'claude-code/testing'

import { etiquetaLimite, faltaParaReset, gastoSesion, resumenCuenta, resumenUso, usoMaximo } from './uso-cuenta'

const AHORA = Date.parse('2026-10-16T12:00:00Z')

test('etiquetas de cada ventana', async () => {
  expect(etiquetaLimite('five_hour')).toBe('Sesión (5 h)')
  expect(etiquetaLimite('seven_day')).toBe('Semana (todos los modelos)')
  expect(etiquetaLimite('seven_day_fable')).toBe('Semana (Fable)')
  expect(etiquetaLimite('spend_limit')).toBe('Límite de gasto')
  expect(etiquetaLimite('otra_cosa')).toBe('otra_cosa')
})

test('tiempo hasta el reset', async () => {
  expect(faltaParaReset(undefined, AHORA)).toBe(null)
  expect(faltaParaReset('no-es-fecha', AHORA)).toBe(null)
  expect(faltaParaReset('2026-10-16T15:30:00Z', AHORA)).toBe('3h')
  expect(faltaParaReset('2026-10-21T18:00:00Z', AHORA)).toBe('5d')
  expect(faltaParaReset('2026-10-16T12:12:00Z', AHORA)).toBe('12m')
  expect(faltaParaReset('2026-10-16T11:00:00Z', AHORA)).toBe('ya')
})

test('resumen ordenado: 5 h, semana y después por modelo', async () => {
  const texto = resumenUso(
    [
      { kind: 'seven_day_fable', percentUsed: 0, resetsAt: '2026-10-21T18:00:00Z' },
      { kind: 'seven_day', percentUsed: 10, resetsAt: '2026-10-21T18:00:00Z' },
      { kind: 'five_hour', percentUsed: 4, resetsAt: '2026-10-16T15:30:00Z' },
    ],
    AHORA,
  )

  expect(texto).toBe(
    'Sesión (5 h): 4% usado, se reinicia en 3h · Semana (todos los modelos): 10% usado, se reinicia en 5d · Semana (Fable): 0% usado, se reinicia en 5d',
  )
  expect(resumenUso([], AHORA)).toBe('')
})

test('uso máximo para el color', async () => {
  expect(usoMaximo([])).toBe(0)
  expect(
    usoMaximo([
      { kind: 'five_hour', percentUsed: 4 },
      { kind: 'seven_day', percentUsed: 72.5 },
    ]),
  ).toBe(72.5)
})

test('/contexto suma el uso de la cuenta', async ($, on) => {
  mock.clock(on, { now: AHORA })
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  on('ui.status', async () => ({ value: undefined }))

  await $.session.measure({
    context: { percent: 11, tokens: 107_000, window: 1_000_000 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 4, resetsAt: '2026-10-16T15:30:00Z' }],
    cost: { usd: 1.25 },
    changed: ['context', 'rateLimits', 'cost'],
  })

  const { text } = await $.command.run({
    command: 'contexto',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })

  expect(text).toContain('Contexto 11%')
  expect(text).toContain('Uso de la cuenta: Sesión (5 h): 4% usado, se reinicia en 3h')
  expect(text).toContain('Equivalente API: US$ 1,25 (no se cobra en el plan)')
})

test('costo de la sesión: gasto con API key, equivalente sin cobro con plan', async () => {
  expect(gastoSesion(null)).toBe('')
  expect(gastoSesion(3.214)).toBe('Gasto de la sesión: US$ 3,21')
  expect(gastoSesion(602.834, true)).toBe('Equivalente API: US$ 602,83 (no se cobra en el plan)')
  expect(
    resumenCuenta([{ kind: 'five_hour', percentUsed: 4 }], 0.5, AHORA),
  ).toBe('Sesión (5 h): 4% usado · Equivalente API: US$ 0,50 (no se cobra en el plan)')
  expect(resumenCuenta([], null, AHORA)).toBe('')
  expect(resumenCuenta([], 2, AHORA)).toBe('Gasto de la sesión: US$ 2,00')
})

test('reset vencido se lee «se reinicia ya»', async () => {
  expect(
    resumenUso([{ kind: 'seven_day', percentUsed: 99, resetsAt: '2026-10-16T11:00:00Z' }], AHORA),
  ).toBe('Semana (todos los modelos): 99% usado, se reinicia ya')
})
