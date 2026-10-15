# Tareas — Store Split Fase 2

> P2 (2026-10-14) ejecuta los slices IR y MT. `store-cleanup` (P1) podó 3 acciones de estos
> dominios (`cambiarEstadoRecursoIR`, `cancelarTrabajoMT`, `removeProyectoMT`), así que IR mueve
> **8 acciones** (no 9) y MT **7** (no 6). La task 1.7 quedó sin objeto: el split es un movimiento
> puro y `STORE_VERSION` sigue congelado en 28 (no hay migración que hacer).

## Slice IR — Inventario y Recursos (primero, riesgo mínimo)
- [x] 1.1 Crear `lib/store/slices/ir-slice.ts` con estado + 8 acciones (649 líneas)
- [x] 1.2 Tipos: `RecursoIR`, `SolicitudInsumoIR`, `EntregaEPP` ya viven en `lib/schemas.ts` → el slice los importa, no se movieron
- [x] 1.3 Actualizar `lib/store.ts`: importar `irSlice` y combinar con spread (`...irSlice(set, get, api)`)
- [x] 1.4 Remover duplicados de IR de `lib/store.ts` (bloque `// --- IR: Inventario y Recursos ---`, 602 líneas)
- [x] 1.5 Verificar: tsc 0, tests IR verdes, suite completa verde
- [x] 1.6 e2e CRUD IR verde
- [ ] 1.7 ~~Migración v27 con backup~~ **N/A**: movimiento puro, `STORE_VERSION = 28` congelado (regla dura de la serie)

## Slice MT — Mantenimiento y Proyectos
- [x] 2.1 Crear `lib/store/slices/mt-slice.ts` (411 líneas, estado + 7 acciones)
- [x] 2.2 Combinar en `store.ts` (`...mtSlice(set, get, api)`) y remover el bloque movido (374 líneas)
- [x] 2.3 Verificar tests + tsc + e2e

## Slice AD — Gestión Administrativa
- [ ] 3.1 Crear `lib/store/slices/ad-slice.ts` (incluye actasGD)
- [ ] 3.2 Nota: `publicarActaEnCV` muta `avisosCV` — permitido en Fase 2
- [ ] 3.3 Verificar tests + tsc + e2e

## Slices PI/D3, CO, GE, CV (resto de Fase 2)
- [ ] 4.1 PI: `lib/store/slices/pi-slice.ts`
- [ ] 4.2 CO: `lib/store/slices/co-slice.ts`
- [ ] 4.3 GE: `lib/store/slices/ge-slice.ts`
- [ ] 4.4 CV: `lib/store/slices/cv-slice.ts`
- [ ] 4.5 Verificación completa: tsc, tests, e2e

## Post-Fase 2
- [ ] 5.1 Documentar en manual de arquitectura
- [ ] 5.2 Avance NSGC

## Notas de ejecución de P2 (2026-10-14)

- **Helper movido**: `registrarEvento` (+ `MAX_EVENTOS` y el tipo `SetStateFn`) se movió de
  `lib/store.ts` a `lib/store/helpers.ts`, porque los slices lo necesitan y un import runtime
  slice→store crearía un ciclo. `lib/store.ts` lo importa desde `./store/helpers`.
- **Imports de los slices**: `CompassStore`/`StoreResult` entran **type-only** desde `../../store`
  (los slices viven en `lib/store/slices/`, un nivel más abajo que el patrón del proposal);
  `../helpers` es runtime y no cicla (helpers sólo importa tipos del store).
- **Cross-writes intactos**: las acciones de otros dominios que mutan `trabajosMT`
  (`completarTareaMonitoreoPE`) o `activosIR` siguen en `lib/store.ts` y funcionan porque `set`
  sigue tipado contra `CompassStore` (la factory ahora recibe `(set, get, api)` y pasa los mismos
  args a cada slice).
