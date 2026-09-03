# Design — qa-roadmap-visual

## Context

La infra QA ya tiene: `qa-estado.json` + `lib/qa-estado.ts` (historial 10 runs, sistema,
factorCarga, baselines a nivel lane), dashboard `/admin/qa-dashboard` (dev-only,
fetch-on-mount de `/api/qa-estado`), skill `pruebas` (puerta con estimados × factor,
preflight, registro post-corrida), y 67 specs e2e organizados en lanes (`auth/`, `smoke/`,
`flujo/`, `crud/` 30 specs agrupables por lotes como en SERIE-CRUD-E2E P1-P5). El owner
quiere recorrer el run como narrativa: plan con tiempos por etapa, pausas para observar,
notas que enseñan, y un búho que avanza.

## Goals / Non-Goals

**Goals**
- Etapas como unidades de narrativa (~8 nodos máximo para el recorrido completo) — no 30
  nodos de specs crudos: los CRUD se agrupan por lotes (maestros/config, inventario,
  operaciones, comunidad, finanzas gated, complejos gated, read-oriented+journeys).
- Tres memorias: baselines recalibrables (máquina), notas por etapa (humano), chispas
  curadas (experiencia destilada estática + señal histórica dinámica).
- Retrocompatible: runs viejos sin `etapas` siguen válidos; nuevos campos opcionales.

**Non-Goals**
- No se cambian aserciones ni specs e2e existentes; no hay nuevos tests de lógica de app.
- No corre en CI nada nuevo (el reporter escribe un archivo local inofensivo).
- No hay edición de notas para runs históricos sin etapas (solo lectura).
- No LLM en runtime: las chispas son texto curado en código + línea histórica desde el
  JSON; la interpretación post-etapa la hace el concierge (yo), no el dashboard.

## Decisions

- **D1 — Etapas como constantes curadas (`ROADMAP_ETAPAS`) en `lib/qa-estado.ts`.** Cada
  etapa: `{ id, nombre, chispa, comando, specGlobs: string[], minutosBaseDefault, orden }`.
  El plan por alcance se deriva filtrando etapas (`planRoadmap(alcance, factor, baselines)`).
  *Alternativa:* derivar etapas del filesystem — frágil y sin chispas curadas.
- **D2 — Baselines por etapa persistidos en el JSON, no en código.** `baselinesEtapa:
  Record<etapaId, { minutosBase, fuente }>` con merge sobre defaults. La recalibración es
  escritura de JSON (API POST), no edit de código. *Razón:* memoria de máquina persistente
  sin tocar código por corrida.
- **D3 — `qa-roadmap-live.json` como archivo transitorio de progreso.** Escrito por el
  reporter (F2) y por la skill entre etapas (F1): `{ runId, alcance, modo, iniciado,
  etapas: [{ id, estado, duracionRealMin?, passed?, total? }], testActual? }`. El dashboard
  lo considera "fresco" si mtime < 5 min; si no, cae al último run con `etapas` del
  historial. Gitignore. *Alternativa:* todo en qa-estado.json — mezcla historial con
  estado volátil y ensucia el historial con runs abortados.
- **D4 — API mínima:** `GET /api/qa-roadmap` (plan + live si fresco + chispa+histórico por
  nodo) y `POST /api/qa-estado` (acciones: `nota` `{runId, etapaId, texto}` y
  `recalibrar` `{etapaId, minutosReales}`), ambas con el mismo gate dev-only del dashboard
  (`getAppEnv()`). Sin auth extra: ya está gated por env.
- **D5 — Roadmap UI: CSS zigzag simple, sin lib nueva.** Path vertical con nodos
  alternando `left/right` (translateX ±40px), círculo emoji + card con chispa/nota/estimados.
  Polling 2s solo si el live está fresco; fetch-on-mount si no. Textarea por nodo con
  guardado explícito (botón) → POST nota. *Alternativa:* SVG path curvo estilo Duolingo —
  más bonito, más coste; el zigzag comunica lo mismo y es mantenible.
- **D6 — Modo por etapas vive en la skill, no en la app.** El orquestador es el concierge:
  corre `npx playwright test <glob etapa>` → actualiza live file + run record → reporta →
  pregunta → sigue. La app solo pinta. *Alternativa:* orquestador en la app (botón "correr
  etapa") — mezcla responsabilidades y requiere spawn de procesos desde Next.
- **D7 — Reporter tolerante (F2):** clase con `onBegin/onTestEnd/onEnd`, try/catch en cada
  escritura, mapping spec→etapa por `specGlobs` de `ROADMAP_ETAPAS` importado de
  `lib/qa-estado.ts` (reutiliza las definiciones; el reporter corre en Node, import directo).
  En `playwright.config.ts` se añade a `reporter` array: `["./e2e/reporters/roadmap-reporter.ts"]`.
- **D8 — Recorrido por alcance parcial:** el plan se adapta (smoke = setup+smoke; crud =
  setup+crud lotes; suite completa = todo). El run record guarda el alcance y sus etapas
  para que el roadmap del historial sea fiel a lo corrido.

## Risks / Trade-offs

- [Reporter toca `playwright.config.ts` compartido con CI] → escritura try/catch silenciosa;
  en CI el archivo se escribe y muere con el runner (no interfiere con junit/html).
- [Parallelismo: fullyParallel barre specs de varias etapas a la vez en modo seguido] → en
  modo `seguido` el mapeo por globs igual agrupa los resultados por etapa al final del run;
  el "en vivo" muestra progreso agregado por etapa (passed/total), no orden secuencial
  estricto — el búho queda en la etapa con más actividad. Documentado como comportamiento.
- [Notas con datos sensibles en el JSON] → notas son texto libre del owner, repo privado,
  dashboard dev-only; mismo criterio que las notas existentes de fallos.
- [Zigzag en móvil] → el dashboard es tooling desktop; el path colapsa a columna única bajo
  `sm:` (nodos alineados a la izquierda).
- [Baselines recalibradas por máquina distinta] → `fuente` guarda fecha+factor de la
  medición; el factor actual escala siempre sobre el base — mismo criterio que hoy.

## Migration Plan

1. F1: schema + API + dashboard + skill — deploy sin migración (JSON retrocompatible).
2. F2: reporter + config — activación pasiva (escribe archivo, nadie lo lee hasta que el
   dashboard lo polleé — ya soportado por F1).
3. Rollback: revert de commits — `qa-estado.json` conserva campos nuevos inofensivos.

## Open Questions

(ninguna — decisiones cerradas con D1-D8; el owner delegó el juicio de diseño)
