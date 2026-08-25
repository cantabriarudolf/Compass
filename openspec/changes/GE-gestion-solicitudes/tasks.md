## 1. Store (ST)

- [x] 1.1 Declarar esquemas/tipos `SolicitudGE`, `ComentarioGE`, `DetalleGrabaciones`, `DetalleInsumos` en schemas.ts y colección `solicitudesGE` en `CompassData`; bump `STORE_VERSION` 14→15 con migrate aditivo
- [x] 1.2 Implementar helper interno de transición (matriz de estados válida, historial, notify solicitante, evento `GE_TICKET_STATE_CHANGE`)
- [x] 1.3 Implementar `saveSolicitudGE` (folio GE-*, estado inicial nuevo, FKs persona/unidad/mensajeBuzonCO, validaciones grabaciones/insumos, confirmación recepción, evento `GE_TICKET_CREATED`) y `removeSolicitudGE`
- [x] 1.4 Implementar `abrirSolicitudGE` (auto En Revisión primera lectura), `responderSolicitudGE` (admin pide datos → Requiere Acción Vecino; contesta vecino → En Proceso), `resolverSolicitudGE` (`GE_TICKET_RESOLVED`), `cerrarSolicitudGE`
- [x] 1.5 Tests de store GE (workflow completo Nuevo→…→Cerrado, grabaciones obligatorios/conserje vincula unidad, buzón FK, folios únicos, notificaciones por transición, matriz rechaza saltos inválidos)

## 2. UI

- [x] 2.1 Crear `/operaciones/solicitudes/page.tsx`: grilla 10 más recientes + filtros (rango fechas, unidad, solicitante, tipo) + skeleton + rehydrated
- [x] 2.2 Detalle modal con trazabilidad completa (comentarios, historial estados, resolución) y apertura auto En Revisión
- [x] 2.3 Formularios por tipología: insumos (área destino), grabaciones (fecha/hora suceso + justificación, autocompletado residente / vinculación obligatoria conserje), buzón (selector mensaje CO)
- [x] 2.4 Botonera de workflow según estado + mini-dashboard (contadores por estado + SLA promedio horas)

## 3. Validación

- [x] 3.1 Lint + typecheck + suite verde completa
- [x] 3.2 openspec validate --changes sin errores
