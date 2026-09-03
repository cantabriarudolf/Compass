# Change: qa-roadmap-visual

## Why

Hoy un run de QA es una lista de archivos: el owner no sabe de antemano cuánto tardará el
recorrido por partes ni qué mirar en cada tramo, no puede pausar para observar y anotar, y
el resultado (pass/fail) no acumula aprendizaje humano. La petición del owner: un **modo QA
visual tipo roadmap** ("como el buhito de Duolingo") que convierta cada corrida en un
recorrido narrativo por etapas — con estimados por etapa antes de correr, pausas para
observar, notas que persisten y una "chispa de intuición" por nodo (experiencia destilada +
señal histórica de lo que suele fallar ahí).

## What Changes

- **Fase 1 — esqueleto narrativo:**
  - `lib/qa-estado.ts`: nuevo schema `QaEtapa` (id, nombre, chispa, comando, estimadoMin,
    estado `pendiente|en_curso|ok|fallida|omitida`, duracionRealMin?, nota?, fallos?) +
    `ROADMAP_ETAPAS` (definiciones de etapas del recorrido e2e completo con chispas curadas)
    + baselines por etapa **persistidas en `qa-estado.json`** (`baselinesEtapa`, recalibrables
    por corrida real, merge sobre defaults de código) + `QaRun.etapas?` en el historial.
  - API: `GET /api/qa-roadmap` (plan del recorrido + estado en vivo desde
    `qa-roadmap-live.json` si existe y es fresco) y `POST /api/qa-estado` (guardar `nota` por
    `runId`+`etapaId`, y opcionalmente recalibrar baseline con la duración real). Ambas
    dev-only (mismo gate del dashboard).
  - Dashboard `/admin/qa-dashboard`: modo **"🦉 Roadmap"** — path zigzag vertical con nodos
    ✅ ok (real vs estimado) · 🦉 en curso · ⏳ pendiente · ❌ fallida (causa), chispa por nodo,
    textarea de nota por nodo que persiste y reaparece en el próximo recorrido de esa etapa.
    Polling ~2s cuando hay run en curso.
  - Skill `pruebas`: nueva pregunta de puerta "¿Cómo recorres?" — `seguido` (un run, roadmap
    se actualiza por etapa al final) o `por etapas` (corre etapa → pausa → interpreta
    estimado vs real + chispa → pregunta observación → registra nota → sigue con señal del
    owner). Protocolo de registro: cada corrida guarda sus `etapas` y recalibra baselines.
- **Fase 2 — el búho vivo:**
  - Reporter custom de Playwright (`e2e/reporters/roadmap-reporter.ts`): mapea specs → etapa,
    escribe progreso test a test en `qa-roadmap-live.json` (runId, etapas con estado, contador
    passed/total de la etapa en curso) — en modo `seguido` el búho avanza en vivo mientras el
    owner ve el Chrome. Se cablea en `playwright.config.ts` (escritura inofensiva en CI).

No cambia ninguna prueba existente ni sus aserciones: es una capa narrativa/visual sobre la
infra QA actual (dashboard dev-only, `qa-estado.json`, skill). La suite 499 Vitest + 67 e2e
debe quedar verde.

## Capabilities

### New Capabilities

- `DEV-qa-roadmap`: recorrido narrativo de QA — plan de etapas con estimados, roadmap visual
  con chispas y notas, modo por etapas con pausas, progreso en vivo (reporter) y baselines
  recalibrables.

### Modified Capabilities

(ninguna — el dashboard y `qa-estado.json` viven como contexto en `specs/project.md`, sin
requirements formales que modificar; la skill `pruebas` es material del repo, no spec)

## Impact

- **Código:** `lib/qa-estado.ts` (schema + etapas + baselines), `app/api/qa-roadmap/route.ts`
  (nuevo), `app/api/qa-estado/route.ts` (POST notas/baselines), `app/admin/qa-dashboard/page.tsx`
  (modo Roadmap), `e2e/reporters/roadmap-reporter.ts` (nuevo, F2), `playwright.config.ts`
  (reporter, F2), `.opencode/skills/pruebas/SKILL.md` (puerta + protocolo por etapas),
  `qa-estado.json` (nuevos campos opcionales — retrocompatible con runs viejos).
- **Tests:** unit del schema/plan (`test/qa-roadmap.test.ts`: build de etapas por alcance,
  merge de baselines, guard de nota), e2e ligero opcional del dashboard (read-oriented en el
  lane crud o smoke — el roadmap sin run activo muestra el plan).
- **Riesgos:** `qa-roadmap-live.json` es archivo transitorio (gitignore); el reporter en
  `playwright.config.ts` toca config compartida por CI (mitigado: escritura local inofensiva,
  reporter silencioso si falla el FS); notas de runs viejos sin `etapas` no rompen (campos
  opcionales).
- **Dependencias:** ninguna externa. Riesgo de contexto: implementación por fases delegada a
  subagente; esta ventana orquesta y verifica contra tasks.md.
