## Why

El módulo de Estacionamientos (`ES`) ya expone un botón **"Historial de Asignaciones"** que permite ver quién ocupó cada plaza y en qué periodo. Las unidades del inventario físico (`EF`) deben tener la misma trazabilidad, ya que también cambian de propietarios, arrendatarios y ocupantes a lo largo del tiempo. Sin esta vista, el administrador debe salir de la ficha de la unidad e ir a la ficha de cada persona para reconstruir la historia manualmente.

## What Changes

- Agregar una acción **"Historial de Asignaciones"** en la tabla/ficha de cada unidad dentro de `EF - Estructura Física`.
- Implementar un modal de timeline que muestre los vínculos históricos de la unidad (propietarios, arrendatarios, copropietarios, ocupantes) con fechas de inicio, término y periodo vigente.
- Agregar lógica de **cierre automático de tramos** al crear o editar un vínculo activo del mismo rol (`propietario` o `arrendatario`).
- Actualizar las especificaciones `VU` y `EF` para reflejar esta funcionalidad.

## Capabilities

### New Capabilities
- `VU-historial-asignaciones-unidad`: Visualización cronológica de todos los vínculos de una unidad desde el inventario físico, con cierre automático del tramo anterior al registrar un nuevo propietario o arrendatario.

### Modified Capabilities
- `EF-estructura-fisica`: extiende la ficha de unidad con el botón y modal de historial.
- `VU-vinculacion-unidades`: agrega la regla de cierre automático de tramos y validación de solapamientos.

## Impact

- `apps/web/app/inventario/estructura/page.tsx`: nuevo botón y modal de historial en la tabla de unidades.
- `apps/web/components/comunidad/formulario-vinculo.tsx`: opción para cerrar automáticamente el vínculo activo anterior del mismo rol.
- `apps/web/lib/store.ts`: validaciones de solapamiento y cierre de tramos al guardar vínculos.
- `Data/NSGC/docs/especificaciones/VU - Vinculacion Unidades.md` y `EF - Estructura Fisica.md`: documentación actualizada.
