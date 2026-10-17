# PI-portal-inmobiliario Specification

## Purpose
Publicar la oferta inmobiliaria de la comunidad (arriendo/venta) en una vitrina con catálogo visual, filtros de búsqueda y contacto seguro mediante leads, sincronizada con el estado de ocupación declarado en VU. Fuente de verdad: `Data/NSGC/docs/especificaciones/PI - Portal Inmobiliario.md`.
## Requirements
### Requirement: Publicación Automática por Trigger de Estado (VU)
El sistema MUST publicar automáticamente una unidad en la vitrina cuando el vínculo del propietario (`vinculos.rol = "propietario"`) marca `estadoOcupacionPropiedad` con un estado inmobiliario de oferta ("En Arriendo" o "En Venta" de `maestros.estadosInmobiliarios`), y MUST retirarla (desactivar) cuando el estado cambia a uno sin oferta. El alta, edición y baja de publicaciones se gestiona con `removePublicacionPortal` (store) y la API REST `/api/publicaciones-portal` (POST upsert idempotente; PUT/DELETE en `/[id]`, con borrado bloqueado si la publicación tiene leads); la reactivación y el retiro por cambio de estado del vínculo los aplica `syncPublicacionesDesdeVinculos`.

#### Scenario: Propietario activa la oferta
- **WHEN** se guarda un vínculo de propietario cuyo `estadoOcupacionPropiedad` pasa a "En Arriendo" o "En Venta"
- **THEN** el store crea (o reactiva) la publicación de esa unidad con la operación correspondiente
- **AND** emite el evento AM `PI_PROPERTY_LISTED`

#### Scenario: Estado deja de ser ofertable
- **WHEN** el estado del vínculo cambia a un estado sin oferta (ej. "Habitada")
- **THEN** la publicación queda desactivada (sin borrarse, para conservar histórico) y se emite `PI_PROPERTY_UNLISTED`

#### Scenario: Unidad inexistente rechazada
- **WHEN** la API `/api/publicaciones-portal` recibe un `unidadId` que no existe en `unidades`
- **THEN** rechaza el alta con error de integridad referencial y no crea la publicación

### Requirement: Catálogo Visual y Ficha Detallada
La vitrina `/comunidad/portal` MUST mostrar un catálogo tipo grilla/tarjetas con foto principal (metadatos), precio, tipo de operación y características básicas (dormitorios/baños derivados de la unidad), y etiquetas de estado ("Disponibilidad Inmediata", "Próximamente Disponible") según lo definido en MP/VU. Al seleccionar una tarjeta MUST mostrarse la ficha detallada: galería completa, URL de mapa interactivo, condiciones contractuales y descripción.

#### Scenario: Tarjeta con datos mínimos
- **WHEN** un usuario autorizado abre la vitrina
- **THEN** cada tarjeta muestra foto principal (metadatos: nombre, tipo MIME, tamañoKB, url), precio, operación y dormitorios/baños

#### Scenario: Ficha detallada
- **WHEN** el usuario hace clic en una tarjeta
- **THEN** ve la galería de imágenes completa, el mapa (URL externa), condiciones contractuales y descripción

#### Scenario: Imágenes por referencia (D1)
- **WHEN** la publicación registra imágenes para la galería
- **THEN** cada imagen guarda solo metadatos (nombre, tipo MIME, tamañoKB, url)
- **AND** ningún payload base64/Blob entra al store

### Requirement: Filtros de Búsqueda del Catálogo
La vitrina MUST permitir filtrar publicaciones activas por tipo de operación (venta/arriendo), rango de precio y cantidad de dormitorios.

#### Scenario: Filtrar por operación y precio
- **WHEN** el usuario aplica filtros de operación "Arriendo" y rango de precio
- **THEN** el catálogo muestra solo publicaciones activas que cumplen ambos criterios

### Requirement: Contacto Seguro con Lead ("Me Interesa")
La vitrina MUST ofrecer un botón "Me Interesa" que registre un lead mediante `POST /api/leads-portal` con los datos de contacto del interesado y notifique al propietario o corredor a cargo con una notificación de bandeja (canal `email_simulado`), sin revelar datos personales del propietario en la vista pública.

#### Scenario: Lead genera notificación simulada
- **WHEN** un interesado envía el formulario "Me Interesa"
- **THEN** `POST /api/leads-portal` persiste el lead y crea una notificación dirigida al propietario/corredor con canal `email_simulado`
- **AND** se emite el evento AM `PI_LEAD_CONTACT`

#### Scenario: Datos del dueño no expuestos
- **WHEN** un visitante visualiza una ficha pública
- **THEN** no ve teléfono ni email del propietario; solo el flujo de contacto seguro

