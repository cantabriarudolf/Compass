# Design: store-cobertura-fase-b (fase 1 — P8)

## D1 — Medición real primero (include extendido), no el histórico

El `coverage.include` vigente solo instrumenta `lib/store.ts`, así que el histórico de la
deuda (1.202 statements sin cubrir al 2026-10-12) **no incluye** los slices: el interior de
`lib/store/**` jamás se midió. La fase arranca extendiendo el include en
`k0mp4ss_fe/apps/web/vitest.config.ts` a `lib/store/**` (los 7 slices + `helpers.ts`) y
midiendo la suite verde completa antes de escribir un solo test.

> Tabla de medición de arranque (2026-10-16, suite verde, `coverage-final.json`):
> se completa en `tasks.md` 1.1 y en el avance NSGC con el ranking por archivo.

## D2 — Molde de tests: API pública, estado observable, ni un detalle interno

Se sigue el molde de los `test/store-*.test.ts` existentes (`store-visor`,
`store-solicitudes`, `store-directiva`, …):

- `resetStore()` en `beforeEach` (`test/helpers.ts` → `seedData()` + `hasHydrated`).
- Todo se ejerce vía `useCompassStore.getState()`: acciones (`save*`, `remove*`,
  `publicar*`, …) y selectores/estado resultante (`avisosCV`, `eventos`, etc.).
- Cada test afirma el **efecto observable**: estado resultante, `StoreResult` (`ok` y
  `error`), validaciones de esquema y eventos de auditoría cuando la acción los emite.
- Prohibido tocar funciones internas no exportadas por `lib/store.ts`, snapshots de
  implementación o conteos de línea. Cuando el estado tiene que sembrarse en una forma que
  la API ya no permite, se usa `useCompassStore.setState` (patrón ya vigente en
  `store-visor.test.ts`).
- Los archivos se priorizan por la medición: los que aportan más statements sin cubrir
  primero.

## D3 — Ratchet: piso nuevo = medido − 1 pt, nunca se baja

Regla de la serie (`00-plan.md`) y de la spec viva (`DEV-qa-lab`): con la última medición
verde, cada piso se re-baselinea a **medido − 1 punto entero** por métrica, se documenta la
fecha (y el commit de referencia) en `vitest.config.ts` y ningún piso puede quedar por
debajo de su valor anterior. Si el include extendido dejara `lib/**` por debajo del piso
vigente (86), **no se baja**: se cubre con tests y, si el objetivo no cabe en la ventana,
se reporta el número y la causa al owner (decisión suya) y queda como fase siguiente en
`tasks.md`.

## D4 — Qué NO se toca

- `lib/store.ts`, `lib/store/slices/**` y `lib/store/helpers.ts`: solo lectura. La fase
  agrega tests y config, no cambia comportamiento.
- `STORE_VERSION = 28` y el shape persistido (`CompassData`, `partialize`, migraciones):
  **congelados**. Cualquier test que los necesitara se marca bloqueado, no se improvisa.
- Los pisos `app/api/**` y global existentes solo pueden subir; `app/api/**` no se toca en
  esta fase (su re-baseline fue P7).

## Rollback

`git revert` del commit de la fase: los tests nuevos desaparecen, el include vuelve a
`lib/store.ts` y los pisos vuelven a sus valores anteriores. Sin migración de datos ni
cambio de contrato.
