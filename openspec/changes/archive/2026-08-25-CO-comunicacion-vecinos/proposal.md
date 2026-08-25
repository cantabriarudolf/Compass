## Why

El módulo CO del NSGC convierte al sistema en el canal oficial de comunicación: mensajería masiva por filtros EF/MP, maestro de plantillas con variables dinámicas y buzón de interacción ciudadana con tickets. La bandeja `notify()` (PI) y los vínculos VU ya proveen los cimientos. Es el primer cambio de la Sesión 2.

## What Changes

- Nueva capability **CO-comunicacion-vecinos**: centro de mensajería masiva, maestro de plantillas prefijadas, buzón felicitaciones/sugerencias/reclamos y biblioteca documental.
- Colecciones nuevas en ST: `plantillasCO` (categoría comunidad/urgente/cobranza/informacion/onboarding, asunto, cuerpo con variables `[Nombre_Usuario]`), `enviosCO` (asunto/cuerpo, snapshot de destinatarios resueltos por filtros EF/MP, lecturas confirmadas), `mensajesBuzonCO` (folio único, clasificación, estado Recibido→En Gestión→Resuelto→Cerrado, respuestas, visibilidad Comité) y `documentosCO` (referencias D1).
- Acciones repository: `savePlantillaCO`/`removePlantillaCO`, `saveEnvioCO` (envío masivo → `notify()` simulado por destinatario + evento), `registrarLecturaEnvioCO`, `saveMensajeBuzonCO`, `responderMensajeBuzonCO`, `cambiarEstadoBuzonCO`, `removeMensajeBuzonCO`, `saveDocumentoCO`/`removeDocumentoCO`/`registrarDescargaDocCO`; todos retornan `StoreResult`.
- Envíos masivos materializados como notificaciones `email_simulado` vía `notify()` (D3); confirmación de lectura simulada registrada por destinatario.
- Eventos AM: `CO_SEND_MASSIVE`, `CO_TICKET_CREATED`, `CO_TICKET_RESPONDIDO`, `CO_TICKET_ESTADO`, `CO_DOC_DOWNLOAD`.
- Bump `STORE_VERSION` 13 → 14 con migrate aditivo (plantillas sembradas desde el seed del spec).
- UI `/comunidad/comunicacion` (ruta ya enlazada en sidebar como "Comunicación") con vistas por rol RP.

## Capabilities

### New Capabilities
- `CO-comunicacion-vecinos`: Mensajería masiva por filtros EF/MP con plantillas y variables, buzón ciudadano con tickets y biblioteca documental, integrado a AM.

### Modified Capabilities
(ninguna)

## Impact

- Código: `k0mp4ss_fe/apps/web/lib/store.ts` (+4 colecciones, +9 acciones, migrate v14), `k0mp4ss_fe/apps/web/lib/schemas.ts` (+4 esquemas), `k0mp4ss_fe/apps/web/data/comunidad/plantillas-co.ts` (seed nuevo), `k0mp4ss_fe/apps/web/app/comunidad/comunicacion/page.tsx` (nueva).
- Specs: nueva carpeta `openspec/specs/CO-comunicacion-vecinos/`.
- Depende de: MP/VU (filtros destinatarios), PI (`notify()`), AD (gate de alertas). GE gestionará el ciclo operativo de los tickets del buzón (change posterior de esta misma sesión); aquí el buzón mantiene su ciclo ciudadano propio según NSGC §3.
