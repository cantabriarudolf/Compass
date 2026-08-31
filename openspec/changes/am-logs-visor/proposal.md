## Why

El spec vigente de AM (AM-auditoria-metricas, "Logs de Auditoría") exige una vista dedicada
en `/admin/logs` para consultar, filtrar y exportar los eventos de auditoría, y el sidebar ya
la promete como ítem "Logs de Auditoría" — pero la ruta no existe y la fuente de datos
(`store.eventos`, alimentada por `registrarEvento` desde todos los módulos) no tiene consumidor.
Cierra el último placeholder funcional del menú Sistema junto con la visibilidad de la pista
de auditoría que hoy solo se ve vía métricas.

## What Changes

- Nueva vista `/admin/logs` (solo lectura) sobre `store.eventos`:
  - Lista ordenada por `timestamp` descendente (requisito del spec).
  - Búsqueda por texto libre (descripcion, referenciaId, tipoAccion) y filtros por
    `categoria` (código de módulo) y `tipoAccion`.
  - Exportación CSV de la lista filtrada (descarga cliente).
  - Paginación ligera por bloques (el store retiene máx 500 eventos).
  - Sin acciones de edición/borrado: la vista NO muta el store (immutabilidad del spec).
- Delta sobre el requirement "Logs de Auditoría" de AM: concreta los filtros, el formato de
  exportación y la garantía de solo lectura de la vista (el spec ya pedía browse/filter/export).
- Sin cambios de `lib/store.ts`, sin bump de STORE_VERSION, sin nuevas colecciones.

## Capabilities

### New Capabilities

(ninguna — la vista pertenece a la capability AM existente)

### Modified Capabilities

- `AM-auditoria-metricas`: el requirement "Logs de Auditoría" se concreta — filtros definidos
  (texto libre + categoria + tipoAccion), exportación CSV del resultado filtrado, orden
  timestamp descendente y vista estrictamente solo lectura.

## Impact

- **Nuevo archivo**: `k0mp4ss_fe/apps/web/app/admin/logs/page.tsx` (client component, patrón
  de `/admin/metricas`: `useCompassStore` + `useStoreRehydrated`).
- **E2E**: nuevo spec `k0mp4ss_fe/apps/web/e2e/crud/logs.spec.ts` (lane crud, patrón read-oriented
  con seed por defecto: eventos del seed + acciones del propio test afirmados en la vista).
- **Sidebar**: sin cambio — el ítem "Logs de Auditoría" (`/admin/logs`) ya existe como
  "Próximamente"; esta change lo vuelve real (se elimina el placeholder).
- **Datos**: solo lectura de `eventos`; no hay migraciones ni schemas nuevos.
