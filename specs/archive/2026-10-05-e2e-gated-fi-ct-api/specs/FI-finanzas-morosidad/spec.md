## ADDED Requirements

### Requirement: GATED pagos con dato TEST propio vía API
El spec GATED de pagos SHALL crear su cobro pendiente TEST vía API REST
(POST `/api/unidades` + POST `/api/cobros-fi`, fondo del seed vía GET
`/api/fondos-fi`) y limpiarlo al final (PUT reset de pagos + DELETE), sin
depender de QA-Lab "Poblar todo" ni de inyección localStorage.

#### Scenario: Cobro TEST pendiente se paga en la UI
- **WHEN** existe un cobro pendiente TEST creado vía API
- **THEN** la fila aparece en el Libro de cobros, Registrar pago lo marca
  pagado y el cleanup no deja residuos TEST.

#### Scenario: Cleanup con cobro pagado
- **WHEN** el cobro TEST ya tiene pagos (DELETE bloqueado 409)
- **THEN** el spec resetea pagos vía PUT antes del DELETE.
