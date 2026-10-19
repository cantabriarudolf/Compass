## MODIFIED Requirements

### Requirement: Maestro de Fondos con Imputación
El sistema MUST mantener N fondos (cajas) mediante `saveFondoFI` (store) y la API REST `/api/fondos-fi` (POST upsert idempotente; PUT/DELETE en `/[id]`), retornando `StoreResult` cuando aplica, con nombre, tipo (`gasto_comun`|`reserva`|`especial`|`amenities`), descripción opcional, `porcentajeAporte` para fondos de reserva y flag activo. Todo egreso y todo cobro MUST imputarse a un fondo existente y activo. La eliminación de un fondo con movimientos asociados MUST bloquearse. El saldo de cada fondo SHALL ser derivable en base caja: pagos recibidos en cobros del fondo más aportes de reserva registrados, menos egresos del fondo.

#### Scenario: Fondo con movimientos no eliminable
- **WHEN** se intenta eliminar un fondo con egresos o cobros imputados
- **THEN** la eliminación se rechaza (409 en la API y `{ok:false}` en el store) citando la cantidad de movimientos asociados

#### Scenario: Saldo derivable por fondo
- **WHEN** se consultan los fondos tras emitir GC y registrar pagos
- **THEN** cada fondo reporta su saldo calculado desde sus movimientos sin almacenarlo

### Requirement: Egresos Categorizados con Comprobante D1
El sistema MUST registrar salidas de dinero mediante `saveEgresoFI` (store) y la API REST `/api/egresos-fi` (POST upsert idempotente; PUT/DELETE en `/[id]`), retornando `StoreResult` cuando aplica, con folio FE-*, fecha, categoría (sueldos, mantención, servicios, administración, uso_de_fondo, otro), monto mayor a cero, fondo de imputación obligatorio (por defecto el de gasto común), marca recurrente/fijo que alimenta el termómetro de presupuesto, comprobante digitalizado como metadatos D1 (nombre/tipoMime/tamañoKB/URL, jamás base64/Blob) y gastos diferenciados opcionales por micro sectores.

#### Scenario: Egreso recurrente con comprobante
- **WHEN** se registra "Sueldo conserje" categoría Sueldos, recurrente, con boleta por URL e imputado al Fondo de Gasto Común
- **THEN** persiste con folio FE-* y evento `FI_EGRESS_CREATED`

#### Scenario: Egreso sin fondo o con comprobante embebido rechazado
- **WHEN** falta el fondo de imputación o el comprobante llega como data-URL/base64
- **THEN** retorna `{ok:false}` sin mutar el estado

### Requirement: Ingreso manual a fondo
El sistema SHALL permitir registrar ingresos directos a un fondo mediante `POST /api/ingresos-fi` (upsert idempotente por id, admin), con campos `fecha` (ISO AAAA-MM-DD), `monto` mayor a cero, `concepto` no vacío, `fondoId` existente y `familia` opcional, sin origen en cobros. El ingreso se persiste con id `fi-ing-*`, se valida por zod y por existencia y vigencia del fondo, y audita `FI_INGRESO_REGISTRADO` categoría FI. La ruta SHALL rechazar fondo inexistente o inactivo, monto ≤0 o concepto vacío.

#### Scenario: Registro válido de ingreso manual
- **WHEN** se invoca `POST /api/ingresos-fi` con `{fecha:"2026-09-01", monto:50000, concepto:"Aporte extraordinario", fondoId:"fondo-gc"}` y el fondo existe
- **THEN** responde 201, el ingreso queda persistido con id `fi-ing-*` y se registra evento `FI_INGRESO_REGISTRADO`

#### Scenario: Fondo inexistente rechazado
- **WHEN** se intenta registrar un ingreso con `fondoId` que no existe en `fondosFI`
- **THEN** responde 400 con error que cita fondo inexistente y no crea el ingreso

#### Scenario: Monto no positivo o concepto vacío rechazado
- **WHEN** se envía `monto <=0` o `concepto` vacío
- **THEN** responde 400 por validación zod y no crea el ingreso

#### Scenario: Ingreso manual contribuye al saldo del fondo
- **WHEN** un fondo tiene ingresos manuales registrados
- **THEN** `saldoFondo(fondoId)` los incluye como ingresos junto a cobros y aportes menos egresos
