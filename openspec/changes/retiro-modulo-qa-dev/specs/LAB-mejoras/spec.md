## REMOVED Requirements

### Requirement: Fase 5 Laboratorio y Automatización

**Reason**: la fase y el contenedor viven en `app/admin/dev-dashboard`, retirado en este mismo change (F9). La fase no existe sin su tablero.

**Migration**: el plan de fases queda en `Data/NSGC/docs/manuales/01 - Plan de Avance.md` como registro histórico; no se re-aloja.

### Requirement: Vínculos en nueva ventana desde Cómo va quedando

**Reason**: la fila `Cómo va quedando` pertenecía a `app/admin/qa-lab`, retirado en este change.

**Migration**: ninguna; se retira con su pantalla. Los vínculos entre unidades se gestionan en `/comunidad/personas` y `/inventario/estructura` por sus propias rutas API.

### Requirement: Screenshots automatizados (futuro)

**Reason**: mejora planificada del laboratorio retirado; nunca se implementó.

**Migration**: ninguna; el backlog asociado desaparece con el módulo.

### Requirement: QA-Lab pobla Portal Inmobiliario vía API REST

**Reason**: el poblador era una acción del Laboratorio, retirado en este change.

**Migration**: el poblado de mocks se hace con los scripts `seed:mocks` y `db:*` sobre la base, no desde una UI.

### Requirement: QA-Lab pobla Remuneraciones vía API con adelanto legacy

**Reason**: idem anterior; el cargador vivía en el Laboratorio.

**Migration**: idem anterior (`seed:mocks`, `db:*`).

### Requirement: Guard clean-first e higiene en ambos mundos

**Reason**: el guard clean-first era del ciclo del Laboratorio (limpiar → poblar → validar) y su pantalla ya no existe.

**Migration**: la higiene de base sigue disponible como `npm run e2e:higiene` (dry-run por defecto), contrato que permanece en `DEV-qa-lab`.

### Requirement: QA-Lab pobla Estructura Física FI vía API REST

**Reason**: el poblador era una acción del Laboratorio, retirado en este change.

**Migration**: idem anterior (`seed:mocks`, `db:*`).

### Requirement: QA-Lab pobla Certificados de Trabajo CT vía API REST

**Reason**: idem anterior.

**Migration**: idem anterior (`seed:mocks`, `db:*`).

### Requirement: Purga bulk TEST en el QA-Lab vía endpoint único

**Reason**: el endpoint era `POST /api/qa-lab/purga-test`, eliminado en este change.

**Migration**: la purga de filas TEST en base queda en `npm run e2e:higiene -- --apply`. La purga del store del navegador no se re-aloja: el retiro del módulo dejó la clave `compass-store` sin UI (ver F22a en `openspec/PENDIENTES-FUNCIONALIDAD.md`).
