## ADDED Requirements

### Requirement: Publicación Automática por Trigger de Estado (VU)
El sistema MUST publicar automáticamente una unidad en la vitrina cuando el vínculo del propietario (`vinculos.rol = "propietario"`) marca `estadoOcupacionPropiedad` con un estado inmobiliario de oferta ("En Arriendo" o "En Venta" de `maestros.estadosInmobiliarios`), y MUST retirarla (desactivar) cuando el estado cambia a uno sin oferta. La publicación se gestiona con `savePublicacionPortal`/`removePublicacionPortal` retornando `StoreResult`.

#### Scenario: Propietario activa la oferta
- **WHEN** se guarda un vínculo de propietario cuyo `estadoOcupacionPropiedad` pasa a "En Arriendo" o "En Venta"
- **THEN** el store crea (o reactiva) la publicación de esa unidad con la operación correspondiente
- **AND** emite el evento AM `PI_PROPERTY_LISTED`

#### Scenario: Estado deja de ser ofertable
- **WHEN** el estado del vínculo cambia a un estado sin oferta (ej. "Habitada")
- **THEN** la publicación queda desactivada (sin borrarse, para conservar histórico) y se emite `PI_PROPERTY_UNLISTED`

#### Scenario: Unidad inexistente rechazada
- **WHEN** `savePublicacionPortal` recibe un `unidadId` que no existe en `unidades`
- **THEN** retorna `{ok:false}` con error de integridad referencial y no muta el estado

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
La vitrina MUST ofrecer un botón "Me Interesa" que registre un lead (`saveLeadPortal`) con los datos de contacto del interesado y notifique al propietario o corredor a cargo mediante `notify()` con canal `email_simulado`, sin revelar datos personales del propietario en la vista pública.

#### Scenario: Lead genera notificación simulada
- **WHEN** un interesado envía el formulario "Me Interesa"
- **THEN** `saveLeadPortal` persiste el lead y `notify()` crea una notificación dirigida al propietario/corredor con canal `email_simulado`
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
