# CV-visor-mensajes Specification

## Purpose
Carrusel público proyectable con rotación automática para pantallas de áreas comunes, gestor de avisos con ciclo de vida y plantillas operativas; publica actas GD materializando su referencia pendiente. Fuente de verdad: `Data/NSGC/docs/especificaciones/CV - Visor de Mensajes.md`.

## Requirements

### Requirement: Gestor de Avisos con Ciclo de Vida
El sistema MUST gestionar avisos mediante `saveAvisoCV`/`publicarAvisoCV` (store) y la API REST `/api/cv/avisos` (GET paginado, POST upsert idempotente; detalle/PUT/DELETE en `/[id]`), retornando `StoreResult` cuando aplica, con clasificación tipológica (Información/Azul, Éxito/Verde, Advertencia/Naranja, Peligro/Rojo), duración individual en segundos (≥3), caducidad automática opcional (`expiresAt`), tags de organización interna y ciclo estricto: el alta nace Borrador (`CV_DRAFT_CREATED`) editable y eliminable; Publicado no admite eliminación directa y solo pasa a Archivado por expiración o finalización anticipada (`CV_ARCHIVED`); Archivado conserva la data para auditoría y ya no es editable.

#### Scenario: Alta como borrador y publicación
- **WHEN** la administración crea un aviso y luego lo publica
- **THEN** audita `CV_DRAFT_CREATED` y `CV_PUBLISHED`, quedando visible en el carrusel

#### Scenario: Publicado no eliminable
- **WHEN** se intenta eliminar un aviso publicado o archivado
- **THEN** la eliminación se rechaza (la API responde error al DELETE y el store retorna `{ok:false}`); la única salida del carrusel es archivar

#### Scenario: Edición auditada
- **WHEN** se edita un aviso borrador o publicado
- **THEN** persiste el cambio y audita `CV_EDITED`; el archivado rechaza ediciones

### Requirement: Multimedia Excluyente por URL Remota (D1)
El aviso MAY incluir imagen o video de apoyo, jamás ambos: la imagen MUST ser una URL remota (prohibido data:/blob:, D1) y el video MUST ser un enlace YouTube estándar, Shorts o youtu.be; ambos admiten modo pantalla completa.

#### Scenario: Imagen remota aceptada
- **WHEN** se guarda un aviso con imagenUrl `https://…/aviso.jpg`
- **THEN** persiste sin contenido embebido

#### Scenario: Base64 rechazado
- **WHEN** se intenta guardar una imagen como data-URL
- **THEN** retorna `{ok:false}` citando la regla D1

#### Scenario: Video YouTube válido y exclusión
- **WHEN** se guarda un aviso con enlace youtube.com/shorts y otro campo imagen
- **THEN** la combinación imagen+video retorna `{ok:false}` (excluyentes)

### Requirement: Control de Tiempo y Caducidad Automática
El sistema MUST respetar la duración individual de cada aviso en la rotación y MUST retirar automáticamente del carrusel los avisos publicados cuya `expiresAt` sea anterior a hoy mediante `caducarAvisosCV()` (idempotente), archivándolos con evento `CV_ARCHIVED` que indique expiración automática.

#### Scenario: Caducidad sin intervención manual
- **WHEN** un aviso publicado venció ayer y se ejecuta la caducidad (carga del visor/panel)
- **THEN** pasa a Archivado una sola vez con descripción de expiración

### Requirement: Plantillas Rápidas Operativas
El sistema MUST mantener plantillas maestras creadas únicamente por administración mediante la API REST `/api/cv/plantillas` (GET paginado, POST upsert idempotente; detalle/PUT/DELETE en `/[id]`) con tipología, duración sugerida y multimedia opcionales; el personal de servicio MUST poder activarlas mediante `activarPlantillaCV` generando un aviso publicado al instante (aprobación implícita del maestro) con origen trazable a la plantilla.

#### Scenario: Activación ante emergencia
- **WHEN** conserjería activa la plantilla "Portón en mantención" (Advertencia)
- **THEN** nace un aviso Publicado con origen "plantilla" visible en el carrusel

