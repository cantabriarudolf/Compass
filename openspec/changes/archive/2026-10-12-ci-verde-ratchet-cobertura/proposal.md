# Proposal: ci-verde-ratchet-cobertura

## Contexto

El CI de `main` está rojo desde hace un mes y **no hay un solo test roto**: los dos jobs de
Vitest corren la suite completa verde en local y en CI y recién al final fallan por el umbral
de cobertura. El owner reportó el síntoma como "los tests de auth/proxy fallan por WebCrypto
ausente en CI"; la reproducción local (misma máquina, mismo Node 24, misma suite) da
**exactamente el mismo resultado que CI**, así que no hay diferencia de entorno: los
`[auth][error] TypeError: crypto.getRandomValues is not a function` son stderr esperado de
`test/proxy.nonce.test.ts`, que parchea `globalThis.crypto` a propósito para probar los
fallbacks de `generarNonce()`.

## Causa raíz (evidencia medida)

| Fecha | Evento | Unit job | Cobertura global |
|---|---|---|---|
| 2026-09-08 | último CI verde completo (`a54e70ca`) | ✅ | — |
| 2026-09-09 | `5948e0e` extiende `coverage.include` a 7 archivos `lib/*` + `app/api/**/route.ts` | ✅ (verde al día siguiente) | — |
| 2026-09-12 | `82c731ed` — el job pasa raspando | ✅ | 90.63 / 78.68 / 94.04 / 90.63 |
| 2026-10-12 | `f63af9d` (HEAD tras el push del owner) | ❌ | **80.93 / 72.87 / 87.69 / 80.93** |

El umbral (`statements 90 / branches 75 / functions 85 / lines 90`) se fijó en Fase A midiendo
**solo `lib/store.ts`** (96.57/83.26/89.65/96.57). Al extender el include a 126 route handlers
parcialmente ejercitados y crecer `store.ts` (~8.800 líneas, 1.202 statements sin cubrir), ese
número global dejó de ser alcanzable sin un esfuerzo de tests de varios días. El resultado
observable: CI rojo permanente que enmascara fallas reales (los jobs `e2e` y `deploy` hace un
mes que ni corren porque dependen de `unit`).

Además, dos ruidos de infraestructura contaminan la señal:

1. `deploy` falla porque `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` están vacíos:
   el CLI recibe `--token=` y muere con `You defined "--token", but it's missing a value`.
2. Las actions estaban en `@v4` (runtime Node 20 deprecado) y sin pin por SHA.

## Objetivo

Que el workflow de CI refleje **salud real del código**: verde cuando la suite y la cobertura
están en su piso, rojo cuando alguien rompe un test o degrada la cobertura. Cero jobs rojos
por infraestructura ausente.

## Alcance

Dentro:

1. **Ratchet por área** en `k0mp4ss_fe/apps/web/vitest.config.ts`: piso global + piso `lib/**` +
   piso `app/api/**`, cada uno en `medido − 1 pt`, documentado con la fecha de medición.
2. **Smoke de guardias** (`test/api/route-guard-smoke.test.ts`) para las 19 rutas que estaban a
   0% de cobertura: sin sesión → 401 antes de Prisma; `csp-report` (público) → 204; guards de
   `qa-estado` / `qa-roadmap` → 404 con `NEXT_PUBLIC_APP_ENV=production`, 401 con `development`.
3. **Deploy condicional a secrets** en `.github/workflows/ci.yml`: si faltan, el job se saltea
   con `::warning` visible; cuando el owner los cargue, corre solo.
4. **Infra al día**: actions `checkout@v7.0.1`, `setup-node@v7.1.0`, `upload-artifact@v7.0.2`
   pinneadas por SHA + `persist-credentials: false`; `vercel@59.16.0` fijo (no `latest`);
   `permissions: contents: read`; `.nvmrc` = `24`; `engines.node` = `>=24`.

Fuera:

- Subir la cobertura real de `lib/store.ts` y de los ~126 handlers (deuda documentada en
  `design.md § Deuda` y en `tasks.md`, para una ventana propia).
- Diagnóstico de `e2e-rate-limit` (spec aislada que bloquea la IP 15 min).
- Cargar los secrets de Vercel (acción del owner).

## Criterios de aceptación

- `cd k0mp4ss_fe/apps/web && npm test` → **967/967 verdes**, cero líneas `ERROR: Coverage`, exit 0.
- `npx tsc --noEmit` → 0 errores con los thresholds nuevos tipados.
- Workflow YAML válido; jobs `unit`, `unit-pg`, `e2e`, `e2e-rate-limit` y `deploy` sin rojos por
  infraestructura.
- Toda la deuda restante queda escrita y localizable para una ventana nueva.
