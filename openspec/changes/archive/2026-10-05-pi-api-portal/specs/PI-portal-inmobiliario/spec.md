## ADDED Requirements

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
