# Tasks: ui-legacy-store-fase1 — store legacy en la UI, fase 1

Serie `openspec/SERIE-DEUDA-6/00-plan.md`. Rama `noche/deuda-6`. **Sin push, sin merge, sin PR,
sin `openspec archive`** (el archive exige CI verde observado y esta serie no pushea).

## V1 — `comunidad/certificados` → `useLiquidaciones` + `useCobrosFI`

- [x] **Change openspec** `ui-legacy-store-fase1` con `skip_specs: true` justificado (paridad de
  comportamiento; ninguna capacidad viva declara el origen de datos de la UI).
- [x] **Verificación de shapes antes de reemplazar** (campos usados por la página ↔ tipos de los
  hooks — ver §"Evidencia de shapes").
- [x] Reemplazo de las 2 lecturas legacy (4 usos) por `useLiquidaciones().liquidaciones` y
  `useCobrosFI().items`; eliminado el comentario "Lecturas legacy restantes" y el import de
  `useCompassStore` (queda solo `esMiembroDirectivaVigente`, helper puro de permisos).
- [x] Gate de carga: `!hasHydrated` → `cLiquidaciones || cCobrosFI` (`isLoading` de los hooks);
  `useStoreRehydrated()` eliminado de la página (ya no hay ninguna lectura del store que rehidratar).
- [x] Test de fijación `test/componentes/certificados-fuente-hooks.test.tsx` (4 casos): estado de
  carga, liquidaciones confirmadas del hook (con señuelo en el store), gate Al Día con los cobros
  del hook (con señuelo en el store) y registro emitido construido con la liquidación del hook.
- [x] **Gate V1** (corrido en la ventana, workdir `k0mp4ss_fe/apps/web`): `npx tsc --noEmit` →
  exit 0 (0 errores) · `npm run lint` → exit 0 (**0 problems**) · `npm test` → **132 archivos /
  1331 tests passed**, cobertura global **94.31 / 85.82 / 93.61** (idéntica al fingerprint de base)
  · `openspec validate ui-legacy-store-fase1 --strict` → *is valid* ·
  `node openspec/scripts/check-delta-coverage.mjs ui-legacy-store-fase1` → *0 que romperían el
  archive*. e2e no se corre en esta máquina (2 cores; flakes documentados).

## V2 — `visor-mensajes`: `caducarAvisosCV` fuera del store

- [ ] Reemplazar la acción legacy del `setInterval` por caducidad vía API reutilizando el contrato
  existente (`PUT /api/cv/avisos/[id]`); sin endpoint nuevo, sin cambio de comportamiento visible.
- [ ] Test de fijación del ciclo (el actual `test/componentes/visor-mensajes-caducidad.test.tsx`
  migra su espía del store al hook/endpoint).

## V3 — `finanzas/multas`: cablear `use-in.ts` y migrar la página

- [ ] Aplicar/desestimar/apelar en `lib/api/use-in.ts` contra las rutas ya existentes.
- [ ] Migrar la página (7 usos) y test de fijación.

## V4 — `inventario/proyectos`: cablear `use-mt.ts` y migrar la página

- [ ] Verificar garantías + actualizar pago de trabajo contra las rutas ya existentes.
- [ ] Migrar la página (3 usos) y test de fijación.

## V5 — Cierre de la serie

- [ ] Gates completos (tsc/lint/test) + `openspec validate --all` + `check-delta-coverage`.
- [ ] `BACKLOG-100.md`: mapa de migración actualizado con lo hecho y la deuda fase 2 declarada.
- [ ] Avance NSGC (skill `nsgc-prepush`) + informe final de la serie.

## Evidencia de shapes (V1)

Campos que la página usa de cada colección, contra el tipo del hook y el schema Zod:

| Dato de la página | Store legacy | Hook (`path:line`) | Tipo (`lib/schemas.ts:line`) |
| --- | --- | --- | --- |
| `estado === "confirmada"` (filtro) | `liquidacionesPL` | `useLiquidaciones().liquidaciones` — `lib/api/use-liquidaciones.ts:22,31` | `LiquidacionPLSchema.estado` — `lib/schemas.ts:2016` |
| `id`, `folio`, `trabajadorPersonaId`, `periodo` | `liquidacionesPL` | idem | `lib/schemas.ts:1963-1969` |
| `totalImponible`, `totalHaberes`, `totalDescuentos`, `liquidoAPagar` | `liquidacionesPL` | idem | `lib/schemas.ts:1986,1993,2010,2015` |
| `unidadId` (filtro de saldo) | `cobrosFI` | `useCobrosFI().items` — `lib/api/use-cobros-fi.ts:7` | `CobroFISchema.unidadId` — `lib/schemas.ts:1247` |
| `montoBase`, `moras`, `pagos` (vía `exigibleTotal`/`saldoPendiente`) | `cobrosFI` | idem | `lib/schemas.ts:1258,1263,1264`; helpers en `lib/finanzas-utils.ts:31,35` |

Resultado: **0 campos faltantes** → sin `BLOQUEADO` por shapes.

Límite conocido y preexistente del hook: `useCrudCollection` pide `pageSize=100`
(`lib/api/use-crud-collection.ts:98`), igual que las 3 pantallas ya migradas (`finanzas/pagos`,
`finanzas/gastos-comunes`, `admin/reporteria`). No se cambia en esta fase (contrato del hook
congelado); queda declarado para la fase 2.
