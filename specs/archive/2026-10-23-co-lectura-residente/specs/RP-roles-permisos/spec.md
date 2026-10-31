## ADDED Requirements

### Requirement: Recursos de Comunicación con Vecinos

La matriz de permisos MUST distinguir la difusión masiva del buzón ciudadano y MUST
reservar el desglose nominativo de lecturas al rol administrador.
Un residente MUST poder escribir por el buzón y MUST NOT poder emitir difusiones.

#### Scenario: Difusión separada del buzón
- **WHEN** se consulta la matriz de permisos
- **THEN** existen los recursos `co` (difusión), `co:buzon` (buzón ciudadano) y `co:lecturas` (desglose nominativo)
- **AND** `co` y `co:buzon` no comparten las mismas acciones por rol

#### Scenario: El residente no emite difusiones
- **WHEN** un residente intenta crear una difusión con `POST /api/co/envios`
- **THEN** el sistema responde 403
- **AND** emite el evento `RP_PERMISSION_DENIED`

#### Scenario: El residente escribe por el buzón
- **WHEN** un residente crea un mensaje con `POST /api/co/mensajes-buzon`
- **THEN** el sistema acepta la creación

#### Scenario: Desglose nominativo reservado
- **WHEN** se consulta la matriz de permisos
- **THEN** el recurso `co:lecturas` solo otorga `ver` al rol administrador