### Requirement: Visibilidad del Portal (Residentes o Pública)
La administración MUST poder configurar si el portal es visible solo para residentes autenticados o habilitado como vitrina pública externa. Según RP, solo administración cambia esta configuración; los roles residente/propietario acceden según ella.

#### Scenario: Modo solo residentes
- **WHEN** la visibilidad está configurada como "residentes" y un usuario no autenticado intenta abrir `/comunidad/portal`
- **THEN** el sistema redirige a `/ingresar`

#### Scenario: Cambio de visibilidad restringido
- **WHEN** un rol sin permiso de administración intenta cambiar la visibilidad del portal
- **THEN** el sistema rechaza la operación según RP

### Requirement: Integración con Auditoría y Métricas (AM)
El módulo SHALL emitir eventos `PI_PROPERTY_LISTED`, `PI_PROPERTY_UNLISTED` y `PI_LEAD_CONTACT` como eventos inmutables, con data cuantificable: días publicados de una unidad y cantidad de leads por publicación.

#### Scenario: Métricas de vacancia
- **WHEN** la reportería consulta el movimiento inmobiliario
- **THEN** puede calcular días de publicación por unidad y leads generados a partir de los eventos AM y las fechas de las publicaciones

### Requirement: Setup de portal TEST vía helper compartido
El spec de portal SHALL crear su publicación TEST vía
`e2e/helpers/datos-test` (`crearPublicacionTEST` con unidad del seed +
`snapshotPublicacionesTEST` previo) y limpiarla al final
(`limpiarPublicacionesNuevasTEST` por diferencia + `limpiarPublicacionTEST`),
sin setup inline duplicado. El flujo UI (catálogo, Gestionar vitrina, Nueva
publicación manual) queda idéntico.

#### Scenario: Vitrina TEST y gestión con manual del helper
- **WHEN** existe una publicación TEST creada vía el helper
- **THEN** el catálogo la muestra y la manual creada por la UI se limpia por
  diferencia sin dejar residuos TEST.

### Requirement: API REST de publicaciones del portal
El sistema SHALL exponer `/api/publicaciones-portal` (GET paginado + POST
upsert por id) y `/api/publicaciones-portal/[id]` (GET_ONE, PUT parcial,
DELETE) con scope `comunidadId` (`withComunidadScope`, 404 cross-comunidad):
lectura para cualquier rol autenticado del scope; crear/editar/eliminar solo
administración; DELETE bloqueado con 409 si la publicación tiene leads.

#### Scenario: Publicación TEST vía API visible en la vitrina
- **WHEN** un admin crea una publicación activa vía POST con `unidadId` del seed
- **THEN** responde 201 y la vitrina la muestra en el catálogo.

#### Scenario: Borrado con leads bloqueado
- **WHEN** se pide DELETE de una publicación con leads asociados
- **THEN** responde 409 y la publicación persiste.

### Requirement: API REST de leads del portal
El sistema SHALL exponer `/api/leads-portal` con POST custom: valida que la
publicación exista y esté activa (400 si no), registra el lead (upsert por id)
y notifica al propietario vigente vía bandeja (`email_simulado`) + evento de
auditoría `PI_LEAD_CONTACT`, sin exponer datos del propietario. Crear lead
abierto a cualquier autenticado; leer/gestionar solo administración.

#### Scenario: Interés en publicación activa notifica al propietario
- **WHEN** un usuario autenticado registra interés en una publicación activa
- **THEN** responde 201, el lead queda en BD y se crea la notificación al
  propietario con el contacto del interesado.

#### Scenario: Interés en publicación retirada rechazado
- **WHEN** se registra interés en una publicación inactiva o inexistente
- **THEN** responde 400 y no crea lead ni notificación.

### Requirement: Vitrina del portal con dato de BD
La page `/comunidad/portal` SHALL leer publicaciones y leads vía hooks SWR
(`use-publicaciones-portal`, `use-leads-portal`) en lugar del store legacy,
manteniendo UX y textos (catálogo, filtros, ficha, "Me interesa", gestión de
la vitrina con badges "Activa"/"Retirada").

#### Scenario: Gestión persiste en BD
- **WHEN** un admin crea/edita/activa una publicación desde "Gestionar vitrina"
- **THEN** el cambio persiste en BD (visible tras recargar) y los errores de
  API se muestran en `errorGestion`.

### Requirement: GATED portal con dato TEST propio vía API
El spec GATED de portal SHALL crear su publicación TEST vía API REST (POST
`/api/publicaciones-portal` con unidad del seed vía GET `/api/unidades`) y
limpiarla al final (DELETE), sin depender de QA-Lab "Poblar todo".

#### Scenario: Vitrina TEST de punta a punta sin QA-Lab
- **WHEN** existe una publicación TEST creada vía API
- **THEN** el catálogo la muestra, la gestión la edita y el cleanup no deja
  residuos TEST.

