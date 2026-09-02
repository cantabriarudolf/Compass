## ADDED Requirements

### Requirement: Ingreso manual a fondo
El sistema SHALL permitir registrar ingresos directos a un fondo mediante `registrarIngresoFI(input)` retornando `StoreResult`, con campos `fecha` (ISO AAAA-MM-DD), `monto` mayor a cero, `concepto` no vacío, `fondoId` existente y `familia` opcional, sin origen en cobros. El ingreso se persiste con id `fi-ing-*`, se valida por zod y por existencia del fondo, y audita `FI_INGRESO_REGISTRADO` categoría FI. La acción SHALL validar hidratación previa y SHALL rechazar fondo inexistente, monto ≤0 o concepto vacío.

#### Scenario: Registro válido de ingreso manual
- **WHEN** se invoca `registrarIngresoFI({fecha:"2026-09-01", monto:50000, concepto:"Aporte extraordinario", fondoId:"fondo-gc"})` con fondo existente
- **THEN** retorna `{ok:true}`, el ingreso queda en `ingresosFI` con id `fi-ing-*` y se registra evento `FI_INGRESO_REGISTRADO`

#### Scenario: Fondo inexistente rechazado
- **WHEN** se intenta registrar un ingreso con `fondoId` que no existe en `fondosFI`
- **THEN** retorna `{ok:false}` con error que cita fondo inexistente y no muta `ingresosFI`

#### Scenario: Monto no positivo o concepto vacío rechazado
- **WHEN** se envía `monto <=0` o `concepto` vacío
- **THEN** retorna `{ok:false}` por validación zod y no muta `ingresosFI`

#### Scenario: Ingreso manual contribuye al saldo del fondo
- **WHEN** un fondo tiene ingresos manuales registrados
- **THEN** `saldoFondo(fondoId)` los incluye como ingresos junto a cobros y aportes menos egresos

### Requirement: Saldo de apertura de fondo
Los fondos MAY tener campo opcional `saldoInicial` (number, default 0) editable en UI que `saldoFondo(fondoId, ctx)` SHALL sumar como `(ctx.saldoInicialPorFondo?.[fondoId] ?? 0)` a `ingresosCobros + aportes − egresos`. Con `saldoInicial` 0 el saldo es fiel al flujo; con valor ajustado cuadra contra el libro. El cálculo con el nuevo parámetro opcional NO SHALL cambiar resultados existentes cuando no se provee mapa.

#### Scenario: Saldo con apertura cuadrada
- **WHEN** un fondo tiene `saldoInicial = 17082694` y movimientos netos −17082694
- **THEN** `saldoFondo` retorna 0

#### Scenario: Compatibilidad hacia atrás sin saldoInicial
- **WHEN** se calcula saldo sin proveer `saldoInicialPorFondo` o con fondo sin `saldoInicial`
- **THEN** el resultado coincide con el cálculo previo (default 0) y los 462 tests existentes siguen verdes

#### Scenario: Edición de saldo de apertura en UI
- **WHEN** el usuario edita el campo "Saldo de apertura" de un fondo y guarda
- **THEN** `saveFondoFI` persiste `saldoInicial` validado por zod y el saldo derivado refleja el nuevo valor
