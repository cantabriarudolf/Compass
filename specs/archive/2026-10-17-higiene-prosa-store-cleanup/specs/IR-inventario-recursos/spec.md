## MODIFIED Requirements

### Requirement: Estados del Activo y Baja Documentada
Los activos mobiliarios e infraestructura MUST transicionar entre Disponible, En Uso, Reparación y Baja mediante la API REST `PUT /api/ir/recursos/[id]`. El paso a Reparación MUST auditarse como `IR_ASSET_REPAIR` y el paso a Baja (pérdida, robo o fin de vida útil) MUST quedar registrado para alimentar el ratio de pérdida/daño de herramientas.

#### Scenario: Reparación auditada
- **WHEN** una cortadora de arbustos pasa a Reparación
- **THEN** se emite `IR_ASSET_REPAIR` con referencia al recurso

#### Scenario: Baja por pérdida
- **WHEN** se marca una escalera como Baja
- **THEN** el cambio queda auditado y el activo sale del stock operativo
