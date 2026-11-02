export type LecturaContexto = {
  /** Porcentaje usado, 0-100. */
  percent: number
  /** Tokens de entrada del último request. */
  tokens: number
  /** Tamaño de la ventana del modelo. */
  window: number
}

/**
 * Una ventana de límite de la cuenta, con la forma de `SessionRateLimit` del
 * motor (el contrato no puede importarlo: tiene que ser autocontenido).
 */
export type LimiteUso = {
  /** `five_hour`, `seven_day`, `seven_day_<modelo>`… */
  kind: string
  /** Porcentaje usado, 0-100. */
  percentUsed: number
  /** Cuándo se reinicia, ISO 8601. */
  resetsAt?: string
}

/** Una tarea en segundo plano lanzada en la sesión y todavía en ejecución. */
export type TareaFondo = {
  /** Id de la tarea (`backgroundTaskId`, `taskId` o `agentId`). */
  id: string
  tipo: 'comando' | 'monitor' | 'agente' | 'workflow'
  descripcion: string
  /** Cuándo se lanzó, ms desde epoch. */
  desde: number
  /** De un workflow: el `runId` que llevan sus agentes en `agent.spawn`. */
  runId?: string
}

/** Un agente de workflow que está trabajando, y la tarea a la que cuenta. */
export type AgenteActivo = {
  id: string
  /** `runId` del workflow (o id de la tarea) bajo el que se cuenta. */
  clave: string
}

/** Avance de una tarea con agentes, por clave (`runId` o id de la tarea). */
export type Progreso = {
  /** Agentes que ya terminaron. */
  listos: number
  /** Lo último que hizo uno de sus agentes (`Read register.tsx`). */
  ultima?: string
  /** Tokens procesados por los turnos ya terminados de sus agentes (`turn.complete.usage`). */
  tokens?: number
}

declare module 'claude-code' {
  interface PluginState {
    'medidor-contexto': {
      lectura: LecturaContexto | null
      /** Límites de la cuenta (5 h, semana, semana por modelo); vacío sin suscripción. */
      limites: LimiteUso[]
      /** Gasto total de la sesión en US$ (`cost.usd`); null si el motor no lo lleva. */
      gasto: number | null
      /** Tareas en segundo plano en ejecución. */
      tareas: TareaFondo[]
      /** Agentes de workflow trabajando ahora. */
      activos: AgenteActivo[]
      /** Avance de cada tarea con agentes, por clave. */
      progreso: Record<string, Progreso>
      /** Modelo de cada agente que arrancó (`agent.spawn`), por id de agente. */
      modelos: Record<string, string>
      /** Reloj del giro y de las duraciones; solo avanza mientras hay tareas. */
      ahora: number
      /** Fin del último turno del loop principal, ms desde epoch; null antes del primero. */
      ultimoTurno: number | null
    }
  }
}
