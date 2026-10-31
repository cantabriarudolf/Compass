## Context

Los tipos de unidad definen la plantilla base (metraje y monto GC) que heredan las unidades físicas. El módulo ya está implementado en el frontend con mock data; este change formaliza su especificación bajo OpenSpec.

## Goals

- Estandarizar las características de las unidades de la comunidad.
- Asegurar consistencia en los cobros de gasto común.
- Soportar reajustes retroactivos del tarifario con fecha de vigencia.
- Cuantificar el impacto de los cambios de tarifario sobre la recaudación.

## Decisions

- **Data Model**: Maestro `TiposUnidad` en `data/inventario/estructura.ts`, vinculado a `Unidades` por `tipoUnidadId`.
- **UI Design**: Vista con tarjetas por tipo, calculador de impacto y diálogo de edición con fecha de vigencia.
- **Tarifario**: Historial de tarifas (`historialTarifas`) por tipo, con fecha de vigencia y creado en.
- **Auditoría**: Emitir eventos `TU_CREATE` y `TU_UPDATE_VALUE` hacia el módulo `AM`.
- **Eliminación**: Restricción de borrado si hay unidades vinculadas; uso de toggle Activo/Inactivo (soft delete).

## Risks / Trade-offs

- **Sincronización FI**: La propagación retroactiva de montos depende del módulo de Finanzas; el frontend solo simula el impacto hasta que `FI` consuma el evento.
- **Datos mock**: Sin backend, los eventos de auditoría no se persisten; quedan definidos a nivel de spec.
