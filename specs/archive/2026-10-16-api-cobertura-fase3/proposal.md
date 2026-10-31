# Proposal: api-cobertura-fase3 — terceras 3 carpetas API más bajas + ratchet

## Contexto

El change archivado `2026-10-16-api-cobertura-fases` subió `app/api/**` por fases
(camino feliz, validación 400 y guardias 401/403/404 contra los handlers exportados,
Prisma real sin mocks) y dejó el piso en 82/67/85/82, medido 83.69/68.70/86.99/83.69 al
cierre de noche-3. Su `tasks.md` declaró que no hacía falta una fase 3; la serie
`SERIE-DEUDA-1` abrió igual las fases 3 y 4 para pagar la cola de carpetas API por
debajo del promedio.

Medición real de arranque de esta fase (2026-10-16, rama `serie/deuda-1`, suite
**1082/1082** verdes, 108 archivos, reporte `coverage/`):

- `app/api/**` = **83.69 / 68.70 / 86.99 / 83.69** (1.260 statements sin cubrir de 7.726).
- Ranking de las carpetas más bajas (statements): `qa-roadmap` **62.5%**,
  `emisiones-gc` **66.89%**, `vinculos` **69.2%**, `fondos-fi` 71.16%, `personas` 72.82%,
  `cobros-fi` 74.43%, `backup` 75%, `controles-propiedad` 75.4%.

Las 3 candidatas declaradas al cierre de noche-3 coinciden con la medición vigente.

## Objetivo

Subir la cobertura **real** de las 3 carpetas API más bajas de la medición vigente con
tests contra la interfaz pública de los handlers exportados, sin mocks de Prisma y sin
editar handlers para hacerlos testeables, y re-baselinear el piso `app/api/**` con la
regla del ratchet (piso = medido − 1 pt, nunca baja).

## Alcance

1. Tests reales por carpeta (`test/api/`):
   - `app/api/qa-roadmap` (guard 404 en producción, 401 sin sesión, 400 por alcance no
     reconocido, 200 con alcance explícito y por defecto).
   - `app/api/emisiones-gc` — `route.ts` (GET factory + POST de emisión con transacción
     de cobros) y `[id]/route.ts` (GET_ONE, PUT parcial con revalidación del merge,
     DELETE con guarda 409 por cobros pagados).
   - `app/api/vinculos` — `route.ts` (ejecutarUpsertVinculo: persona inactiva/bloqueada,
     unidad inexistente, duplicado, exclusividad de titularidad/arriendo,
     anti-autosolapamiento, cierre automático de tramo anterior) y `[id]/route.ts`
     (GET, PUT con revalidación completa, DELETE con guarda de ControlPropiedad).
2. Re-baseline del piso `app/api/**` en `k0mp4ss_fe/apps/web/vitest.config.ts` (medido −
   1 pt por métrica; ningún piso baja) con la fecha de medición documentada.
3. Delta `MODIFIED` del requirement "Gate de cobertura por área" en `DEV-qa-lab` con
   todos los escenarios vivos más el de esta fase.
4. Avance NSGC con cobertura por carpeta antes/después, tests agregados y piso nuevo.

## Fuera de alcance

- Edición de handlers, exclusiones de `coverage.include` o `thresholds.autoUpdate`
  (ocultan deuda en vez de pagarla).
- Pisos global y `lib/**` (los re-baselinea P5 de la serie).
- Gate e2e: tests y `coverage.thresholds`, sin cambio de comportamiento observable.

## Criterios de aceptación

- `npx tsc --noEmit` → 0 errores (corrido **después** de agregar los tests);
  `npm run lint` → 0; `npm test` → verde **con los pisos nuevos aplicados**;
  `openspec validate --all` → sin fallos; `check-delta-coverage api-cobertura-fase3`
  → `0 que romperían el archive`.
- `app/api/**` sube y el piso se re-baselinea a medido − 1 pt (nunca por debajo de
  82/67/85/82).
- `STORE_VERSION = 28` intacto; el worktree queda limpio tras la corrida.
