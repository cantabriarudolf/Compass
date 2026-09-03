# Tasks — qa-roadmap-visual

## Fase 1 — Esqueleto narrativo (etapas + pausas + notas + roadmap UI)

- [x] 1.1 `lib/qa-estado.ts`: interfaces `QaEtapa` (+`QaFallo` reutilizado), `ROADMAP_ETAPAS` (setup, smoke, auth, flujo, crud-maestros, crud-inventario, crud-operaciones, crud-comunidad, crud-finanzas-gated, crud-complejos-gated, crud-lectura — con chispa curada, specGlobs por lane SERIE-CRUD-E2E, minutosBaseDefault), `planRoadmap(alcance, factor, baselines)` con total, merge `baselinesEtapa` sobre defaults, `QaRun.etapas?` opcional + `baselinesEtapa?` en `QaEstadoData` (retrocompatible)
- [x] 1.2 `app/api/qa-roadmap/route.ts`: GET con gate dev-only — retorna plan por alcance (query `?alcance=`), estado live (`qa-roadmap-live.json` si mtime <5min) y por nodo: chispa + línea histórica (último fallo de esa etapa en el historial) + nota previa
- [x] 1.3 `POST /api/qa-estado` (mismo route, gate dev-only): acciones `nota` (`{runId, etapaId, texto}` persiste en el run del historial) y `recalibrar` (`{etapaId, minutosReales}` actualiza `baselinesEtapa` con fuente "medido <fecha>") — validación y errores 400 claros
- [x] 1.4 Dashboard `/admin/qa-dashboard`: modo "🦉 Roadmap" — toggle sobre la vista actual, path zigzag vertical (colapsa a columna en móvil) con nodos ✅/🦉/⏳/❌, chispa + línea histórica por nodo, estimado vs real, textarea de nota con botón guardar → POST nota, polling 2s solo con live fresco (fetch-on-mount si no)
- [x] 1.5 `test/qa-roadmap.test.ts`: unit de `planRoadmap` (alcance completo/parcial, escalado por factor, merge baselines), compatibilidad runs sin `etapas`, validaciones del POST (nota/recalibrar) con Prisma-free mocks de FS
- [x] 1.6 `.opencode/skills/pruebas/SKILL.md`: nueva pregunta "¿Cómo recorres?" (`seguido`/`por etapas`), §Modo por etapas (protocolo: correr etapa → reportar con interpretación y chispa → preguntar observación → POST nota/recalibrar → esperar señal), §Registro de etapas en `qa-estado.json`, mapeo alcance→etapas
- [x] 1.7 `.gitignore`: `qa-roadmap-live.json`
- [x] 1.8 Verificación F1: Vitest verde (499+nuevos), tsc 0, lint 0, dashboard manual check (npm run dev → /admin/qa-dashboard modo Roadmap con plan visible), `openspec validate` strict

## Fase 2 — El búho vivo (reporter test a test)

- [ ] 2.1 `e2e/reporters/roadmap-reporter.ts`: reporter Playwright (onBegin/onTestEnd/onEnd) que mapea spec→etapa vía `specGlobs`, escribe `qa-roadmap-live.json` (runId, modo "seguido", etapas con estado/passed/total, testActual) con try/catch en cada escritura — nunca rompe la corrida
- [ ] 2.2 `playwright.config.ts`: añadir `["./e2e/reporters/roadmap-reporter.ts"]` al array de reporters (convive con html/junit)
- [ ] 2.3 Verificación F2: e2e smoke en modo seguido con el dashboard abierto — el búho avanza test a test (polling refleja passed/total de la etapa en curso); suite completa sin regresiones
- [ ] 2.4 Cierre: suite completa verde (Vitest + e2e), avance NSGC + manual del dashboard + Trazabilidad + BACKLOG-100 nota de cierre