#### Scenario: Plantilla inactiva no activable
- **WHEN** se intenta activar una plantilla desactivada o inexistente
- **THEN** retorna `{ok:false}`

### Requirement: Creación Manual Supervisada
Por defecto, la creación manual de mensajes es facultad de la administración. Un tercero (personal, directiva o residente) SOLO puede crear si su perfil MP registra `permiteCreacionManualCV`; y mientras el check global CF `cvRequiereVistoBueno` esté habilitado (default true), todo mensaje creado por tercero nace exigiendo visto bueno y permanece en Borrador hasta que la administración publique. Desactivar el check global deja la responsabilidad operativa en el administrador.

#### Scenario: Tercero sin habilitación rechazado
- **WHEN** un creadoPorPersonaId sin el flag intenta registrar un mensaje manual
- **THEN** retorna `{ok:false}` citando la falta de habilitación

#### Scenario: VB requerido por defecto
- **WHEN** un tercero habilitado crea un mensaje con el check global activo
- **THEN** el aviso queda en Borrador con requiereVistoBueno y solo administración lo publica

### Requirement: Publicación de Actas GD (consumo avisoCVReferencia)
El sistema MUST publicar actas de directiva en el visor mediante `publicarActaEnCV(actaId)` cuando el acta esté en estado Publicada y su `avisoCVReferencia` sea `"pendiente"`: crea un aviso con origen `acta_gd`, tipología Información y tags ["directiva","acta"] con contenido derivado del acta, marca `avisoCVReferencia` con el id del aviso creado y audita `CV_PUBLISHED`. Repetir la operación sobre un acta ya publicada en CV MUST fallar sin duplicar avisos.

#### Scenario: Acta publicada en visor
- **WHEN** la administración publica el aviso desde un acta publicada pendiente
- **THEN** el aviso aparece en el carrusel y `actasGD.avisoCVReferencia` guarda el id del aviso

#### Scenario: Idempotencia de referencia
- **WHEN** se reintenta publicar el mismo acta
- **THEN** retorna `{ok:false}` y la referencia conserva el id original

### Requirement: Visor Carrusel Público (/visor-mensajes)
El sistema MUST ofrecer una interfaz pública independiente `/visor-mensajes` optimizada para monitores sin interacción: rotación infinita de los avisos publicados vigentes respetando duraciones individuales, identidad gráfica institucional (nombre/logo de la comunidad, diseño glassmorphism), widgets permanentes de hora y fecha en tiempo real, tolerancia a fallos rehidratando datos frescos al iniciar, actualización reactiva de cambios del panel (altas, duraciones, estados) y lectura transversal de las reservas RA confirmadas de los próximos 7 días mostrando espacio, fecha y horario.

#### Scenario: Rotación con duraciones distintas
- **WHEN** el carrusel contiene avisos de 5s y 15s
- **THEN** cada aviso permanece exactamente su duración configurada antes del siguiente

#### Scenario: Sección próximas reservas
- **WHEN** existe una reserva confirmada dentro de los próximos 7 días
- **THEN** el visor muestra elemento, fecha y tramo horario entre avisos

#### Scenario: Cambio del panel reflejado sin recargar
- **WHEN** la administración archiva un aviso mientras el visor está proyectado
- **THEN** el visor deja de mostrarlo en su siguiente ciclo sin refresco manual

### Requirement: Integración con Auditoría y Métricas (AM)
El módulo SHALL emitir `CV_DRAFT_CREATED`, `CV_PUBLISHED`, `CV_EDITED` y `CV_ARCHIVED` como eventos inmutables con data cuantificable: total de avisos publicados, activos simultáneos, expirados automáticamente y duración promedio de vigencia derivables.

#### Scenario: Métricas de visibilidad
- **WHEN** la reportería consulta comunicación visual
- **THEN** deriva tasa publicado vs archivado, permanencia promedio y activaciones de plantillas desde eventos y colecciones
