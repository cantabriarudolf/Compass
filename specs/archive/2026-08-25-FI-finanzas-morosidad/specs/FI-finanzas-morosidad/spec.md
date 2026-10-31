# FI-finanzas-morosidad (delta del change FI-finanzas-morosidad)

## ADDED Requirements

### Requirement: Maestro de Fondos con Imputación
El sistema MUST mantener N fondos (cajas) mediante `saveFondoFI`/`removeFondoFI` retornando `StoreResult`, con nombre, tipo (`gasto_comun`|`reserva`|`especial`|`amenities`), descripción opcional, `porcentajeAporte` para fondos de reserva y flag activo. Todo egreso y todo cobro MUST imputarse a un fondo existente y activo. La eliminación de un fondo con movimientos asociados MUST bloquearse. El saldo de cada fondo SHALL ser derivable en base caja: pagos recibidos en cobros del fondo más aportes de reserva registrados, menos egresos del fondo.

#### Scenario: Fondo con movimientos no eliminable
- **WHEN** se intenta eliminar un fondo con egresos o cobros imputados
- **THEN** retorna `{ok:false}` citando la cantidad de movimientos asociados

#### Scenario: Saldo derivable por fondo
- **WHEN** se consultan los fondos tras emitir GC y registrar pagos
- **THEN** cada fondo reporta su saldo calculado desde sus movimientos sin almacenarlo

### Requirement: Egresos Categorizados con Comprobante D1
El sistema MUST registrar salidas de dinero mediante `saveEgresoFI`/`removeEgresoFI` retornando `StoreResult`, con folio FE-*, fecha, categoría (sueldos, mantención, servicios, administración, uso_de_fondo, otro), monto mayor a cero, fondo de imputación obligatorio (por defecto el de gasto común), marca recurrente/fijo que alimenta el termómetro de presupuesto, comprobante digitalizado como metadatos D1 (nombre/tipoMime/tamañoKB/URL, jamás base64/Blob) y gastos diferenciados opcionales por micro sectores.

#### Scenario: Egreso recurrente con comprobante
- **WHEN** se registra "Sueldo conserje" categoría Sueldos, recurrente, con boleta por URL e imputado al Fondo de Gasto Común
- **THEN** persiste con folio FE-* y evento `FI_EGRESS_CREATED`

#### Scenario: Egreso sin fondo o con comprobante embebido rechazado
- **WHEN** falta el fondo de imputación o el comprobante llega como data-URL/base64
- **THEN** retorna `{ok:false}` sin mutar el estado

### Requirement: Emisión de Gasto Común Modalidad Fija y Prorrateo
El sistema MUST generar la deuda mensual mediante `emitirGastoComun({periodo, gastoTotal?})` retornando `StoreResult`, leyendo el modo de `configuracion.modoCalculoGC` (CF): en modo fijo consulta el Monto Fijo (`montoBaseGc`) del tipo de unidad; en modo prorrateo exige gasto total a recaudar mayor a cero y calcula `(Gasto Total × % prorrateo de la unidad)`. Debe validar antes de emitir: configuración CF cargada (`modoCalculoGC` definido; si no, error "CF no cargado"), periodo no procesado previamente y todas las unidades elegibles con responsable de cobro asignado (propietario vigente). La emisión materializa una emisión con líneas por unidad y crea un cobro por unidad imputado al fondo de gasto común con vencimiento según `diaCortePago`.

#### Scenario: Emisión fija usa el monto base del tipo
- **WHEN** se emite el periodo en modo fijo con unidades de tipos de $80.000 y $120.000
- **THEN** cada cobro queda por el monto base de su tipo de unidad

#### Scenario: Emisión prorrateo reparte el gasto total
- **WHEN** se emite en modo variable un gasto total de $1.000.000 con unidades de coeficientes 50% y 25%
- **THEN** los cobros quedan en $500.000 y $250.000 respectivamente

#### Scenario: Periodo repetido rechazado
- **WHEN** se intenta emitir un periodo ya procesado
- **THEN** retorna `{ok:false}` sin duplicar cobros

#### Scenario: Unidad sin responsable de cobro bloquea la emisión
- **WHEN** existe una unidad elegible sin propietario vigente al momento de emitir
- **THEN** retorna `{ok:false}` indicando la unidad, sin crear la emisión

#### Scenario: CF sin carga bloquea FI
- **WHEN** se intenta emitir con `configuracion.modoCalculoGC` undefined
- **THEN** retorna `{ok:false}` con "CF no cargado" y no muta colecciones financieras

