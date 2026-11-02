import { expect, test } from 'claude-code/testing'

import { avisoParaClaude, barra, nivelDe, rearmar, umbralNuevo } from './umbrales'

test('cada umbral se avisa una sola vez y en orden', async () => {
  expect(umbralNuevo(40, 0)).toBe(null)
  expect(umbralNuevo(61, 0)).toBe(60)
  expect(umbralNuevo(65, 60)).toBe(null)
  expect(umbralNuevo(80, 60)).toBe(75)
  // Un salto grande avisa directo el umbral más alto cruzado.
  expect(umbralNuevo(90, 0)).toBe(85)
  expect(umbralNuevo(95, 85)).toBe(null)
})

test('tras compactar se rearma el aviso', async () => {
  // Estaba avisado al 85 y el contexto bajó al 30: vuelve a cero.
  expect(rearmar(30, 85)).toBe(0)
  // Bajó del 85 al 70: queda avisado el 60 y el 75 puede volver a sonar.
  expect(rearmar(70, 85)).toBe(60)
  expect(umbralNuevo(76, rearmar(70, 85))).toBe(75)
})

test('nivel y barra', async () => {
  expect(nivelDe(10)).toBe('ok')
  expect(nivelDe(60)).toBe('atento')
  expect(nivelDe(75)).toBe('alto')
  expect(nivelDe(85)).toBe('critico')
  expect(barra(50, 10)).toBe('█████░░░░░')
  expect(barra(150, 4)).toBe('████')
})

test('el aviso para Claude nombra la regla y el HANDOFF', async () => {
  const aviso = avisoParaClaude(78, 75)
  expect(aviso).toContain('78%')
  expect(aviso).toContain('CLAUDE.md del proyecto')
  expect(avisoParaClaude(90, 85)).toContain('crítico')
})

test('el prompt lleva el aviso al cruzar un umbral, y una sola vez', async ($, on) => {
  const vistos: (readonly string[] | undefined)[] = []
  const toasts: string[] = []
  // Lo que en una sesión responde el motor.
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  on('ui.status', async () => ({ value: undefined }))
  on('ui.toast', async (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('prompt.submit', async (_$, e) => {
    vistos.push(e.context)
    return { text: e.text }
  })

  const medir = (percent: number) =>
    $.session.measure({
      context: { percent, tokens: percent * 10_000, window: 1_000_000 },
      rateLimits: [],
      changed: ['context'],
    })
  const enviar = () => $.prompt.submit({ text: 'hola', wait: false, origin: { kind: 'composer' } })

  await medir(30)
  await enviar()
  await medir(62)
  await enviar()
  await enviar()

  expect(vistos[0]).toBeUndefined()
  expect(vistos[1]?.[0]).toContain('[medidor-contexto]')
  expect(vistos[2]).toBeUndefined()
  expect(toasts).toHaveLength(1)
})
