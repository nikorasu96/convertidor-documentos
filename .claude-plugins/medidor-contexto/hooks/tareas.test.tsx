import { expect, mock, test } from 'claude-code/testing'

import type { TareaFondo } from '../types'
import { barraSvg, chipSvg, giroSvg } from './dibujo'
import {
  accion,
  agregar,
  claveDe,
  clavesDe,
  conAccion,
  conListo,
  duracion,
  lineaTarea,
  quitar,
  recortar,
  resumenTareas,
  sinClaves,
  terminadasEn,
} from './tareas'

const comando: TareaFondo = { id: 'b1', tipo: 'comando', descripcion: 'Levantar API', desde: 0 }
const agente: TareaFondo = { id: 'a1', tipo: 'agente', descripcion: 'Revisar diff', desde: 50_000 }

test('agregar no duplica y quitar saca por id', async () => {
  expect(agregar([comando], { ...comando, descripcion: 'otra' })).toEqual([{ ...comando, descripcion: 'otra' }])
  expect(quitar([comando, agente], ['b1'])).toEqual([agente])
})

test('un aviso con estado final termina la tarea; el evento de un monitor no', async () => {
  const fin = '<task-notification>\n<task-id>b1</task-id>\n<status>completed</status>\n</task-notification>'
  const evento = '<task-notification>\n<task-id>m1</task-id>\n<event>linea</event>\n</task-notification>'
  const sigue = '<task-notification><task-id>m2</task-id><status>running</status></task-notification>'

  expect(terminadasEn(fin)).toEqual(['b1'])
  expect(terminadasEn(evento)).toEqual([])
  expect(terminadasEn(sigue)).toEqual([])
  expect(terminadasEn(`${fin}\n${sigue}\n<task-notification><task-id>x</task-id><status>killed</status>`)).toEqual([
    'b1',
    'x',
  ])
  expect(terminadasEn('hola')).toEqual([])
})

test('duración, recorte y resumen', async () => {
  expect(duracion(5_400)).toBe('5s')
  expect(duracion(65_000)).toBe('1m 5s')
  expect(duracion(3_720_000)).toBe('1h 2m')
  expect(recortar('a\n  b')).toBe('a b')
  expect(recortar('x'.repeat(50), 10)).toBe(`${'x'.repeat(9)}…`)
  expect(resumenTareas([], 0)).toBe('')
  expect(resumenTareas([comando], 65_000)).toBe('1 tarea en ejecución: comando «Levantar API» 1m 5s')
  expect(resumenTareas([comando, agente], 62_000)).toBe(
    '2 tareas en ejecución: comando «Levantar API» 1m 2s · subagente «Revisar diff» 12s',
  )
})

test('un comando en segundo plano aparece en /tareas y su aviso lo saca', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  // Lo que en una sesión responde el motor: la herramienta pasó a segundo plano.
  on('tool.call', { tool: 'Bash' }, async () => ({
    result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b7' },
  }))
  on('prompt.submit', async (_$, e) => ({ text: e.text }))

  const tareas = () =>
    $.command.run({
      command: 'tareas',
      args: '',
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 120 },
    })

  await $.tool.call({ tool: 'Bash', command: 'npm run dev', description: 'Levantar API', run_in_background: true })
  expect((await tareas()).text).toBe('1 tarea en ejecución:\n- comando «Levantar API» 0s')

  await $.prompt.submit({
    text: '<task-notification>\n<task-id>b7</task-id>\n<status>completed</status>\n</task-notification>',
    wait: false,
    origin: { kind: 'task-notification' },
  })
  expect((await tareas()).text).toBe('No hay tareas en segundo plano.')
})

test('accion resume la herramienta en pocas palabras', async () => {
  expect(accion('Read', { file_path: 'C:\\repo\\hooks\\register.tsx' })).toBe('Read register.tsx')
  expect(accion('Grep', { pattern: 'agentId' })).toBe('Grep «agentId»')
  expect(accion('Bash', { command: 'npm test', description: 'Correr tests' })).toBe('Bash Correr tests')
  expect(accion('TodoWrite', {})).toBe('TodoWrite')
})

