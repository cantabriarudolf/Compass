# Tasks

## 1. Capa de Datos - Store

- [x] 1.1 Instalar `zustand` en `apps/web`.
- [x] 1.2 Crear `apps/web/lib/store.ts`: estado con todos los conjuntos de entidades, seed desde `data/`, `persist` a localStorage (`compass-store`, versión, `migrate`).
- [x] 1.3 Implementar acciones CRUD por entidad (create, update, remove, toggleActivo) bajo patrón repository.
- [x] 1.4 Implementar validaciones de integridad al eliminar (tipo de unidad con unidades, macro sector con micros, micro sector con unidades, estacionamiento con historial activo, persona con vínculos).

## 2. Tracking en Dashboard (Fase 0)

- [x] 2.1 Crear `Data/NSGC/docs/especificaciones/ST - Capa de Datos Persistente.md` resumiendo el design del change.
- [x] 2.2 Crear `Data/NSGC/docs/especificaciones/UI - Interfaz Principal.md` y `UI - Navegacion Lateral.md`.
- [x] 2.3 Agregar en `apps/web/lib/dev-dashboard.ts` las entradas `ST: 'Fase 0'` y `UI: 'Fase 0'` en `PHASES`.
- [x] 2.4 Actualizar `Data/NSGC/docs/especificaciones/00-index.md` con los nuevos módulos.
- [x] 2.5 Verificar vía `/api/dev-dashboard` que ST aparece en Fase 0 `en_proceso`, UI-Interfaz Principal `completado` y UI-Navegacion Lateral `documentado`.

## 3. Piloto Inventario

- [x] 3.1 Migrar `apps/web/app/inventario/tipos/page.tsx` de `useState(initialTipos)` a lecturas/acciones del store (mantener UI e historial de tarifas idénticos).
- [x] 3.2 Migrar `apps/web/app/inventario/estructura/page.tsx` (macroSectores, microSectores, unidades) al store.
- [x] 3.3 Migrar `apps/web/app/inventario/estacionamientos/page.tsx` de `useState(initialEstacionamientos)` al store.
- [x] 3.4 Si el piloto revela faltantes (acción, entidad o regla), actualizar primero el spec del change y luego el código.

## 4. Verificación

- [x] 4.1 Verificar compartición de estado: crear tipo en TU y confirmar que EF/ES lo leen; editar unidad en EF y verla en TU/ES.
- [x] 4.2 `npx tsc --noEmit` y `npx turbo typecheck` sin errores.

## 5. Migración Comunidad (Tanda 2)

- [x] 5.1 Migrar `apps/web/app/comunidad/personas/page.tsx` de `useState(personas)` a lecturas/acciones del store (mantener UI idéntica).
- [x] 5.2 Migrar `apps/web/app/comunidad/personas/[id]/page.tsx`: leer persona y sus vínculos del store; usar `saveVinculo`/`removeVinculo` y `savePersona` para crear/editar/eliminar vínculos y sincronizar roles.
- [x] 5.3 Si la migración revela faltantes (acción, entidad o regla), actualizar primero el spec del change y luego el código.
- [x] 5.4 Verificar interacción: vincular una unidad a una persona; crear/eliminar persona y vínculo; validar que eliminar una unidad usada en un vínculo no rompa (regla del change).
- [x] 5.5 `npx tsc --noEmit` y `npx turbo typecheck` sin errores.

## 6. Migración Admin y Cierre (Tanda 3)

- [x] 6.1 Migrar `apps/web/app/admin/maestros/page.tsx` de los 5 `useState` (estados, macros, condiciones, bancos, emergencias) a lecturas/acciones del store; añadir `estadosOcupacion` y `categoriasMacro` a `MaestroCollections` (seed desde `data/maestros.ts`) y al spec del change.
- [x] 6.2 Migrar `apps/web/app/admin/configuracion/page.tsx` para leer `configuracion` del store y persistir con `saveConfiguracion`.
- [x] 6.3 Migrar `apps/web/app/admin/metricas/page.tsx` para leer unidades, tiposUnidad, macroSectores y estacionamientos del store (totales en vivo).
- [x] 6.4 Si la migración revela faltantes (acción, entidad o regla), actualizar primero el spec del change y luego el código.
- [x] 6.5 Verificar que crear/editar/eliminar en inventario y comunidad actualice los totales de métricas; confirmar que el dashboard (dev-dashboard) sigue intacto porque lee del filesystem.
- [x] 6.6 `npx tsc --noEmit` y `npx turbo typecheck` sin errores.