## Purpose

Convierte cada corrida de QA en un recorrido narrativo por etapas: plan de etapas con
estimados escalados por carga, roadmap visual tipo path con chispas de intuición por nodo,
notas humanas persistentes, modo por etapas con pausas y progreso en vivo — para que el
owner decida cómo observar (seguido vs por etapas), sepa qué mirar en cada tramo y el
sistema acumule el aprendizaje (baselines de máquina + notas de humano).

## ADDED Requirements

### Requirement: Plan de recorrido con estimados por etapa
El sistema SHALL ofrecer un plan de recorrido QA compuesto por etapas definidas
(`ROADMAP_ETAPAS`: setup, smoke, auth, flujo, CRUD por lotes, según alcance) — cada etapa
con nombre, chispa de intuición, comando que la ejecuta y estimado de minutos calculado
como `minutosBase × factorCarga`. El plan SHALL sumar el total del recorrido y ser
consultable antes de ejecutar (vía `/api/qa-roadmap` y el dashboard), de modo que el owner
decida con datos entre correr todo seguido o por etapas.

#### Scenario: Plan del recorrido completo
- **WHEN** se consulta el plan para alcance `suite completa` con factor de carga 1.4
- **THEN** la respuesta contiene las etapas del recorrido con estimados individuales
  escalados por el factor y un total aproximado del recorrido

#### Scenario: Plan por alcance parcial
- **WHEN** se consulta el plan para alcance `smoke`
- **THEN** el plan contiene solo las etapas que componen ese alcance (setup + smoke) y el
  total refleja únicamente esas etapas

### Requirement: Chispa de intuición por etapa
Cada etapa del roadmap SHALL llevar una chispa de intuición: 1-2 líneas curadas que
destilan qué guarda la etapa, qué mirar mientras corre y qué suele fallar, más la señal
histórica disponible (fecha y causa del último fallo de esa etapa en `qa-estado.json`).
La chispa SHALL mostrarse en el nodo del roadmap y en el reporte del concierge al cerrar
la etapa.

#### Scenario: Chispa con señal histórica
- **WHEN** la etapa `flujo` tiene un run previo con fallo registrado en el historial
- **THEN** el nodo muestra la chispa curada y una línea "última vez: <fecha> — <causa>"

#### Scenario: Chispa sin historial
- **WHEN** la etapa no tiene runs previos
- **THEN** el nodo muestra solo la chispa curada, sin línea histórica

### Requirement: Modo por etapas con pausas y notas
La skill de QA SHALL poder ejecutar el recorrido etapa por etapa: corre la etapa, reporta
resultado con estimado vs real e interpretación, y pausa esperando señal del owner antes
de continuar. Al cierre de cada etapa SHALL ofrecer registrar la observación del owner
como nota persistente asociada a `runId`+`etapaId` en `qa-estado.json` (vía
`POST /api/qa-estado`); también SHALL poder registrarla el owner directamente en el
dashboard. La nota de una etapa SHALL reaparecer en el nodo en futuros recorridos de esa
etapa.

#### Scenario: Recorrido pausado con nota del owner
- **WHEN** la etapa `auth` termina ok en modo por etapas y el owner dicta su observación
- **THEN** la corrida registra `etapas[auth].estado = "ok"`, su duración real y la nota, y
  el concierge espera confirmación antes de correr la etapa siguiente

#### Scenario: Nota visible en el próximo recorrido
- **WHEN** un recorrido posterior consulta el nodo `auth`
- **THEN** el nodo muestra la nota registrada en el recorrido anterior junto a la chispa

### Requirement: Roadmap visual en el dashboard
El dashboard `/admin/qa-dashboard` SHALL exponer un modo "🦉 Roadmap" que pinte el recorrido
como un path vertical zigzag de nodos con estados `ok` (✅, duración real vs estimada),
`en_curso` (🦉), `pendiente` (⏳) y `fallida` (❌, con causa), chispa y nota por nodo. El
modo SHALL actualizar el progreso por polling (~2s) mientras hay un run en curso y SHALL
mostrar el último recorrido terminado cuando no hay run activo. El dashboard conserva su
gate dev-only existente.

#### Scenario: Nodo avanza al terminar etapa
- **WHEN** la etapa `smoke` pasa de `pendiente` a `ok` durante un run
- **THEN** el polling del dashboard refleja el nodo ✅ con su duración real y el búho salta
  al nodo siguiente

#### Scenario: Roadmap sin run activo
- **WHEN** no hay run en curso ni `qa-roadmap-live.json` fresco
- **THEN** el modo Roadmap muestra el último recorrido con etapas del historial, o el plan
  sugerido si nunca hubo uno

### Requirement: Progreso en vivo test a test (F2)
La configuración de Playwright SHALL incluir un reporter (`roadmap-reporter`) que mapee
cada spec a su etapa del plan y escriba el progreso (etapa en curso, tests passed/total,
duración acumulada) en `qa-roadmap-live.json` a medida que los tests corren, de modo que
en modo `seguido` el búho avance test a test mientras el owner ve el navegador. La
escritura SHALL ser tolerante a fallo (si el FS falla, el reporter no rompe la corrida) y
el archivo SHALL ser transitorio (gitignore).

#### Scenario: Búho avanza durante run seguido
- **WHEN** en modo `seguido` el spec `crud/reservas.spec.ts` termina dentro de la etapa
  CRUD-operaciones
- **THEN** `qa-roadmap-live.json` refleja la etapa `en_curso` con passed/total actualizado
  y el dashboard lo muestra en el siguiente polling sin intervención manual

#### Scenario: Reporter no rompe la corrida
- **WHEN** la escritura de `qa-roadmap-live.json` falla (permisos/FS)
- **THEN** la corrida Playwright continúa normalmente y el resultado final no se altera

### Requirement: Baselines por etapa recalibrables
El sistema SHALL mantener minutos base por etapa persistidos en `qa-estado.json`
(`baselinesEtapa`) con merge sobre los defaults de código (`ROADMAP_ETAPAS`): cada corrida
real de una etapa (máquina sana, factor ≤1.2) recalibra su baseline con la duración real,
y los estimados de futuros recorridos usan el valor persistido. Los runs históricos sin
`etapas` SHALL seguir siendo válidos (campos opcionales).

#### Scenario: Baseline recalibrado con corrida real
- **WHEN** la etapa `smoke` corre en 2.0 minutos con factor 1.0 y su baseline era 2.5
- **THEN** `baselinesEtapa[smoke].minutosBase` queda en 2.0 con fuente "medido
  <fecha>" y el próximo plan lo usa

#### Scenario: Compatibilidad con runs viejos
- **WHEN** el historial contiene runs previos sin campo `etapas`
- **THEN** se listan normal en el dashboard y ninguna consulta falla
