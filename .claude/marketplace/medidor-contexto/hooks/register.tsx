import { atom, read, update } from 'claude-code'
import type { Hook, Register, Timer } from 'claude-code'

import type { LecturaContexto, TareaFondo } from '../types'
import {
  accion,
  agenteDestino,
  agregar,
  cabeceraTareas,
  claveDe,
  clavesDe,
  conAccion,
  conListo,
  conTokens,
  giro,
  lineaTarea,
  partesTarea,
  quitablesTrasConciliar,
  quitar,
  sinClaves,
  terminadasEn,
  tokensDe,
} from './tareas'
import { avisoCacheParaClaude, estadoCache, porVencer, textoBanda, textoPorVencer } from './cache'
import { barraSvg, chipSvg, giroSvg } from './dibujo'
import { avisoParaClaude, barra, miles, nivelDe, rearmar, umbralNuevo } from './umbrales'
import { resumenCuenta, usoMaximo } from './uso-cuenta'

const lectura = atom({ plugin: 'medidor-contexto', key: 'lectura' } as const, null)
const limites = atom({ plugin: 'medidor-contexto', key: 'limites' } as const, [])
const gasto = atom({ plugin: 'medidor-contexto', key: 'gasto' } as const, null)
const tareas = atom({ plugin: 'medidor-contexto', key: 'tareas' } as const, [])
const modelos = atom({ plugin: 'medidor-contexto', key: 'modelos' } as const, {})
const ahora = atom({ plugin: 'medidor-contexto', key: 'ahora' } as const, 0)
const activos = atom({ plugin: 'medidor-contexto', key: 'activos' } as const, [])
const progreso = atom({ plugin: 'medidor-contexto', key: 'progreso' } as const, {})
const ultimoTurno = atom({ plugin: 'medidor-contexto', key: 'ultimoTurno' } as const, null)

/** Tareas que se muestran una por línea en la banda; el resto, «+N más». */
const LINEAS_MAX = 4

/** Superficies que dibujan Svg. */
const SUPERFICIES_SVG: ReadonlySet<string> = new Set(['desktop', 'vscode', 'mobile'])

/** Estados de `$.agent.list()` con los que un subagente ya terminó. */
const AGENTE_TERMINADO = new Set(['completed', 'failed', 'killed'])

type Api = Parameters<Hook<'session.start'>>[0]

const COLOR = { ok: 'success', atento: 'suggestion', alto: 'warning', critico: 'error' } as const
/** Los mismos niveles en hex, para los SVG (no conocen el tema). */
const COLOR_NIVEL = { ok: '#3fb950', atento: '#4f9cf9', alto: '#d29922', critico: '#f85149' } as const

const resumen = (l: LecturaContexto): string =>
  `Contexto ${l.percent}% · ${miles(l.tokens)}/${miles(l.window)} tokens`

// Reloj que mueve el giro y las duraciones; corre solo mientras hay tareas.
let reloj: Timer | null = null
let pasos = 0

// Reloj del vigilante de caché: corre desde el primer turno y se apaga al vencer la caché.
let relojCache: Timer | null = null
// Ya se avisó (o ya venció) en esta pausa; el próximo turno lo rearma.
let cacheAvisada = false

/** Cada cuánto mira el reloj del vigilante. */
const CACHE_PASO_MS = 30_000

function pararCache(): void {
  relojCache?.cancel()
  relojCache = null
}

// Un turno terminado (o un mensaje que va a la caché) empieza la cuenta de nuevo.
async function armarCache($: Api, desde: number): Promise<void> {
  pararCache()
  cacheAvisada = false
  await update($, ultimoTurno, () => desde)
  relojCache = $.clock.every(CACHE_PASO_MS, () => {
    void vigilarCache($).catch(() => pararCache())
  })
}