### Requirement: Fondo de Reserva con Aporte Automático y Retiros Documentados
El sistema MUST aplicar automáticamente el porcentaje definido en el fondo de reserva (`porcentajeAporte`) sobre el total emitido en cada emisión GC, registrando el aporte en la emisión. Los retiros de fondo de reserva MUST registrarse mediante `retirarFondoFI` como egreso `uso_de_fondo` con aprobación documentada referenciando un acta GD publicada y validación de saldo suficiente; audita `FI_FUND_WITHDRAWN`.

#### Scenario: Aporte automático al emitir
- **WHEN** se emite un periodo por $2.000.000 con fondo de reserva al 5%
- **THEN** la emisión registra un aporte de $100.000 al fondo de reserva

#### Scenario: Retiro sin acta publicada rechazado
- **WHEN** se retira del fondo de reserva sin acta GD publicada de respaldo o superando el saldo
- **THEN** retorna `{ok:false}` y no genera el egreso

### Requirement: Control de Morosidad y Cobranza Activa
El sistema SHALL calcular la mora sobre cobros vencidos usando `diaCortePago` (CF) como referencia de vencimiento: `aplicarMoraFI(cobroId, tasaMensualPct?)` propone y aplica la mora pro-rata por días de atraso (idempotente por día) auditando `FI_MORA_APPLIED`. El dashboard de corte de servicios SHALL resaltar exclusivamente las unidades cuya cantidad de periodos vencidos alcanza o supera `limiteMesesAvisoCorte` (CF), y `enviarCobranzaFI(unidadId)` MUST registrar gestiones notificando al responsable de cobro con canal email_simulado y auditando `FI_COBRANZA_SENT`.

#### Scenario: Mora propuesta tras el día de corte
- **WHEN** un cobro de $200.000 acumula 15 días de atraso y se aplica mora al 1% mensual
- **THEN** se registra una mora de $1.000 lista para el cobro y el evento `FI_MORA_APPLIED`

#### Scenario: Panel de corte de servicios
- **WHEN** una unidad arrastra tantos periodos vencidos como el límite configurado
- **THEN** aparece destacada en el panel de corte de suministro

#### Scenario: Gestión de cobranza auditada
- **WHEN** la administración envía la gestión de cobranza a una unidad morosa
- **THEN** el responsable recibe notificación email_simulado y queda registrado `FI_COBRANZA_SENT`

### Requirement: Pagos con Ajuste Manual e Informe de Diferencia Inmutable
Al recibir un pago, el sistema MUST cargar el monto exigible exacto (deuda base + moras − pagos previos) mediante `registrarPagoFI(cobroId, pago)`. Si el administrador ingresa un monto distinto (descuento a favor del residente o recargo a favor de la comunidad), el sistema MUST exigir justificación obligatoria, procesar el pago y generar un informe de diferencia inmutable (sin acciones de edición ni borrado) que registra esperado, recibido, diferencia, tipo y justificación; audita `FI_RECEIVE_PAYMENT` y, ante ajuste, también `FI_MANUAL_DISCOUNT`.

#### Scenario: Pago exacto cierra el cobro
- **WHEN** se registra un pago igual al exigible de un cobro vencido con mora
- **THEN** el cobro queda pagado con deuda base y mora cubiertas

#### Scenario: Descuento sin justificación rechazado
- **WHEN** se registra un pago menor al exigible sin texto justificativo
- **THEN** retorna `{ok:false}` exigiendo la justificación del ajuste

#### Scenario: Informe de diferencia inmutable
- **WHEN** se procesa un pago ajustado con justificación
- **THEN** la diferencia queda registrada de forma inmutable con tipo descuento/recargo, montos y fecha, junto a los eventos de auditoría

### Requirement: Integración con Auditoría y Métricas (AM)
El módulo SHALL emitir `FI_EMISION_GC`, `FI_EGRESS_CREATED`, `FI_MORA_APPLIED`, `FI_RECEIVE_PAYMENT`, `FI_MANUAL_DISCOUNT`, `FI_COBRANZA_SENT` y `FI_FUND_WITHDRAWN` como eventos inmutables con data cuantificable: montos emitidos vs recaudados, diferencias por ajustes manuales, gestiones de cobranza realizadas, índice de morosidad y recaudación por fondo derivables de las colecciones.

#### Scenario: Auditoría completa del ciclo
- **WHEN** ocurren emisión, egreso, mora, pago ajustado y cobranza
- **THEN** cada acción registra su evento con montos legibles sin mutar colecciones históricas
