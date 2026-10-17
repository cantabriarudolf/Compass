# Proposal: api-cobertura-fase4 — cuartas 3 carpetas API más bajas + ratchet

## Contexto

La fase 3 (`api-cobertura-fase3`, P3 de `SERIE-DEUDA-1`) subió `app/api/**` de
83.69/68.70/86.99/83.69 a **85.75/71.50/88.48/85.75** y dejó el piso en
84/70/87/84, cubriendo las 3 carpetas más bajas medidas entonces (`qa-roadmap`,
`emisiones-gc`, `vinculos`). El `tasks.md` de fase 3 no cierra la cola: quedan
carpetas API por debajo del promedio de la superficie.

Medición real de arranque de esta fase (2026-10-16, rama `serie/deuda-1`, suite
**1131/1131** verdes, 111 archivos, reporte `coverage/`):

- `app/api/**` = **85.75 / 71.50 / 88.48 / 85.75** (1.101 statements sin cubrir de 7.726).
- Ranking de las carpetas más bajas (statements): `fondos-fi` **71.16%**,
  `personas` **72.82%**, `cobros-fi` **74.43%**, `backup` 75%, `controles-propiedad`
  75.4%, `periodos-directiva` 77.48%, `auth` 77.64%.

Las 3 más bajas de la medición vigente son `fondos-fi`, `personas` y `cobros-fi`
(todas por debajo del 85%: se cubren 3, sin inventar trabajo).

## Objetivo

Subir la cobertura **real** de las 3 carpetas API más bajas de la medición vigente
con tests contra la interfaz pública de los handlers exportados, sin mocks de
Prisma y sin editar handlers para hacerlos testeables, y re-baselinear el piso
`app/api/**` con la regla del ratchet (piso = medido − 1 pt, nunca baja).

## Alcance

1. Tests reales por carpeta (`test/api/`):
   - `app/api/fondos-fi` — `route.ts` (GET factory + POST upsert con unicidad de
     nombre por comunidad y 404/403 por scope/rol), `[id]/route.ts` (GET_ONE,
     PUT parcial con unicidad de nombre, DELETE con el guard de movimientos
     imputados) y `[id]/retirar/route.ts` (POST de retiro: fondo inactivo, monto,
     descripción, acta publicada, saldo suficiente y camino feliz con evento FI).
   - `app/api/personas` — `route.ts` (POST/PUT con las validaciones D1
     media-por-referencia, GD de gobernanza y herencia del período vigente, PE de
     FKs laborales contra los maestros MA, MP de condiciones especiales, RUT/email
     únicos y 404 por scope) y `[id]/route.ts` (GET_ONE/PUT/DELETE con ABAC
     residente y guard 409 de vínculos).
   - `app/api/cobros-fi` — `route.ts` (GET paginado con filtros y ABAC residente,
     POST factory), `[id]/route.ts` (GET_ONE con ABAC de unidades propias, PUT,
     DELETE con guard 409 de pagos), `[id]/pagar/route.ts` (POST de pago con
     ajuste justificado) y `[id]/mora/route.ts` (POST de mora idempotente diaria).
2. Re-baseline del piso `app/api/**` en `k0mp4ss_fe/apps/web/vitest.config.ts`
   (medido − 1 pt por métrica; ningún piso baja) con la fecha de medición
   documentada.
3. Delta `MODIFIED` del requirement "Gate de cobertura por área" en `DEV-qa-lab`
   con la unión de todos los escenarios vivos (incluido el de la fase 3, aún no
   archivada, porque el último archive gana) más el de esta fase.
4. Avance NSGC con cobertura por carpeta antes/después, tests agregados y piso
   nuevo.

## Fuera de alcance

- Edición de handlers, exclusiones de `coverage.include` o `thresholds.autoUpdate`
  (ocultan deuda en vez de pagarla).
- Pisos global y `lib/**` (los re-baselinea P5 de la serie).
- Gate e2e: tests y `coverage.thresholds`, sin cambio de comportamiento observable.

## Criterios de aceptación

- `npx tsc --noEmit` → 0 errores (corrido **después** de agregar los tests);
  `npm run lint` → 0; `npm test` → verde **con los pisos nuevos aplicados**;
  `openspec validate --all` → sin fallos; `check-delta-coverage api-cobertura-fase4`
  → `0 que romperían el archive`.
- `app/api/**` sube y el piso se re-baselinea a medido − 1 pt (nunca por debajo de
  84/70/87/84).
