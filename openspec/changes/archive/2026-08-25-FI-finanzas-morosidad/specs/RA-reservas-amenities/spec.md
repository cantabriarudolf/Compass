# RA-reservas-amenities (delta del change FI-finanzas-morosidad)

## MODIFIED Requirements

### Requirement: Cancelaciones y Penalización Tardía
El sistema MUST permitir cancelar mediante `cancelarReservaRA` solo reservas confirmadas, registrando fecha de cancelación; cuando faltan ≤ `cancelacionTardiaDias` días para la reserva, MUST marcarla como tardía y derivar la `penalizacionTardiaMonto` del elemento como cobro real al fondo de amenities en Finanzas, materializando `cargoFIReferencia` con el id del cobro. Toda cancelación audita `RA_BOOKING_CANCELLED`.

#### Scenario: Cancelación anticipada sin cargo
- **WHEN** se cancela una reserva con holgura mayor a la ventana de tardía
- **THEN** queda cancelada con `tardia:false` y sin penalización

#### Scenario: Penalización por tardía
- **WHEN** se cancela dentro de la ventana definida y el elemento fija penalización $5.000
- **THEN** la cancelación registra `tardia:true`, penalización $5.000 y un cobro FI de $5.000 imputado al fondo de amenities referenciado desde `cargoFIReferencia`

### Requirement: Gestión de Garantías y Centro de Costos
Cada reserva MUST conservar el snapshot del monto de garantía exigido. Ante daño del activo, el sistema MUST retener la garantía mediante `retenerGarantiaRA(id, motivo)` dejando registro `{monto, motivo}`, notificando a administración/conserjería vía `notify()` y auditando `RA_WARRANTY_RETAINED`. Todo cobro por tarifa, penalización o garantía retenida MUST materializarse como cobro real en el libro de Finanzas imputado al Fondo Específico de Amenities, y `cargoFIReferencia` guarda el id del cobro creado (el valor `"pendiente"` solo persiste en registros históricos previos a la conexión FI).

#### Scenario: Retención por daño
- **WHEN** la hidrolavadora vuelve dañada y se retiene la garantía con motivo
- **THEN** la reserva registra la retención, se emite `RA_WARRANTY_RETAINED`, se notifica email_simulado y existe en FI un cobro por la garantía referenciado desde `cargoFIReferencia`

#### Scenario: Cobros pendientes a FI
- **WHEN** se confirma una reserva con tarifa mayor a $0 o se cancela tardíamente con penalización
- **THEN** el ingreso queda registrado como cobro del fondo de amenities y `cargoFIReferencia` referencia su id

### Requirement: Validación de Morosidad (gate FI)
El sistema MUST bloquear la creación de reservas de solicitantes con deuda vencida reportada por Finanzas (cobros exigibles no pagados cuya fecha de vencimiento ya pasó) sobre las unidades donde mantienen vínculo vigente. Con la conexión de FI el gate está activo: `saveReservaRA` retorna `{ok:false}` describiendo la deuda pendiente.

#### Scenario: Gate inerte hoy
- **WHEN** un solicitante sin historial financiero solicita una reserva válida
- **THEN** la reserva se confirma normalmente

#### Scenario: Solicitante moroso bloqueado
- **WHEN** una persona con deuda vencida en alguna de sus unidades vinculadas solicita una reserva válida
- **THEN** la reserva es rechazada indicando la deuda pendiente en Finanzas

#### Scenario: Solicitante al día confirmado
- **WHEN** un solicitante sin deuda vencida solicita una reserva válida
- **THEN** la reserva se confirma normalmente