test('un workflow cuenta agentes trabajando y listos, y muestra lo último que hicieron', async () => {
  const wf: TareaFondo = { id: 'w1', tipo: 'workflow', descripcion: 'review', desde: 0, runId: 'wf_1' }
  const activos = [
    { id: 'x1', clave: 'wf_1' },
    { id: 'x2', clave: 'wf_1' },
  ]
  let p = conListo({}, 'wf_1')
  p = conAccion(p, 'wf_1', 'Read a.ts')

  expect(claveDe([wf], activos, 'x2')).toBe('wf_1')
  expect(claveDe([wf], activos, 'otro')).toBe(undefined)
  expect(lineaTarea(wf, activos, p, 90_000)).toEqual({
    principal: 'workflow «review» 1m 30s · 2 agentes trabajando, 1 listo',
    ultima: 'Read a.ts',
  })
  expect(clavesDe([wf], ['w1'])).toEqual(['w1', 'wf_1'])
  expect(sinClaves(p, ['wf_1'])).toEqual({})
})

test('un subagente en segundo plano muestra su última herramienta en /tareas', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  on('tool.call', { tool: 'Agent' }, async () => ({
    result: { status: 'async_launched', agentId: 'a9', description: 'Revisar diff', prompt: 'p', outputFile: 'o' },
  }))
  on('tool.call', { tool: 'Read' }, async () => ({ result: { type: 'text', file: { filePath: 'x', content: '', numLines: 0, startLine: 1, totalLines: 0 } } }))

  await $.tool.call({ tool: 'Agent', description: 'Revisar diff', prompt: 'p' })
  await $.tool.call({ tool: 'Read', file_path: 'C:/repo/hooks/tareas.ts', agentId: 'a9' })

  const { text } = await $.command.run({
    command: 'tareas',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })

  expect(text).toBe('1 tarea en ejecución:\n- subagente «Revisar diff» 0s · Read tareas.ts')
})

const BANDA = {
  plugin: 'medidor-contexto',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 20,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 19 },
    view: {},
  },
} as const

test('la tarea de un agente no se anota: su aviso nunca llega al loop principal', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  on('tool.call', { tool: 'Bash' }, async () => ({
    result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b8' },
  }))

  await $.tool.call({ tool: 'Bash', command: 'sleep 9', run_in_background: true, agentId: 'x1' })

  const { text } = await $.command.run({
    command: 'tareas',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })
  expect(text).toBe('No hay tareas en segundo plano.')
})

test('un workflow se dibuja en la banda en todas las superficies y su aviso lo saca', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  // Un solo motor de reemplazo: el script «mal» responde con error de sintaxis.
  on('tool.call', { tool: 'Workflow' }, async (_$, e) => ({
    result:
      e.script === 'mal'
        ? { status: 'async_launched', taskId: 'w6', error: 'SyntaxError' }
        : { status: 'async_launched', taskId: 'w5', workflowName: 'revisar', runId: 'wf_5' },
  }))
  on('prompt.submit', async (_$, e) => ({ text: e.text }))
  // Sin tareas ni medición la banda cede: este hook hace de motor.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>motor</Text>
  })

  const tareas = async () =>
    (
      await $.command.run({
        command: 'tareas',
        args: '',
        origin: { kind: 'composer' },
        presentation: { isFullscreen: false, columns: 120 },
      })
    ).text

  // Un workflow con error de sintaxis no se anota.
  await $.tool.call({ tool: 'Workflow', script: 'mal' })
  expect(await tareas()).toBe('No hay tareas en segundo plano.')

  await $.tool.call({ tool: 'Workflow', script: 'export const meta = {}' })
  expect(await tareas()).toBe('1 tarea en ejecución:\n- workflow «revisar» 0s · 0 agentes trabajando')

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BANDA, surface })
    expect((await ui.find({ type: 'Text', text: /tarea en ejecución/ }))?.text).toContain('1 tarea en ejecución')

    if (surface === 'terminal') {
      // Sin SVG: la fila es texto.
      expect((await ui.find({ type: 'Text', text: /workflow/ }))?.text).toContain(
        'workflow «revisar» 0s · 0 agentes trabajando',
      )
    } else {
      // Con SVG: chip, barra y textos por separado.
      expect((await ui.find({ type: 'Text', text: /^revisar$/ }))?.text).toBe('revisar')
      expect((await ui.find({ type: 'Text', text: /arrancando/ }))?.text).toBe('arrancando')
      expect(await ui.find({ type: 'Svg' })).not.toBe(undefined)
    }

    await ui.unmount()
  }

  await $.prompt.submit({
    text: '<task-notification><task-id>w5</task-id><status>completed</status></task-notification>',
    wait: false,
    origin: { kind: 'task-notification' },
  })

  const ui = await $.ui.mount({ ...BANDA, surface: 'vscode' })
  expect(await ui.find({ type: 'Text', text: /tarea en ejecución/ })).toBe(undefined)
  expect((await ui.find({ type: 'Text', text: /motor/ }))?.text).toBe('motor')
  await ui.unmount()
})

