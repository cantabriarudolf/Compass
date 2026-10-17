# RA-reservas-amenities Specification

## Purpose
Maestro de elementos reservables (espacios comunes y activos mobiliarios) con motor de calendario que previene overbooking por conflicto horario, cobra tarifas de uso y gestiona garantías por daños como centro de costos del Fondo de Amenities. Fuente de verdad: `Data/NSGC/docs/especificaciones/RA - Reservas y Amenities.md`.

## Requirements

### Requirement: Maestro de Elementos Reservables
El sistema MUST permitir a la administración configurar qué se puede reservar mediante `saveElementoRA` (store) y la API REST `/api/ra/elementos` (POST upsert idempotente; PUT/DELETE en `/[id]`), con tipo (Espacio Físico o Activo Mobiliario), ubicación por referencia al micro sector EF o al activo del catálogo IR, lógica de franjas horarias (bloques de N horas o día completo), tarifa de uso por bloque/día ($0 = gratis), garantía requerida, aforo para espacios o stock de unidades idénticas, y reglas especiales de anticipación mínima y penalización por cancelación tardía. La eliminación MUST bloquearse si el elemento tiene reservas no canceladas.

#### Scenario: Quincho con bloques y garantía
- **WHEN** se crea "Quincho TEST" (espacio físico, bloques de 3 horas, tarifa $15.000, garantía $20.000) vinculado a un micro sector EF
- **THEN** persiste activo y disponible en el maestro

#### Scenario: Activo mobiliario con stock
- **WHEN** se registra una hidrolavadora con stock 2 desde un activo IR
- **THEN** el motor admite hasta 2 reservas simultáneas sobre ese elemento

#### Scenario: Elemento con reservas no eliminable
- **WHEN** se intenta eliminar un elemento con reservas confirmadas
- **THEN** la eliminación se rechaza (409 en la API y `{ok:false}` en el store) citando la cantidad de reservas vinculadas

### Requirement: Motor de Calendario y Prevención de Overbooking
El sistema MUST confirmar reservas mediante `saveReservaRA` retornando `StoreResult`, validando existencia y vigencia del elemento y del solicitante en MP, horario coherente (horaInicio < horaFin) y anticipación mínima según la regla del elemento. La confirmación MUST rechazar todo solapamiento horario sobre la misma fecha cuando las reservas confirmadas concurrentes alcanzan el stock del elemento (`inicioA < finB && inicioB < finA`; día completo ocupa 00:00–23:59). Toda reserva confirmada audita `RA_BOOKING_CREATED` con snapshot de tarifa y garantía vigentes.

#### Scenario: Solapamiento rechazado
- **WHEN** existe una reserva confirmada de 19:00 a 22:00 y otra solicitud pide 20:00–23:00 sobre el mismo espacio
- **THEN** retorna `{ok:false}` por conflicto horario sin mutar el calendario

#### Scenario: Stock absorbe reservas paralelas
- **WHEN** un elemento con stock 2 recibe dos reservas en el mismo horario
- **THEN** ambas se confirman; una tercera en el mismo tramo es rechazada

#### Scenario: Anticipación mínima exigida
- **WHEN** el elemento exige 2 días de anticipación y la reserva pide mañana
- **THEN** retorna `{ok:false}` explicando la anticipación requerida

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

### Requirement: Integración con Auditoría y Métricas (AM)
El módulo SHALL emitir `RA_BOOKING_CREATED`, `RA_BOOKING_CANCELLED` y `RA_WARRANTY_RETAINED` como eventos inmutables con data cuantificable: número de reservas por amenity, ingresos por tarifas de uso, garantías retenidas y cancelaciones tardías derivables de las colecciones.

#### Scenario: Ranking de demanda derivable
- **WHEN** la reportería agrupa reservas confirmadas por elemento
- **THEN** obtiene ranking de demanda y tasa de uso sin cálculos externos
