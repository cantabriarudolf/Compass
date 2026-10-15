# Tasks: store-cleanup

## 1. Censo y change

- [x] 1.1 Leer `openspec/CONVENCION-DELTAS.md` y escribir el change (proposal + design + delta MODIFIED).
- [x] 1.2 Censo fino por miembro con script AST: zonas intra-store / app (catch-all) / qa-lab / test / e2e, excluyendo `prisma/**`, `lib/schemas.ts` y `*.md`. Resultado: 180 miembros = 79 app · 71 qa-lab · 26 solo-test · 2 muerto · 2 intra-store.
- [x] 1.3 `node openspec/scripts/check-delta-coverage.mjs store-cleanup` → `0 que romperían el archive` (3 MODIFIED ok) y `openspec validate --all` → 41 passed / 0 failed.

## 2. Poda de `lib/store.ts`

- [x] 2.1 Borrar la línea de interface + el bloque de implementación + el JSDoc `@deprecated` de los 2 muertos (`toggleActivoTipoUnidad`, `removeEgresoFI`).
- [x] 2.2 Borrar lo mismo de los 26 `solo-test` sin uso intra-store (lista en `design.md`). `lib/store.ts`: 8.890 → 7.621 líneas (−1.269).
- [x] 2.3 `npx tsc --noEmit` → 0 errores (los únicos errores son de `.next/types/validator.ts`, artefacto de build stale preexistente).

## 3. Poda de tests

- [x] 3.1 Eliminar los casos de test cuyo sujeto era una acción podada (473 líneas en 16 archivos) y adaptar con siembra directa de estado los casos cuyo sujeto es vivo (10 archivos).
- [x] 3.2 `npm test` verde: **936 tests**, cobertura global 84/73.12/88.39/84 sobre los pisos 82/72/87/82.

## 4. Guardas

- [x] 4.1 `STORE_VERSION = 28`; `CompassData` y `partialize` verificados **idénticos** por `diff` contra `HEAD`; ninguna línea con contenido agregada en `store.ts` (solo borrados).
- [x] 4.2 Ningún miembro borrado aparece en el QA-Lab, en `app/**` ni en `prisma/**`; `eslint` 0 errores.
- [x] 4.3 e2e dirigida con base descartable fresca (`prisma/perf-e2e.db`, `migrate deploy` + `e2e:reseed-base`): `auth.setup` 6/6 y el test principal de `e2e/crud/poblado-idempotente.spec.ts` **verde**. El caso "cancelar" (`:96`) queda rojo por su espera de 30 s frente a una purga medida de 38,7 s — flujo API/Prisma que no depende del store; registrado como deuda accionable en el BACKLOG.

## 5. Cierre

- [x] 5.1 Avance NSGC con miembros y líneas antes/después + lista de lo borrado con su clasificación (`Data/NSGC/docs/avances/avance - 2026-10-14 20-00.md`).
- [x] 5.2 Actualizar `openspec/BACKLOG-100.md`: deuda `store-cleanup` saldada + deriva de prosa (11 specs + 4 manuales NSGC), gap `CF_UPDATE_PARAM` y fragilidad del e2e `:96`.
- [x] 5.3 Commit convencional + push con `nsgc-prepush` (avance creado, sin cambios en `data/**` → sin normativa de mocks; Trazabilidad sin cambios de estado); fila P1 y Bitácora actualizadas en `openspec/SERIE-NOCHE-3/00-plan.md`.
