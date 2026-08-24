## Context

El módulo `VU - Vinculación de Unidades` ya almacena la relación entre personas y unidades con campos de vigencia (`fechaInicio`, `fechaFin`) y roles (`propietario`, `arrendatario`, `copropietario`, `ocupante`). La gestión de estos vínculos está disponible desde la ficha de cada persona, pero no existe una vista equivalente desde el inventario físico de unidades.

El módulo `ES - Estacionamientos` demostró un patrón útil: un botón de historial en cada fila que abre un modal con una línea de tiempo de asignaciones. Este change replica ese patrón para las unidades.

## Goals

- Permitir consultar el historial completo de asignaciones de una unidad sin salir de `EF - Estructura Física`.
- Mantener una única fuente de verdad: el historial se deriva de la colección de vínculos (`vinculos`), no se duplica en el maestro de unidades.
- Automatizar el cierre de tramos al reemplazar un propietario o arrendatario, evitando solapamientos.
- Reutilizar el componente visual de timeline ya implementado en `ES` para mantener consistencia de UX.

## Decisions

1. **Fuente de verdad del historial**:
   - *Decisión*: El historial de una unidad se calcula en tiempo real como `vinculos.filter(v => v.unidadId === unidad.id)`.
   - *Rationale*: Evita duplicar datos entre `VU` y `EF`. Cualquier cambio en un vínculo se refleja inmediatamente en el historial de la unidad.

2. **Cierre automático de tramos**:
   - *Decisión*: Al guardar un nuevo vínculo activo (sin `fechaFin`) de rol `propietario` o `arrendatario` en una unidad, el sistema cierra automáticamente el vínculo activo anterior del mismo rol asignándole como `fechaFin` el día anterior a la `fechaInicio` del nuevo vínculo.
   - *Rationale*: Garantiza que no haya dos propietarios o dos arrendatarios vigentes simultáneamente para la misma unidad.

3. **Roles secundarios sin cierre forzado**:
   - *Decisión*: Los roles `copropietario` y `ocupante` pueden coexistir con otros vínculos del mismo rol sin cerrar tramos anteriores.
   - *Rationale*: Una unidad puede tener varios copropietarios o ocupantes al mismo tiempo.

4. **Ubicación de la UI**:
   - *Decisión*: El botón "Historial de Asignaciones" se ubicará en la columna de acciones de la tabla de unidades de `EF`, junto al botón de edición, replicando la ubicación en `ES`.
   - *Rationale*: Mantiene consistencia con el módulo de estacionamientos y no requiere navegación adicional.

## Risks / Trade-offs

- **Solapamiento de fechas**: Si el usuario edita manualmente un vínculo, podría generar solapamientos. Se mantiene la validación anti-solapamiento de arrendatarios existente en `store.ts`.
- **Rendimiento en comunidades grandes**: Filtrar vínculos en memoria es suficiente para el mock actual. En producción este filtro debería hacerse en el backend.
- **Eliminación de vínculos**: Borrar un vínculo del historial podría dejar un hueco. Se evaluará si el botón de eliminar debe cambiarse a "Cerrar vínculo" (asignar fechaFin) en lugar de borrar.
  - *Resolución*: Se mantiene la eliminación como operación disponible (necesaria para corregir registros erróneos y para el flujo de limpieza del QA Lab), pero deja trazabilidad obligatoria: cada `removeVinculo` emite un evento de auditoría (`VU_ASSIGN_RELEASED` si era activo, `VU_DELETE` si era un tramo histórico cerrado). Adicionalmente, `saveVinculo` valida solapamientos para roles exclusivos (`propietario` y `arrendatario`) contra el estado post-cierre, e impide autosolapamientos de una misma persona en el mismo rol y unidad.
