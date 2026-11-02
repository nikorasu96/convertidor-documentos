# medidor-contexto

Mod de Claude Code que mide cuánto contexto lleva la conversación y avisa a
tiempo para dejar un handoff. Sirve en cualquier proyecto: no depende de
ningún repo.

## Qué hace

- **Aviso a Claude (todas las superficies, VS Code incluido).** Al cruzar
  60 %, 75 % y 85 % adjunta al siguiente prompt un bloque de contexto que lee
  solo el modelo: decirle al usuario cuánto contexto queda y ofrecer un
  handoff donde lo indique el `CLAUDE.md` del proyecto (si no dice dónde,
  preguntar en vez de crear carpetas). Una vez por umbral; si una
  compactación baja el porcentaje, se rearma.
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
  segundo plano, y quita cada tarea con su aviso `<task-notification>` de
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
`hooks/tareas.ts` (funciones puras);
`hooks/register.tsx` solo los conecta a los eventos.