// Avisa una vez al acercarse el vencimiento; al vencer redibuja la banda y se apaga.
async function vigilarCache($: Api): Promise<void> {
  const desde = await read($, ultimoTurno)

  if (desde === null) return pararCache()

  const estado = estadoCache(desde, await $.clock.now())

  if (estado.vigente && porVencer(estado) && !cacheAvisada) {
    cacheAvisada = true
    $.ui.toast(textoPorVencer(estado.minutosRestantes))
  }

  if (!estado.vigente) {
    cacheAvisada = true
    pararCache()
    await marcar($)
  }
}

// Tras un hot reload el reloj anterior ya no existe: se retoma si la caché sigue vigente.
async function reanudarCache($: Api): Promise<void> {
  const desde = await read($, ultimoTurno)

  if (desde !== null && relojCache === null && estadoCache(desde, await $.clock.now()).vigente) {
    await armarCache($, desde)
  }
}

// Si el mensaje llega con la caché vencida: texto para Claude, y la cuenta se rearma.
async function avisoDeCache($: Api): Promise<string | null> {
  const desde = await read($, ultimoTurno)

  if (desde === null) return null

  const t = await $.clock.now()
  const estado = estadoCache(desde, t)

  if (estado.vigente) return null

  await armarCache($, t)

  return avisoCacheParaClaude(estado.minutosVencida, (await read($, lectura))?.percent)
}

async function marcar($: Api): Promise<void> {
  const t = await $.clock.now()
  await update($, ahora, () => t)
}

// Un subagente que terminó sin que llegara su aviso se descarta igual.
async function conciliarAgentes($: Api): Promise<void> {
  const lista = await read($, tareas)

  if (!lista.some(t => t.tipo === 'agente')) return

  // Sin lista no se concilia: la tarea sale igual con su aviso.
  const todos = await $.agent.list().catch(() => [])
  const terminados = quitablesTrasConciliar(
    lista,
    todos.filter(a => AGENTE_TERMINADO.has(a.status)).map(a => a.id),
    await $.clock.now(),
  )

  if (terminados.length > 0) {
    await update($, tareas, l => quitar(l, terminados))
    await update($, progreso, p => sinClaves(p, terminados))
    await update($, modelos, m => sinClaves(m, terminados))
  }
}

async function seguirReloj($: Api): Promise<void> {
  const lista = await read($, tareas)

  if (lista.length === 0) {
    reloj?.cancel()
    reloj = null
    // activos y progreso no se vacían acá: un workflow cuyos agentes ya arrancaron
    // puede no estar todavía en la lista, y se perdería su cuenta.
    return
  }

  if (reloj !== null) return

  // Se reserva sin await de por medio: dos lanzamientos a la vez no crean dos relojes.
  const propio: Timer = $.clock.every(1000, () => {
    void (async () => {
      // Un reloj que ya no es el vigente se apaga solo.
      if (reloj !== propio) {
        propio.cancel()
        return
      }

      pasos += 1
      if (pasos % 5 === 0) await conciliarAgentes($)
      await marcar($)
      await seguirReloj($)
    })().catch(() => undefined)
  })
  reloj = propio
  await marcar($)
}

async function lanzada(
  $: Api,
  tipo: TareaFondo['tipo'],
  id: string | undefined,
  descripcion: string,
  runId?: string,
) {
  if (id === undefined || id === '') return

  const desde = await $.clock.now()
  const nueva: TareaFondo = runId === undefined ? { id, tipo, descripcion, desde } : { id, tipo, descripcion, desde, runId }
  await update($, tareas, l => agregar(l, nueva))
  await seguirReloj($)
}

async function terminadas($: Api, ids: readonly string[]) {
  if (ids.length === 0) return

  // Con la tarea se van sus agentes y su avance, por id y por `runId`.
  const claves = clavesDe(await read($, tareas), ids)
  const deAgentes = (await read($, activos)).filter(a => claves.includes(a.clave)).map(a => a.id)
  await update($, tareas, l => quitar(l, ids))
  await update($, modelos, m => sinClaves(m, [...ids, ...deAgentes]))
  await update($, activos, l => l.filter(a => !claves.includes(a.clave)))
  await update($, progreso, p => sinClaves(p, claves))
  await seguirReloj($)
}

