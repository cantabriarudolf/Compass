## Why

Hoy cada página del frontend siembra su estado con `useState` desde los mocks de `apps/web/data/`, por lo que cualquier cambio (crear un tipo, editar una unidad, asignar un estacionamiento) se pierde al recargar la página. Además, los módulos que comparten dominio (TU, EF, ES) no comparten data: un tipo creado en Tipos de Unidad no aparece en Estructura Física. Este cambio introduce una capa de datos persistente en el cliente: un store global Zustand con middleware `persist` (localStorage) que centraliza el estado y expone acciones CRUD por entidad bajo el patrón repository.

## What Changes

- Store global Zustand en `apps/web/lib/store.ts` con `persist` a localStorage bajo la key `compass-store`, versión y `migrate`.
- Sembrado inicial del store desde los mocks actuales de `apps/web/data/` (tipos de unidad, macro/micro sectores, unidades, estacionamientos, personas, vínculos, maestros administrativos y configuración).
- Acciones CRUD centralizadas por entidad (patrón repository): las páginas nunca mutan el estado directamente, solo invocan acciones del store.
- Validaciones de integridad al eliminar: no se permite borrar un tipo de unidad con unidades vinculadas, ni un macro/micro sector con hijos asociados.
- Migración de las páginas piloto de Inventario (TU, EF, ES) desde `useState` a lecturas y acciones del store.
- Módulo `ST` (Sistema de Trazabilidad / Capa de Datos) incorporado al dashboard de desarrollo con tracking de spec y change.

## Capabilities

### New Capabilities
- `ST-capa-datos-persistente`: Capa de datos persistente en el cliente (store global Zustand + persist + repository CRUD) que centraliza el estado sembrado desde los mocks y habilita persistencia entre recargas y compartición entre módulos.

### Modified Capabilities
- None

## Impact

- `apps/web/lib/store.ts` (nuevo): store global Zustand con persist, seed y acciones CRUD.
- `apps/web/package.json`: nueva dependencia `zustand`.
- `apps/web/app/inventario/tipos/page.tsx`: migración de `useState(initialTipos)` a lecturas/acciones del store.
- `apps/web/app/inventario/estructura/page.tsx`: migración de los 3 `useState` (macroSectores, microSectores, unidades) al store.
- `apps/web/app/inventario/estacionamientos/page.tsx`: migración de `useState(initialEstacionamientos)` al store.
- `apps/web/lib/dev-dashboard.ts`: entrada `ST` en `PHASES` (Fase 0) y `UI` en `PHASES` (Fase 0).
- `Data/NSGC/docs/especificaciones/`: nuevos documentos `ST - Capa de Datos Persistente.md`, `UI - Interfaz Principal.md` y `UI - Navegacion Lateral.md`; actualización de `00-index.md`.