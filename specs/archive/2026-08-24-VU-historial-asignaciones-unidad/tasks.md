## 1. UI de Historial en Estructura Física

- [x] 1.1 Agregar botón "Historial de Asignaciones" (`IconHistory`) en la columna de acciones de cada unidad en `apps/web/app/inventario/estructura/page.tsx`.
- [x] 1.2 Implementar modal de timeline reutilizando el patrón visual de `ES - Estacionamientos`.
- [x] 1.3 Mostrar en el timeline: persona, rol, fecha de inicio, fecha de término y badge de "Periodo Activo".
- [x] 1.4 Resolver el nombre de la persona desde el Maestro de Personas (`MP`).

## 2. Cierre Automático de Tramos

- [x] 2.1 Extender `saveVinculo` en `apps/web/lib/store.ts` para detectar un vínculo activo previo del mismo rol (`propietario` o `arrendatario`) en la misma unidad.
- [x] 2.2 Al guardar el nuevo vínculo, cerrar el tramo anterior asignando `fechaFin = fechaInicio del nuevo vínculo - 1 día`.
- [x] 2.3 Mostrar opción explícita en el formulario para habilitar/deshabilitar el cierre automático (por defecto activado).
- [x] 2.4 Asegurar que `copropietario` y `ocupante` no disparen cierre automático.

## 3. Validaciones y Sincronización

- [x] 3.1 Mantener validación anti-solapamiento de arrendatarios.
- [x] 3.2 Actualizar la sincronización de roles de la persona al cerrar un vínculo.
- [x] 3.3 Emitir eventos de auditoría `VU_CHANGE_OWNER`, `VU_NEW_TENANT` y `VU_ASSIGN_RELEASED` al cerrar tramos.

## 4. Documentación

- [x] 4.1 Actualizar `Data/NSGC/docs/especificaciones/VU - Vinculacion Unidades.md` (ya realizado).
- [x] 4.2 Actualizar `Data/NSGC/docs/especificaciones/EF - Estructura Fisica.md` (ya realizado).
- [x] 4.3 Marcar este change como implementado y archivar cuando corresponda.