// Agentes de workflow cuyo turn.complete llegó antes de que su agent.spawn los anotara.
// El valor dice si respondió (cuenta como «listo»).
const terminadosAntes = new Map<string, boolean>()

/**
 * Abre la conversación de un subagente. Si el motor no la muestra (ya terminó),
 * lo dice en un toast; si un hook la rechaza, no queda nada sin manejar.
 */
async function verAgente($: Api, agentId: string): Promise<void> {
  try {
    const r = await $.ui.view({ agentId })
    if (r.deny !== undefined) $.ui.toast(`No se pudo abrir el subagente: ${r.deny}`)
  } catch {
    $.ui.toast('No se pudo abrir el subagente')
  }
}

async function limpiarTodo($: Api) {
  terminadosAntes.clear()
  await update($, tareas, () => [])
  await update($, activos, () => [])
  await update($, progreso, () => ({}))
  await update($, modelos, () => ({}))
  await seguirReloj($)
}

export const register: Register = on => {
  // Último umbral ya avisado a Claude (0 = ninguno). Vive por proceso: tras un
  // hot reload se reinicia y, como mucho, el aviso se repite una vez.
  let avisado = 0
  // Umbral cruzado que espera el próximo prompt para llegarle a Claude.
  let pendiente: number | null = null
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'contexto',
      description: 'Muestra cuánto contexto lleva la conversación',
    })
    await $.command.register({
      name: 'tareas',
      description: 'Lista las tareas en segundo plano en ejecución; «/tareas limpiar» vacía la lista',
    })
    // Tras un hot reload el reloj del módulo anterior ya no existe.
    await seguirReloj($)
    await reanudarCache($)

    return next(e)
  })

  // Las tareas en segundo plano nacen de estas herramientas; el id sale del resultado.
  // Solo las del loop principal: el aviso de fin de la de un agente le llega a ese
  // agente y nunca pasaría por el prompt.submit que la quita de la lista.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const r = await next(e)

    if (r.deny === undefined && r.isError !== true && e.agentId === undefined) {
      await lanzada($, 'comando', r.result.backgroundTaskId, e.description ?? e.command)
    }

    return r
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Monitor' }, async ($, e, next) => {
    const r = await next(e)

    if (r.deny === undefined && r.isError !== true && e.agentId === undefined) {
      await lanzada($, 'monitor', r.result.taskId, e.description)
    }

    return r
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const r = await next(e)

    if (r.deny === undefined && r.isError !== true && e.agentId === undefined) {
      const res = r.result

      if ('status' in res && res.status === 'async_launched') {
        await lanzada($, 'agente', res.agentId, res.description)
      }
    }

    return r
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Workflow' }, async ($, e, next) => {
    const r = await next(e)

    if (r.deny === undefined && r.isError !== true && r.result.error === undefined && e.agentId === undefined) {
      await lanzada($, 'workflow', r.result.taskId, r.result.workflowName ?? 'workflow', r.result.runId)
    }

    return r
  }).catch(($, e, next) => next(e))

  // Un SendMessage del loop principal a un subagente propio lo reanuda en segundo
  // plano sin pasar por la herramienta Agent: se anota igual, y sale con su aviso
  // de fin o cuando $.agent.list() lo da por terminado (pasada la gracia).
  on('session.send', async ($, e, next) => {
    const r = await next(e)

    if (r.isDelivered && e.agentId === undefined) {
      const agentes = await $.agent.list().catch(() => [])
      const destino = agenteDestino(agentes, e.to)
      if (destino !== undefined) await lanzada($, 'agente', destino.id, destino.description)
    }

    return r
  }).catch(($, e, next) => next(e))

  // Cada agente que arranca un workflow cuenta como trabajando hasta su turn.complete.
  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    const runId = e.workflow?.runId

    // El modelo con el que arrancó, para mostrarlo mientras el agente trabaje.
    if (r.deny === undefined && r.agentId !== undefined && r.model !== '') {
      const quien = r.agentId
      const modelo = r.model
      await update($, modelos, m => ({ ...m, [quien]: modelo }))
    }

    if (runId !== undefined && runId !== '' && r.deny === undefined && r.agentId !== undefined) {
      const id = r.agentId

      await update($, activos, l => [...l.filter(a => a.id !== id), { id, clave: runId }])

      // Si su turn.complete llegó mientras tanto, se cierra acá. Quien logra el
      // delete (sincrónico) es el único que lo cuenta.
      const respondio = terminadosAntes.get(id)

      if (respondio !== undefined && terminadosAntes.delete(id)) {
        await update($, activos, l => l.filter(a => a.id !== id))
        await update($, modelos, m => sinClaves(m, [id]))
        if (respondio) await update($, progreso, p => conListo(p, runId))
      }
    }

    return r
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    const id = e.agentId

    if (id !== undefined) {
      // Solo una respuesta cuenta como «listo»; abortado o con error deja de trabajar y nada más.
      const respondio = e.reason === 'answer'

      // Se anota antes de cualquier await, para que un agent.spawn que resuelve
      // ahora lo vea. Pasado el tope sale la entrada más vieja, no todas.
      terminadosAntes.set(id, respondio)
      while (terminadosAntes.size > 200) {
        const vieja = terminadosAntes.keys().next().value
        if (vieja === undefined) break
        terminadosAntes.delete(vieja)
      }

      const clave = (await read($, activos)).find(a => a.id === id)?.clave

      // Los tokens del turno van a la tarea del agente (de workflow o subagente).
      // Si el agent.spawn de un workflow llega después, esos tokens no se anotan.
      const deTarea = clave ?? claveDe(await read($, tareas), [], id)
      const gastados = tokensDe(e.usage)

      if (deTarea !== undefined && gastados > 0) await update($, progreso, p => conTokens(p, deTarea, gastados))

      if (clave !== undefined && terminadosAntes.delete(id)) {
        await update($, activos, l => l.filter(a => a.id !== id))
        await update($, modelos, m => sinClaves(m, [id]))
        if (respondio) await update($, progreso, p => conListo(p, clave))
      }
    }

    // Solo el turno del loop principal toca la caché; el de un subagente no.
    if (id === undefined) await armarCache($, await $.clock.now())

    return r
  }).catch(($, e, next) => next(e))

  // Lo que hace ahora un agente en segundo plano (de workflow o subagente): su última herramienta.
  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) {
      const clave = claveDe(await read($, tareas), await read($, activos), e.agentId)

      if (clave !== undefined) {
        const ultima = accion(e.tool, e as unknown as Record<string, unknown>)
        await update($, progreso, p => conAccion(p, clave, ultima))
      }
    }

    return next(e)
  }).catch(($, e, next) => next(e)) // nunca frena una herramienta

  on('tool.call', { tool: 'TaskStop' }, async ($, e, next) => {
    const r = await next(e)
    const id = e.task_id ?? e.shell_id

    if (r.deny === undefined && r.isError !== true && id !== undefined) {
      await terminadas($, [id])
    }

    return r
  }).catch(($, e, next) => next(e))

  // Un /clear no vuelve a emitir session.start: la conversación nueva arranca sin tareas.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await limpiarTodo($)
      pararCache()
      await update($, ultimoTurno, () => null)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('cost') && e.cost !== undefined) {
      const usd = e.cost.usd
      await update($, gasto, () => usd)
    }

    if (e.changed.includes('rateLimits')) {
      await update($, limites, () => [...e.rateLimits])
    }

    const { percent, tokens } = e.context

    if (percent === undefined || tokens === undefined) {
      return next(e)
    }

    const actual: LecturaContexto = { percent, tokens, window: e.context.window }
    await update($, lectura, () => actual)

    avisado = rearmar(percent, avisado)
    const nuevo = umbralNuevo(percent, avisado)

    if (nuevo !== null) {
      avisado = nuevo
      pendiente = nuevo
      $.ui.toast(`${resumen(actual)}: considerá un handoff`)
    }

    $.ui.status(nivelDe(percent) === 'ok' ? undefined : `${resumen(actual)} (${nivelDe(percent)})`)

    return next(e)
  })

  // Llega en cualquier superficie, VS Code incluido: el texto va en `context`,
  // que lee el modelo y el usuario no ve.
  on('prompt.submit', async ($, e, next) => {
    // El aviso de que una tarea en segundo plano terminó la saca de la lista.
    if (e.origin.kind === 'task-notification') {
      await terminadas($, terminadasEn(e.text))
    }

    if (e.origin.kind === 'plugin') {
      return next(e)
    }

    const avisos: string[] = []
    const deCache = await avisoDeCache($)

    if (deCache !== null) avisos.push(deCache)

    if (pendiente !== null) {
      const percent = (await read($, lectura))?.percent ?? pendiente
      avisos.push(avisoParaClaude(percent, pendiente))
      pendiente = null
    }

    return next(avisos.length === 0 ? e : { ...e, context: [...(e.context ?? []), ...avisos] })
  }).catch(($, e, next) => next(e)) // un fallo del medidor nunca frena un prompt

  on('command.run', { command: 'contexto' }, async $ => {
    const actual = await read($, lectura)
    const uso = resumenCuenta(await read($, limites), await read($, gasto), await $.clock.now())
    const lineaUso = uso === '' ? '' : `\nUso de la cuenta: ${uso}`

    if (actual === null) {
      return { text: `Todavía no hay medición: aparece después de la primera respuesta.${lineaUso}` }
    }

    return { text: `${barra(actual.percent)} ${resumen(actual)} — nivel ${nivelDe(actual.percent)}${lineaUso}` }
  })

  on('command.run', { command: 'tareas' }, async ($, e) => {
    if (e.args.trim() === 'limpiar') {
      await limpiarTodo($)
      return { text: 'Lista de tareas en segundo plano vaciada.' }
    }

    await conciliarAgentes($)
    const lista = await read($, tareas)

    if (lista.length === 0) return { text: 'No hay tareas en segundo plano.' }

    const agentes = await read($, activos)
    const avance = await read($, progreso)
    const deModelos = await read($, modelos)
    const t = await $.clock.now()
    const lineas = lista.map(tarea => {
      const { principal, ultima } = lineaTarea(tarea, agentes, avance, t, deModelos)
      return `- ${principal}${ultima === undefined ? '' : ` · ${ultima}`}`
    })

    return { text: [`${cabeceraTareas(lista.length)}:`, ...lineas].join('\n') }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const actual = await read($, lectura)
    const ventanas = await read($, limites)
    const lista = await read($, tareas)
    const agentes = await read($, activos)
    const avance = await read($, progreso)
    const deModelos = await read($, modelos)
    const t = Math.max(await read($, ahora), await $.clock.now())
    const uso = resumenCuenta(ventanas, await read($, gasto), t)

    const desde = await read($, ultimoTurno)
    const lineaCache = desde === null ? '' : textoBanda(estadoCache(desde, t), actual?.tokens)

    if (e.props.hasSurvey || (actual === null && uso === '' && lista.length === 0 && lineaCache === '')) {
      return next(e)
    }

    const tabla = $.ui.resolve(e)
    const { Box, Text, Button } = tabla
    // Gráficos en las superficies que dibujan SVG; texto en la terminal y en
    // cualquier otra. Los tipos dicen que la banda sale en terminal y escritorio,
    // pero el panel de VS Code 2.1.314 también la dibuja (captura del usuario).
    // Se decide por una lista: la tabla trae todos los nombres, y donde no hay
    // Svg se dibujaría vacío.
    const Svg = SUPERFICIES_SVG.has(e.surface) && 'Svg' in tabla ? tabla.Svg : undefined
    // El uso de la cuenta va tenue mientras esté bajo; se colorea desde el 60 %.
    const nivelUso = nivelDe(usoMaximo(ventanas))
    const visibles = lista.slice(0, LINEAS_MAX)

    const filaTexto = (tarea: TareaFondo) => {
      const { principal, ultima } = lineaTarea(tarea, agentes, avance, t, deModelos)

      return (
        // Un solo Text por fila: si no entra, se corta al final en vez de partirse en columnas.
        <Box key={tarea.id}>
          <Text wrap="truncate-end">
            {`  ${principal}`}
            {ultima !== undefined && <Text dimColor>{` · ${ultima}`}</Text>}
          </Text>
        </Box>
      )
    }

    const filaGrafica = (tarea: TareaFondo, Dibujo: NonNullable<typeof Svg>) => {
      const p = partesTarea(tarea, agentes, avance, t, deModelos)
      const total = p.listos + p.trabajando

      return (
        <Box key={tarea.id} flexDirection="column">
          <Box flexDirection="row" alignItems="center" gap={1}>
            <Dibujo source={chipSvg(tarea.tipo)} alt={tarea.tipo} width={34} height={16} />
            <Text wrap="truncate-end">{p.descripcion}</Text>
            {tarea.tipo === 'workflow' && (
              <Dibujo
                source={barraSvg(p.listos, p.trabajando)}
                isInteractive
                alt={`${p.listos} de ${total} agentes listos`}
                width={90}
                height={6}
              />
            )}
            {tarea.tipo === 'workflow' && <Text dimColor>{total === 0 ? 'arrancando' : `${p.listos}/${total}`}</Text>}
            <Text dimColor>{p.duracion}</Text>
            {p.modelo !== undefined && <Text dimColor>{p.modelo}</Text>}
            {p.tokens !== undefined && <Text dimColor>{p.tokens}</Text>}
            {tarea.tipo === 'agente' && (
              // Abre la conversación del subagente, como la lista de tareas nativa.
              <Button key={`ver-${tarea.id}`} dimColor onPress={() => verAgente($, tarea.id)}>
                ver
              </Button>
            )}
          </Box>
          {p.ultima !== undefined && <Text dimColor wrap="truncate-end">{`     └ ${p.ultima}`}</Text>}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {lista.length > 0 && (
          <Box flexDirection="row" alignItems="center" gap={1}>
            {Svg === undefined ? (
              <Text color="suggestion">{giro(t)}</Text>
            ) : (
              // isInteractive: en el escritorio, sin él, la animación SMIL no corre.
              <Svg source={giroSvg()} alt="trabajando" width={14} height={14} isInteractive />
            )}
            <Text color="suggestion">{cabeceraTareas(lista.length)}</Text>
          </Box>
        )}
        {visibles.map(tarea => (Svg === undefined ? filaTexto(tarea) : filaGrafica(tarea, Svg)))}
        {lista.length > LINEAS_MAX && <Text dimColor>{`  +${lista.length - LINEAS_MAX} más`}</Text>}
        {(actual !== null || uso !== '') && (
          <Box flexDirection="row" alignItems="center">
            {actual !== null &&
              (Svg === undefined ? (
                <Text color={COLOR[nivelDe(actual.percent)]}>{barra(actual.percent)}</Text>
              ) : (
                <Svg
                  source={barraSvg(actual.percent, 100 - actual.percent, COLOR_NIVEL[nivelDe(actual.percent)], 70)}
                  alt={`Contexto ${actual.percent}%`}
                  width={70}
                  height={6}
                />
              ))}
            {actual !== null && <Text dimColor> {resumen(actual)}</Text>}
            {uso !== '' && actual !== null && <Text dimColor> │ </Text>}
            {uso !== '' &&
              (nivelUso === 'ok' ? <Text dimColor>{uso}</Text> : <Text color={COLOR[nivelUso]}>{uso}</Text>)}
          </Box>
        )}
        {lineaCache !== '' && <Text color="warning" wrap="truncate-end">{lineaCache}</Text>}
      </Box>
    )
  })
}
