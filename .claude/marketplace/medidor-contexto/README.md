# medidor-contexto

Mod de Claude Code que mide cuánto contexto lleva la conversación y avisa a
tiempo para dejar un handoff. Sirve en cualquier proyecto: no depende de
ningún repo.

## Qué hace

- **Aviso a Claude (todas las superficies, VS Code incluido).** Al cruzar
  60 %, 75 % y 85 % adjunta al siguiente prompt un bloque de contexto que lee
  solo el modelo. Al 60 % solo le pide avisar al usuario y ofrecer un handoff
  donde lo indique el `CLAUDE.md` del proyecto. **Context Keeper (0.8):** al
  75 % y al 85 % le pide **escribir o actualizar el handoff directamente**,
  sin esperar a que el usuario lo pida (estado actual, decisiones con su
  porqué, próximo paso, información útil), en la ruta que fije el
  `CLAUDE.md`; si no dice dónde, preguntar en vez de crear carpetas. Una vez
  por umbral; si una compactación baja el porcentaje, se rearma.
- **Uso de la cuenta**: los límites que informa la última respuesta
  (`Sesión 5h`, `Semana` y las semanales por modelo, p. ej. `Semana Fable`),
  con el porcentaje y cuánto falta para el reset. Va en la banda (tenue
  hasta el 60 %, coloreado desde ahí) y en `/contexto`. Sin suscripción, o
  antes de la primera respuesta, no aparece. Solo se muestran las ventanas
  que el motor recibe: si alguna del panel de uso no llega, no hay de dónde
  leerla.
- **`/contexto`**: barra, porcentaje, tokens usados, nivel y uso de la cuenta.
- **Tareas en segundo plano**: mientras Claude tiene comandos en segundo
  plano, monitores, subagentes o workflows corriendo, la banda suma una línea
  con un indicador que gira, cuántas son, qué es cada una y cuánto llevan
  (`⠹ 2 tareas en ejecución: comando «Levantar API» 1m 5s · subagente
  «Revisar diff» 12s`). El motor no ofrece la lista: el mod la arma a partir
  del resultado de `Bash`, `Monitor`, `Agent` y `Workflow` cuando quedan en
  segundo plano (y de `SendMessage` cuando reanuda un subagente propio, vía
  `session.send`), y quita cada tarea con su aviso `<task-notification>` de
  estado final, con un `TaskStop`, o cuando `$.agent.list()` da al subagente
  por terminado. El reloj de 1 s corre solo mientras haya tareas.
  `/tareas` muestra la lista y `/tareas limpiar` la vacía si quedó alguna
  colgada. Cada tarea va en su línea; la de un **workflow** suma cuántos
  agentes trabajan y cuántos terminaron (`agent.spawn` con `workflow.runId`
  → `turn.complete` con `reason: 'answer'`), y la de un workflow o subagente,
  la última herramienta que usó uno de sus agentes. Solo se anotan las tareas
  del loop principal: el aviso de fin de la de un agente le llega a ese agente.
  Límites conocidos: un agente de workflow que el motor reintenta por atasco
  no vuelve a emitir `agent.spawn` y puede perder su «listo», y el avance de
  un workflow lanzado por un subagente queda en `$.state` hasta un `/clear`.
- **Gráficos (0.6)**: donde la banda puede dibujar SVG (escritorio, panel de
  VS Code, móvil) cada tarea lleva un chip de color por tipo (WF violeta, AGT
  azul, CMD verde, MON ámbar). Un workflow tiene además una barra de listos
  sobre total, indeterminada mientras no arranca ningún agente. La cabecera
  muestra un indicador que gira con SMIL (`isInteractive`, para que también se
  anime en el escritorio) y la barra del contexto es un SVG del color del nivel.
  El botón **ver** de un subagente abre su conversación (`$.ui.view`); si el
  motor no la muestra, un toast dice por qué. La terminal sigue con el texto.
  Los tipos del motor dicen que la banda sale solo en terminal y escritorio,
  pero el panel de VS Code 2.1.314 también la dibuja.
- **Mission Control (0.8)**: cada subagente o workflow suma a su línea (banda
  y `/tareas`) el **modelo** (`agent.spawn`: `model` que resolvió el motor,
  p. ej. `haiku-4-5`; en un workflow, los distintos de los agentes que
  trabajan) y los **tokens** que procesaron sus turnos ya terminados
  (`turn.complete.usage`: entrada + salida + caché, p. ej. `12k tok`), junto
  a la herramienta actual que ya se mostraba. Limitaciones, porque la API no
  los da: `$.agent.list()` solo trae `id`, `description`, `type`, `status`,
  `parentId`, `spawnedBy` y `name` (ni modelo ni tokens); los tokens llegan
  solo al **terminar** un turno del agente, así que mientras corre su primer
  turno no hay cifra, y es lo procesado (suma de pedidos, con caché), no el
  contexto vivo del agente; si el `agent.spawn` de un agente de workflow
  llega después de su `turn.complete`, esos tokens no se anotan.
- **Vigilante de caché (0.7)**: el prompt cache vence si pasa demasiado
  tiempo entre un turno y el siguiente (1 hora con suscripción; 5 minutos con
  API key o en overage), y el primer mensaje después —aunque sea «hola»—
  relee toda la conversación. El mod anota el fin de cada turno del loop
  principal; a 5 minutos del vencimiento muestra un toast («La caché vence en
  5 min…», uno por pausa) y, ya vencida, la banda suma una línea
  («Caché vencida hace 12 min: el próximo mensaje relee toda la conversación
  (≈N tokens)»). Si el mensaje llega con la caché vencida, Claude recibe un
  aviso para decírselo al usuario y, con el contexto en 50 % o más, sugerir
  `/compact` o un handoff. El TTL (`CACHE_TTL_MIN`, 60) y el margen
  (`CACHE_AVISO_MIN`, 5) viven en `hooks/cache.ts`: con API key hay que
  bajar el TTL a 5. El reloj (cada 30 s) arranca con el primer turno y se
  apaga al vencer; el mod no sabe si la cuenta está en overage, así que el
  TTL no se ajusta solo.
- **Banda arriba del prompt**: barra coloreada del contexto y uso de la
  cuenta; además, línea de estado desde el 60 % y toast al cruzar cada
  umbral. Las versiones viejas de la extensión de VS Code no dibujaban la
  banda (`AbovePrompt`); desde la 2.1.314 sí.

Un fallo del mod nunca bloquea un prompt (`prompt.submit` tiene `.catch`).

## Cómo se carga

Se instala a scope de usuario, para todos los proyectos, desde el
marketplace local `plugins-locales` (`~/.claude/plugins-locales/`):

```bash
claude plugin marketplace add ~/.claude/plugins-locales
claude plugin install medidor-contexto@plugins-locales
```

Requiere Claude Code v2.1.287 o posterior.

## Cómo se prueba

```bash
claude plugin validate ~/.claude/plugins-locales/medidor-contexto
claude plugin test ~/.claude/plugins-locales/medidor-contexto
```

Los umbrales y el texto del aviso viven en `hooks/umbrales.ts` y el formato
del uso de la cuenta en `hooks/uso-cuenta.ts`, y la lista de tareas en
`hooks/tareas.ts` y las reglas del vigilante de caché en `hooks/cache.ts`
(funciones puras);
`hooks/register.tsx` solo los conecta a los eventos.
