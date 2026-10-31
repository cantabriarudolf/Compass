## Context

Dependencias resueltas: GD ya emite actas publicadas con `avisoCVReferencia:"pendiente"` (Sesión 1); RA (este mismo hito) provee reservas confirmadas para la sección "Próximas reservas"; CF aloja el check global de visto bueno; MP permite el flag individual de creación manual. La restricción D1 del prep-fundamentos manda: imágenes solo por URL remota, jamás payload binario (~5MB localStorage).

## Goals / Non-Goals

**Goals:**
- Gestor integral de avisos con ciclo de vida estricto (borrador editable/eliminable; publicado no eliminable; archivado como cierre histórico).
- Carrusel público autónomo `/visor-mensajes`: rotación infinita respetando duración por aviso, caducidad automática, reloj/fecha y sección transversal de próximas reservas RA.
- Plantillas rápidas: administración las define; personal de servicio las activa en segundos ante emergencias.
- Materializar `actasGD.avisoCVReferencia`: publicar un aviso desde el acta marca la referencia con el id del aviso.
- Supervisión: VB de administración por defecto para terceros habilitados, desactivable asumiendo el administrador la responsabilidad.

**Non-Goals:**
- Subida local de imágenes base64/archivos pesados (NSGC lo menciona como soporte): D1 manda → solo URL remota.
- Push WebSocket real: "sincronización en tiempo real" simulada con store reactivo + refresco periódico del visor.
- Proyección multi-pantalla/sesiones tokenizadas: el visor lee el store global hidratado.

## Decisions

- **`avisosCV {id, titulo, cuerpo, tipologia info|exito|advertencia|peligro, duracionSegundos ≥3, imagenUrl? XOR videoUrl?, pantallaCompleta, expiresAt? AAAA-MM-DD, tags[], estado borrador|publicado|archivado, requiereVistoBueno, creadoPorPersonaId?, origen manual|plantilla|acta_gd, plantillaId?, actaId?, fechaCreacion, fechaPublicacion?, fechaArchivado?}`.**
- **Multimedia excluyente validada en schema**: `imagenUrl` refine anti `data:`/`blob:` (D1) y `videoUrl` regex YouTube (`youtube.com/watch`, `youtu.be`, `youtube.com/shorts`); ambos a la vez → inválido.
- **Ciclo de vida**: alta nace `borrador` (`CV_DRAFT_CREATED`); edición audita `CV_EDITED` (archivado inmutable); `publicarAvisoCV` pasa borrador→publicado (`CV_PUBLISHED`, fechaPublicacion hoy); publicado/archivado rechazan remove; `archivarAvisoCV` publicado→archivado (`CV_ARCHIVED`).
- **Caducidad**: `caducarAvisosCV()` archiva publicados con `expiresAt < hoy` (idempotente, mismo evento `CV_ARCHIVED` con descripción de expiración). El visor y el panel la invocan al cargar.
- **VB y permisos**: si `creadoPorPersonaId` está definido (creación por tercero) la persona debe existir y tener `permiteCreacionManualCV`; con `cvRequiereVistoBueno !== false` (default true) el aviso exige VB y solo `publicarAvisoCV` (administración) lo publica. Plantillas activadas no requieren VB (aprobación implícita del maestro).
- **`plantillasCV {id, titulo, cuerpo, tipologia, duracionSegundosSugerida ≥3, imagenUrl?/videoUrl? excluyentes, pantallaCompleta, tags[], activa}`**: CRUD exclusivo administración; `activarPlantillaCV(id)` crea aviso `origen:"plantilla"` directamente publicado.
- **`publicarActaEnCV(actaId)`**: exige acta `estado:"publicada"` y `avisoCVReferencia === "pendiente"`; crea aviso `origen:"acta_gd"` (tipología info, tags ["directiva","acta"], contenido desde fecha/lugar/minuta truncada), marca `acta.avisoCVReferencia = aviso.id` y audita `CV_PUBLISHED`. Segunda llamada → error idempotente ("ya publicada").
- **Schema GD (MODIFIED)**: `avisoCVReferencia: z.string().optional()` — acepta el sentinel histórico `"pendiente"` y el id del aviso; compatible con stores persistidos.
- **Visor**: overlay fullscreen sobre el layout; cola = avisos publicados vigentes ordenados por fechaPublicacion; timer por `duracionSegundos`; reloj cada 1s; re-render reactivo del store + refresco de caducidad cada 30s; sección "Próximas reservas" derivada de `reservasRA` confirmadas futuras ≤7 días agrupadas por fecha.
- **Rank 8**: depende de actasGD (GD), reservasRA (RA), personas (MP), configuracion (CF), notificaciones (4). Seed: plantillas CV sembradas (4 categorías NSGC).
- **Migrate v20**: agrega colecciones aditivas; `plantillasCV` se siembra si ausente.

## Risks / Trade-offs

- [Overlay vs layout dedicado] El visor cubre sidebar/header con overlay fixed → aceptado: evita refactor de layouts; en proyección fullscreen es indistinguible.
- [Tiempo real simulado] Cambios del panel aparecen en el visor al re-render reactivo/polling → aceptado hasta SG (backend real).
- [Referencia GD como string] Se pierde la garantía de literal único "pendiente" → aceptado: convención documentada ("pendiente" = sin publicar; resto = id de aviso).

## Migration Plan

Aditiva v19→v20; `plantillasCV` sembradas si ausente. `avisoCVReferencia` persistido ("pendiente") sigue validando con el esquema ampliado.

## Open Questions

(ninguna)
