## MODIFIED Requirements

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

### Requirement: Contacto Seguro con Lead ("Me Interesa")
La vitrina MUST ofrecer un botón "Me Interesa" que registre un lead mediante `POST /api/leads-portal` con los datos de contacto del interesado y notifique al propietario o corredor a cargo con una notificación de bandeja (canal `email_simulado`), sin revelar datos personales del propietario en la vista pública.

#### Scenario: Lead genera notificación simulada
- **WHEN** un interesado envía el formulario "Me Interesa"
- **THEN** `POST /api/leads-portal` persiste el lead y crea una notificación dirigida al propietario/corredor con canal `email_simulado`
- **AND** se emite el evento AM `PI_LEAD_CONTACT`

#### Scenario: Datos del dueño no expuestos
- **WHEN** un visitante visualiza una ficha pública
- **THEN** no ve teléfono ni email del propietario; solo el flujo de contacto seguro
