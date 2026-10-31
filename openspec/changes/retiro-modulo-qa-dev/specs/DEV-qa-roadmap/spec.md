# Delta — `DEV-qa-roadmap`

## REMOVED Requirements

El roadmap narrativo de pruebas se retira completo con el módulo QA/dev (F9). Su fuente de
etapas (`ROADMAP_ETAPAS` en `lib/qa-estado.ts`) sobrevive porque el reporter de Playwright
(`e2e/reporters/roadmap-reporter.ts`) la sigue leyendo, pero ya no existe la capability que
gobierna sus pantallas y rutas (`/admin/qa-dashboard`, `/api/qa-estado`, `/api/qa-roadmap`).

### Requirement: Plan de recorrido con estimados por etapa

**Reason**: el plan con estimados se servía por `/api/qa-roadmap` y se pintaba en el dashboard
retirado.

**Migration**: ninguna. `planRoadmap` y sus estimados siguen en `lib/qa-estado.ts` para uso
interno del reporter y de sus tests.

### Requirement: Chispa de intuición por etapa

**Reason**: la «chispa» era texto de apoyo que sólo consumía la vista del roadmap, retirada con
el dashboard.

**Migration**: ninguna; el campo sigue en `ROADMAP_ETAPAS` como metadato del reporter.

### Requirement: Modo por etapas con pausas y notas

**Reason**: el modo guiado por etapas (pausas, notas, recalibración manual) vivía en la UI del
dashboard y en las acciones de `POST /api/qa-estado`, ambas retiradas.

**Migration**: las etapas se siguen corriendo con `npx playwright test` por `specGlobs`, sin
modo guiado.

### Requirement: Roadmap visual en el dashboard

**Reason**: el dashboard `/admin/qa-dashboard` ya no existe y el sidebar dejó de enlazarlo.

**Migration**: el progreso queda en el reporte de Playwright y en `qa-roadmap-live.json` que
escribe el reporter.

### Requirement: Progreso en vivo test a test (F2)

**Reason**: el requirement describe la vista en vivo del dashboard sobre `qa-roadmap-live.json`.

**Migration**: `e2e/reporters/roadmap-reporter.ts` sigue escribiendo `qa-roadmap-live.json` test
a test; lo que desaparece es su consumidor visual.

### Requirement: Baselines por etapa recalibrables

**Reason**: la recalibración de baselines se hacía desde el dashboard y se persistía por
`POST /api/qa-estado`, ambos retirados.

**Migration**: `lib/qa-estado.ts` conserva los campos de baseline y sus funciones, sin el camino
de escritura desde la UI.
