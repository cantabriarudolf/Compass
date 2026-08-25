## 1. Store (ST)

- [x] 1.1 Declarar esquemas/tipos `RecursoIR`, `ComodinIR`, `SolicitudInsumoIR`, `EntregaEPP` en schemas.ts y colecciones `activosIR`, `solicitudesInsumoIR`, `entregasEPP` en `CompassData`; bump `STORE_VERSION` 15→16 con migrate aditivo
- [x] 1.2 Implementar `saveRecursoIR` (validaciones por categoría: infraestructura exige ubicación EF, llave exige unidad, insumo crítico exige umbral, D1 factura/ficha por referencia) y `removeRecursoIR` (bloquea con solicitudes/entregas asociadas)
- [x] 1.3 Implementar `cambiarEstadoRecursoIR` (matriz disponible/en_uso/reparacion/baja; `IR_ASSET_REPAIR` y baja auditada)
- [x] 1.4 Implementar `saveSolicitudInsumoIR` (folio SI-*, normal contra catálogo o comodín con alerta crítica), `resolverComodinIR` (aprobar_crear/sustituir/rechazar) y `entregarSolicitudInsumoIR` (descuenta stock, `IR_STOCK_LOW` al cruzar umbral)
- [x] 1.5 Implementar `registrarEntregaEPP` (`IR_DELIVERY_EPP` + próxima renovación) y `asignarAccesoIR`/`devolverAccesoIR` (quién tiene qué)
- [x] 1.6 Tests de store IR (catálogo por categorías, umbral crítico y alarma, ciclo solicitud completa, comodín 3 salidas, EPP renovación, accesos asignar/devolver, integridad al eliminar)

## 2. UI

- [x] 2.1 Crear `/inventario/recursos/page.tsx`: pestañas Catálogo / Solicitudes / EPP / Accesos + skeleton + rehydrated
- [x] 2.2 Catálogo: grilla con filtros por categoría/estado/área, form de alta/edición por naturaleza (ubicación EF, stock crítico, proveedor/factura D1), acciones de estado
- [x] 2.3 Solicitudes: bandeja pendientes/entregadas, form normal vs comodín, panel de resolución del comodín (aprobar y crear/sustituir/rechazar), botón entrega con validación de stock
- [x] 2.4 EPP: registro de entregas individuales con talla/estado y próxima renovación; Accesos: asignar/devolver + vista no devueltas

## 3. Validación

- [x] 3.1 Lint + typecheck + suite verde completa
- [x] 3.2 openspec validate --changes sin errores
