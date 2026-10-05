# Proposal: e2e-fin-gated (SERIE-E2E-SIN-GATED P2, cierre técnico)

## Problema
El tag `(GATED)` en los describes de 4 specs y los scripts
`e2e:nongated` / `e2e:gated` / `e2e:full-orden` ordenaban la corrida en dos
fases, pero el tag ya está vacío de significado: desde P1 (helper
`e2e/helpers/datos-test`) cada test arma y limpia su propio dato TEST vía API
y es independiente del orden. Además el job `e2e` de CI sembraba SOLO
`seed:authz` (sin `seed:mocks`), mientras los specs leen unidades, fondos y
maestros del seed — la corrida única exige seed completo para ser verde.

## Propuesta
- Quitar `(GATED)` de los describes de `pagos|certificados|portal|
  remuneraciones` (poblamiento nunca tuvo tag).
- Eliminar `e2e:nongated`, `e2e:gated` y `e2e:full-orden` de `package.json`
  (sin consumidores vivos: CI usa `npx playwright test` directo; las menciones
  en `openspec/` son registros históricos congelados). `test:e2e` queda como
  alias canónico de la corrida única.
- Job `e2e` de CI (sin tocar `e2e-rate-limit` ni `deploy`): seed completo vía
  `npm run e2e:reseed-base` (authz + mocks, `vite-node` llega transitivo vía
  vitest como en local) y timeout 25→60 min. Corrida única `npx playwright
  test`, sin fases.
- Verificación local: reseed limpio + `npx playwright test` único de punta a
  punta. Sin reintroducir el tag ante interferencias (patrón P1).
El change queda abierto (lo archiva el cierre de la serie con checklist).

## Alcance
- `e2e/crud/pagos|certificados|portal|remuneraciones.spec.ts` (solo describes)
- `k0mp4ss_fe/apps/web/package.json` (scripts)
- `.github/workflows/ci.yml` (job `e2e`)
- `e2e/flujo/personas.spec.ts` + `e2e/crud/admin-maestros.spec.ts`
  (independizados con setup+cleanup propio, patrón P1 — ver Desviaciones)
- Sin deltas en specs de módulo (sin cambio de comportamiento; P1 ya cubrió
  el setup vía helper)

## Desviaciones (interferencia real hallada en la corrida única, sin tag)
La primera corrida única paralela dio 91+2 con 2 rojos que pasaban solos;
la secuencial dio 91+2 con otros 2 rojos. Lejos de ser flakes, ambos pares
tenían mecanismo de orden (verificado en código + BD):
- `personas.spec`: nombre fijo "Ana Bodeguera" → la app pide confirm D5 por
  nombre duplicado y Playwright auto-descarta el confirm ("Guardado
  cancelado"). El residuo quedaba con id de servidor (sobrevive a reseed e
  higiene) y envenenaba las corridas siguientes. Fix: nombre único por
  corrida + fallback de resolución de id por email.
- `admin-maestros.spec`: re-submit ciego a los 400ms duplicaba la fila si el
  servidor tardaba en cerrar el dialog (violación strict-mode) + spec sin
  cleanup (filas QA-EdO-* acumuladas). Fix: un solo envío + espera real al
  cierre + cleanup vía API por título exacto (idempotente).
Tras ambos fixes, corrida única secuencial (paridad CI, `workers: 1`):
93 passed + 2 skipped, 0 failed.
