## Why

El módulo GE del NSGC centraliza y tipifica todos los requerimientos formales (tickets) que fluyen hacia la administración —insumos del personal, registro de grabaciones CCTV y tickets del buzón CO— asegurando workflow automático de estados, notificaciones al solicitante y SLA medible. Es el segundo cambio de la Sesión 2 y cierra el engranaje con CO.

## What Changes

- Nueva capability **GE-gestion-solicitudes**: motor de tickets con workflow automático Nuevo→En Revisión→(Requiere Acción Vecino↔En Proceso)→Resuelto/Cerrado, bandeja/grilla con filtros y dashboard SLA.
- Colección nueva en ST: `solicitudesGE` (folio, tipo insumos/grabaciones/buzon, solicitante, unidad, estado, comentarios trazables, detalle por tipo, historial de estados, resolución/cierre).
- Acciones repository: `saveSolicitudGE`, `abrirSolicitudGE` (primera lectura admin → En Revisión automático), `responderSolicitudGE` (admin pide datos → Requiere Acción Vecino + notificación; respuesta del solicitante → En Proceso), `resolverSolicitudGE`, `cerrarSolicitudGE`, `removeSolicitudGE`; todas retornan `StoreResult`.
- Notificaciones automáticas al solicitante en cada transición relevante vía `notify()` (D3).
- Tipología grabaciones: autocompletado unidad/nombre si ingresa el residente; si registra el conserje, vínculo obligatorio a unidad/residente del maestro; fecha/hora del suceso y justificación extendida obligatoria. Insumos: área destino obligatoria (catálogo de materiales = referencia pendiente a IR, módulo no implementado aún).
- Eventos AM: `GE_TICKET_CREATED`, `GE_TICKET_STATE_CHANGE`, `GE_TICKET_RESOLVED`. Data cuantificable SLA: horas creación→cierre.
- Bump `STORE_VERSION` 14 → 15 con migrate aditivo.
- UI `/operaciones/solicitudes` (ruta ya enlazada en sidebar como "Solicitudes"): grilla 10 más recientes + filtros + detalle modal + mini-dashboard por estado/SLA.

## Capabilities

### New Capabilities
- `GE-gestion-solicitudes`: Motor de tickets con workflow de estados automatizado, tipologías insumos/grabaciones/buzón, bandeja filtrable y SLA.

### Modified Capabilities
(ninguna)

## Impact

- Código: `k0mp4ss_fe/apps/web/lib/store.ts` (+1 colección, +6 acciones, migrate v15), `k0mp4ss_fe/apps/web/lib/schemas.ts` (+2 esquemas), `k0mp4ss_fe/apps/web/app/operaciones/solicitudes/page.tsx` (nueva).
- Specs: nueva carpeta `openspec/specs/GE-gestion-solicitudes/`.
- Depende de: MP/VU (solicitante/unidad), CO (`mensajesBuzonCO` para tickets tipo buzon), PI (`notify()`). IR (insumos) es referencia pendiente documentada.
