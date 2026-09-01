## ADDED Requirements

### Requirement: Sincronización de eventos a la capa de datos
El sistema SHALL persistir los eventos de auditoría generados en el cliente hacia la base de datos de forma idempotente y SHALL exponer una API de consulta paginada y filtrada, ambas con scoping multi-tenant por comunidad y sin operaciones de borrado o edición (inmutabilidad).

#### Scenario: Ingesta batch idempotente
- **WHEN** el cliente envía `POST /api/auditoria/sync` con `{ eventos: EventoAuditoria[] }` (máx ~500) autenticado y con membresía en la comunidad
- **THEN** el servidor SHALL hacer `upsert` por `id` para cada evento asignando `comunidadId` de la membresía del usuario autenticado y SHALL responder `{ ok: true, recibidos, persistidos }` sin duplicar filas al reenviar el mismo `id`.

#### Scenario: Consulta paginada con filtros server-side
- **WHEN** un usuario autenticado con membresía hace `GET /api/auditoria?categoria=&tipoAccion=&q=&page=&pageSize=`
- **THEN** el servidor SHALL responder `{ total, page, pageSize, eventos }` con eventos de su comunidad ordenados `timestamp` desc, aplicando filtros opcionales `categoria` exacto, `tipoAccion` exacto y `q` por substring case-insensitive sobre `descripcion`, `tipoAccion` y `referenciaId`, con paginación server-side.

#### Scenario: Aislamiento multi-tenant
- **WHEN** un usuario con membresía solo en comunidad A consulta o sincroniza eventos
- **THEN** el sistema SHALL exponer/afectar únicamente eventos de la comunidad A y SHALL no filtrar ni escribir eventos de otras comunidades.

#### Scenario: Autenticación y autorización
- **WHEN** una petición a `/api/auditoria/*` llega sin sesión válida
- **THEN** el servidor SHALL responder 401; y si el usuario no tiene membresía en la comunidad derivada, SHALL responder 403.

#### Scenario: Cliente sync con debounce
- **WHEN** el store de auditoría (`eventos`) cambia en el cliente con sesión activa
- **THEN** el cliente SHALL acumular solo el delta no persistido (Set de ids ya enviados en memoria del módulo) y SHALL hacer `POST /api/auditoria/sync` con el delta a los 2s del último cambio (debounce), sin bloquear la UI; si el POST responde 401 SHALL marcar los ids del batch como fallidos sin reintento en loop y esperar el próximo cambio.

#### Scenario: Inmutabilidad
- **WHEN** un evento ha sido persistido
- **THEN** el sistema SHALL no exponer ni ejecutar operaciones de borrado o edición sobre `EventoAuditoria` (solo upsert idempotente y lectura).
