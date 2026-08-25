## Why

El módulo CV del NSGC provee el canal visual de alta visibilidad proyectado en pantallas de áreas comunes: carrusel público con rotación automática, gestor de avisos con ciclo de vida y plantillas operativas de activación instantánea. Además cierra la deuda técnica de GD: al publicar un acta aprobada en el visor, la referencia `avisoCVReferencia` ("pendiente" desde la Sesión 1) se materializa con el id del aviso creado. Es el segundo cambio de la Sesión 4.

## What Changes

- Nueva capability **CV-visor-mensajes**: gestor de avisos (CRUD con ciclo borrador→publicado→archivado), maestro de plantillas rápidas operativas, visor carrusel público `/visor-mensajes` y publicación de actas GD.
- Colecciones nuevas en ST: `avisosCV` (tipología info|exito|advertencia|peligro, duración en segundos por aviso, caducidad automática `expiresAt`, multimedia EXCLUYENTE imagen-URL-remota XOR video-YouTube con modo pantalla completa, tags, origen manual|plantilla|acta_gd, visto bueno requerido) y `plantillasCV` (plantillas maestras creadas solo por administración; activables por personal de servicio).
- Acciones repository: `saveAvisoCV` (alta/edición con eventos draft/edited), `removeAvisoCV` (solo borradores), `publicarAvisoCV` (VB de administración), `archivarAvisoCV`, `caducarAvisosCV` (expira publicados vencidos, idempotente), `activarPlantillaCV`, `savePlantillaCV`/`removePlantillaCV` y **`publicarActaEnCV(actaId)`** que consume `actasGD.avisoCVReferencia === "pendiente"` creando el aviso y marcando la referencia con el id del aviso.
- Multimedia SIEMPRE por URL remota (D1): imagen jamás base64/Blob; video solo enlaces YouTube (watch/shorts/youtu.be). Imagen y video son excluyentes entre sí.
- Control de supervisión: check global `cvRequiereVistoBueno` en CF (habilitado por defecto) obliga a que mensajes creados por terceros habilitados nazcan como borrador hasta VB de administración; habilitación individual de creación manual vía flag en MP (`permiteCreacionManualCV`).
- Modificado **GD-gestion-directiva**: `avisoCVReferencia` evoluciona de literal "pendiente" a referencia materializada (id del aviso CV tras publicar); nueva acción de publicación desde CV.
- Integración transversal: el visor lee las reservas RA confirmadas de los próximos 7 días e inserta una sección "Próximas reservas".
- Eventos AM: `CV_DRAFT_CREATED`, `CV_PUBLISHED`, `CV_EDITED`, `CV_ARCHIVED`.
- Bump `STORE_VERSION` 19 → 20 con migrate aditivo.
- UI: panel `/comunidad/visor` (pestañas Avisos / Plantillas / Actas GD / Configuración + vista previa) y visor público `/visor-mensajes` (rotación por duración, reloj/fecha, glassmorphism, overlay fullscreen).

## Capabilities

### New Capabilities
- `CV-visor-mensajes`: Carrusel público con rotación automática, gestor de avisos con caducidad y plantillas operativas; publica actas GD materializando su referencia pendiente.

### Modified Capabilities
- `GD-gestion-directiva`: la referencia de aviso en CV se materializa con el id del aviso al publicar el acta (antes quedaba "pendiente" sin consumidor).

## Impact

- Código: `k0mp4ss_fe/apps/web/lib/store.ts` (+2 colecciones, +8 acciones, migrate v20), `k0mp4ss_fe/apps/web/lib/schemas.ts` (+3 esquemas, ajuste `ActaGDSchema.avisoCVReferencia`, flags `cvRequiereVistoBueno` CF y `permiteCreacionManualCV` MP), páginas nuevas `app/comunidad/visor/page.tsx` y `app/visor-mensajes/page.tsx`, sidebar.
- Specs: nueva carpeta `openspec/specs/CV-visor-mensajes/`; delta MODIFIED sobre `openspec/specs/GD-gestion-directiva/`.
- Depende de: GD (actas publicadas), RA (reservas confirmadas para el carrusel), MP (habilitación creación manual), CF (check VB), PI (`notify()`), ST (media D1).