test('recortar no parte banderas ni emojis compuestos', async () => {
  const bandera = '\u{1F1E6}\u{1F1F7}'
  const familia = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}'

  expect(recortar(`${'a'.repeat(39)}${bandera}`, 40)).toBe(`${'a'.repeat(39)}${bandera}`)
  expect(recortar(`${'a'.repeat(39)}${bandera}x`, 40)).toBe(`${'a'.repeat(39)}…`)
  expect(recortar(`${familia}${familia}${familia}`, 2)).toBe(`${familia}…`)
})

test('los SVG: barra proporcional, indeterminada sin agentes, chip y giro animado', async () => {
  expect(barraSvg(1, 1, '#000', 90)).toContain('<rect width="45" height="6" rx="3" fill="#000"/>')
  expect(barraSvg(0, 2, '#000', 90)).not.toContain('fill="#000"')
  expect(barraSvg(0, 0, '#000', 90)).toContain('<animate attributeName="x"')
  expect(chipSvg('workflow')).toContain('>WF</text>')
  expect(chipSvg('comando')).toContain('>CMD</text>')
  expect(giroSvg()).toContain('animateTransform')
})

test('en el escritorio: fila de subagente con «ver», barra de contexto y un deny que solo avisa', async ($, on) => {
  const toasts: string[] = []
  const vistas: string[] = []
  mock.clock(on, { now: 1_000_000 })
  on('tool.call', { tool: 'Agent' }, async () => ({
    result: { status: 'async_launched', agentId: 'a9', description: 'Revisar diff', prompt: 'p', outputFile: 'o' },
  }))
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  on('ui.status', async () => ({ value: undefined }))
  on('ui.toast', async (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  // Un hook que rechaza la vista: la promesa del plugin se rechaza y no debe quedar sin manejar.
  on('ui.view', async (_$, e) => {
    vistas.push('agentId' in e ? String(e.agentId) : '')
    return { deny: 'sin agente' }
  })

  await $.session.measure({
    context: { percent: 87, tokens: 870_000, window: 1_000_000 },
    rateLimits: [],
    changed: ['context'],
  })
  await $.tool.call({ tool: 'Agent', description: 'Revisar diff', prompt: 'p' })

  const ui = await $.ui.mount({ ...BANDA, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^Revisar diff$/ }))?.text).toBe('Revisar diff')
  expect((await ui.find({ type: 'Text', text: /Contexto 87%/ }))?.text).toContain('Contexto 87%')

  await ui.press({ key: 'ver-a9' })
  expect(vistas).toEqual(['a9'])
  expect(toasts.at(-1)).toBe('No se pudo abrir el subagente')
  await ui.unmount()
})
