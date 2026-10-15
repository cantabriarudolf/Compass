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
- [x] 3.1 Crear `lib/store/slices/ad-slice.ts` (incluye actasGD)
- [x] 3.2 Nota: `publicarActaEnCV` muta `avisosCV` — permitido en Fase 2
- [x] 3.3 Verificar tests + tsc + e2e

## Slices PI/D3, CO, GE, CV (resto de Fase 2)
- [x] 4.1 PI: `lib/store/slices/pi-slice.ts`
- [x] 4.2 CO: `lib/store/slices/co-slice.ts`
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

## Notas de ejecución de P3 (2026-10-14)

- **Alcance real post-P1**: el proposal contaba 5 acciones para AD y 6 para PI/D3, pero P1 podó
  `savePublicacionPortal`, `saveLeadPortal` y `marcarNotificacionLeida`, así que PI/D3 movió
  **3 acciones** (`removePublicacionPortal`, `syncPublicacionesDesdeVinculos`, `notify`). AD movió
  **6**: las 5 del bloque AD/GD (`saveControlPropiedad`, `removeControlPropiedad`, `saveActaGD`,
  `removeActaGD`, `aprobarActaGD`) más `publicarActaEnCV` (task 3.2), que en `lib/store.ts` vivía
  dentro del bloque CV.
- **`publicarActaEnCV` (cross-write)**: el slice AD la implementa con `get()`/`set()` igual que
  antes y muta `avisosCV` (dominio CV, todavía en el monolito -> P5). Lleva un comentario en el
  slice que declara el cross-write para que P5 lo respete al extraer CV.
- **Helpers GD movidos**: `periodoDirectivaVigente` y `esMiembroDirectivaVigente` se movieron de
  `lib/store.ts` a `lib/store/helpers.ts` por la misma razón que `registrarEvento` en P2 (el slice
  AD los necesita y un import runtime slice→store crearía un ciclo). `lib/store.ts` los re-exporta,
  así que la puerta pública `@/lib/store` no cambia para los consumidores
  (`app/comunidad/directiva`, `app/comunidad/certificados`).
- **Estado persistido intacto**: `CompassData`, `seedData()` y el esquema zod del `persist`
  conservan los campos movidos (igual que IR/MT en P2): el split cambia **dónde se declaran e
  inicializan** las acciones, no el shape persistido. `STORE_VERSION` sigue **28**.
- **Limpieza de arrastre**: se removieron de `lib/store.ts` dos imports que quedaron sin uso al
  mover los bloques (`OperacionPortal`, `MAX_EVENTOS`).

## Notas de ejecución de P4 (2026-10-15)

- **Alcance real post-P1**: el proposal contaba 8 acciones para CO; el bloque real del monolito
  tenía **10** (`savePlantillaCO`, `removePlantillaCO`, `saveEnvioCO`, `registrarLecturaEnvioCO`,
  `saveMensajeBuzonCO`, `responderMensajeBuzonCO`, `cambiarEstadoBuzonCO`, `removeMensajeBuzonCO`,
  `saveDocumentoCO`, `removeDocumentoCO`) y las 10 se movieron. El slice pesa **397 líneas** (no
  ~700: el proposal estimaba sobre el código pre-poda de P1).
- **Helpers CO sin duplicar**: `resolverVariablesCO` y `rolDestinatarioCO` ya vivían en
  `lib/store/helpers.ts` (Fase 1) → el slice los importa desde `../helpers`; ninguna acción de CO
  necesita estado de otros dominios que mover: `personas`, `unidades`, `vinculos`, `notify` y
  `configuracion` se leen por `get()` como antes.
- **Seed de plantillas**: `plantillasCO` se inicializa en el slice con el mismo módulo seed que
  `seedData()` (`@/data/comunidad/plantillas-co`) — idéntico comportamiento al monolito.
- **Cross-write**: CO no muta estado de otros dominios (sólo lee vía `get()`); los otros dominios
  que usan helpers CO (`IR`, `IN`) siguen en `lib/store.ts` sin cambios.
- **Verificación**: **10/10 cuerpos de acción byte-idénticos a HEAD** (script sobre la API de TS,
  `prop.getStart()..prop.end`) y 0 acciones CO implementadas en `lib/store.ts` (sólo quedan sus
  declaraciones en `CompassStore`, igual que IR/MT/AD/PI). `lib/store.ts` 6.130 → **5.795**
  (−335). e2e con paridad CI **8/8** (`auth.setup` 6/6 + `comunicacion` + `visor`) sobre
  `prisma/perf-p4.db`; `comunicacion` falló el intento 1 por `Test timeout of 30000ms` en el
  primer render de ruta fría y quedó verde en el retry (retries=2 en CI, aceptado).
