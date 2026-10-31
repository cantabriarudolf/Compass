# CV-visor-mensajes Tasks

## 1. Store (ST)

- [x] 1.1 Declarar esquemas/tipos `AvisoCV`, `PlantillaCV` (tipología, multimedia excluyente D1, YouTube) en schemas.ts; ampliar `ActaGDSchema.avisoCVReferencia` a string; flag `permiteCreacionManualCV` en MP y `cvRequiereVistoBueno` en CF; colecciones `avisosCV`, `plantillasCV` + seed de plantillas NSGC; bump `STORE_VERSION` 19→20 con migrate aditivo
- [x] 1.2 Implementar `saveAvisoCV` (alta borrador `CV_DRAFT_CREATED`, edición `CV_EDITED`, archivado inmutable), `removeAvisoCV` (solo borrador) y `publicarAvisoCV` (VB administración, `CV_PUBLISHED`)
- [x] 1.3 Implementar `archivarAvisoCV` y `caducarAvisosCV` (expira publicados vencidos, idempotente, `CV_ARCHIVED` con expiración)
- [x] 1.4 Implementar `savePlantillaCV`/`removePlantillaCV` y `activarPlantillaCV` (aviso publicado origen plantilla)
- [x] 1.5 Implementar `publicarActaEnCV(actaId)`: valida acta publicada + referencia "pendiente", crea aviso origen acta_gd y marca `avisoCVReferencia = id del aviso`
- [x] 1.6 Tests de store CV (ciclo de vida completo, multimedia excluyente/base64 rechazado, caducidad idempotente, plantillas activación, VB terceros habilitados/no habilitados, publicación de acta GD con materialización e idempotencia)

## 2. UI

- [x] 2.1 Crear `/comunidad/visor/page.tsx`: pestañas Avisos / Plantillas / Actas GD / Configuración + skeleton + rehydrated + sidebar "Visor de Mensajes"
- [x] 2.2 Avisos: grilla por estado con tipología coloreada, form alta/edición (duración, expiresAt, imagen URL XOR video YouTube, pantalla completa, tags), acciones publicar/archivar/eliminar + Vista Previa fiel al visor
- [x] 2.3 Plantillas: CRUD administración + botón activar; Actas GD: lista publicadas con estado de referencia y botón "Publicar en Visor"; Configuración: check VB global
- [x] 2.4 Crear `/visor-mensajes/page.tsx`: overlay fullscreen glassmorphism, rotación automática por duracionSegundos, reloj/fecha en vivo, identidad comunidad, sección próximas reservas RA (7 días), refresco reactivo/caducidad periódica

## 3. Validación

- [x] 3.1 Lint + typecheck + suite verde completa
- [x] 3.2 openspec validate --all sin errores
