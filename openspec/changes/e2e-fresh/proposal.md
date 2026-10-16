# Proposal: e2e-fresh

## Contexto

La lane e2e con paridad CI del proyecto (Playwright contra `next start` sobre una base
descartable) se replicó **a mano** al menos 4 veces durante SERIE-NOCHE-3, con riesgo real de
error humano en cada corrida:

```bash
export DATABASE_URL="file:./perf-<ventana>.db"
npx prisma migrate deploy --schema=prisma/schema.sqlite.prisma
npm run e2e:reseed-base            # seed:authz + seed:mocks --comunidad-id=comunidad-a
npm run build
CI=1 npx playwright test <specs>
```

`npm run e2e:fresh` estaba prometido desde P3 de `SERIE-NOCHE-2` y **nunca se creó**: quedó como
deuda declarada al cierre de NOCHE-3 (P9 lo menciona explícitamente en § Deuda post-serie, junto
con el timeout de `poblado-idempotente`). La receta manual tiene dos trampas ya sufridas:

1. `CI=1` deja `reuseExistingServer: false` en `playwright.config.ts` → si queda un `next-server`
   huérfano escuchando en `:3000` (incidente de P4 de NOCHE-3) la lane muere antes de empezar.
2. Es fácil olvidar exportar `DATABASE_URL` y terminar corriendo la lane contra `prisma/dev.db`
   (lo que las reglas duras de la serie prohíben).

Además, el caso "cancelar" de `e2e/crud/poblado-idempotente.spec.ts` esperaba la purga con
**30 s** cuando la purga completa mide **38,7 s** (y hasta >120 s en el runner de CI): rojo
intermitente por un timeout de test, no por un defecto de la app. El caso hermano
("poblado idempotente") ya usa 120 s para la misma espera.

## Objetivo

1. Materializar la receta del `00-plan.md` como script reproducible `npm run e2e:fresh`, con base
   descartable por defecto (`prisma/perf-e2e.db`), guarda dura contra `prisma/dev.db`,
   saneo del puerto 3000 y banner con el comando Playwright exacto de paridad CI.
2. Alinear la espera de la purga del caso "cancelar" a los 120 s del caso hermano.

## Alcance

1. `k0mp4ss_fe/apps/web/scripts/e2e-fresh.mjs` (Node ESM, sin dependencias nuevas).
2. `"e2e:fresh": "node scripts/e2e-fresh.mjs"` en `k0mp4ss_fe/apps/web/package.json`.
3. `e2e/crud/poblado-idempotente.spec.ts`: espera de la purga del caso "cancelar" 30 s → 120 s.
4. Verificación real: `npm run e2e:fresh` con 2 specs dirigidos
   (`e2e/crud/poblado-idempotente.spec.ts` y `e2e/smoke`) sobre base descartable.
5. Avance NSGC de la ventana.

## No-alcance

- Cambiar la config de Playwright (proyectos, `retries`, `workers`, reporters) o el lane de CI.
- Cambiar la app, el store (`STORE_VERSION = 28` congelado), la cobertura o los pisos de Vitest.
- Añadir dependencias, endpoints de purga bulk en el QA-Lab (sigue como deuda) o tocar
  `prisma/dev.db` / `Data/NSGC/backups/`.
- Cambios de comportamiento de producto: es tooling + una espera de test.
