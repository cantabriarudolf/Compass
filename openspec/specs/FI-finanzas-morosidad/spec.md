# FI-finanzas-morosidad Specification

## Purpose
Centralizar la salud financiera de la comunidad: maestro de fondos con imputación, egresos categorizados con comprobante D1, emisión mensual del Gasto Común en modalidad fija o prorrateo, fondo de reserva con aporte automático, control de morosidad con corte de servicios y cobranza activa, y pagos con ajuste manual auditado. Fuente de verdad: `Data/NSGC/docs/especificaciones/FI - Finanzas y Morosidad.md`.
## Requirements
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

### Requirement: Punto cero histórico 2023-2024
La comunidad SHALL arrancar con la historia real de ingresos y egresos 2023-2024 cargada como línea base: el sistema SHALL exponer el fixture `k0mp4ss_fe/apps/web/data/finanzas/punto-cero-2324.json` (derivado de `Data/NSGC/ingresosvsegresos.23y24/INGvsEGR.xlsx` sin leer el xlsx en runtime) con fondo `fondo-cc-punto-cero` (Cuenta Corriente, tipo gasto_comun, saldoInicial 17082694), 186 egresos (monto, fecha ISO, concepto, familia, categoria mapeada sueldos/mantencion/servicios/administracion/otro, esRecurrente solo "Pago Administración") y 45 ingresos (fecha ISO, monto, concepto, familia). La migración `STORE_VERSION 26→27` SHALL poblar estos datos de forma aditiva e idempotente por IDs deterministas `fondo-cc-punto-cero`, `fi-egr-hist-001..186` (orden fecha ascendente, folio `FE-####` continuo respetando el contador existente sin chocar con seed ni TEST-*) y `fi-ing-hist-001..045`; re-ejecutar la migración NO SHALL duplicar. Tras migrar, `saldoFondo("fondo-cc-punto-cero")` con `saldoInicial` SHALL ser 0 y los totales por año SHALL coincidir con el libro. La fixture y la migración SHALL convivir con el seed NSGC y con datos `TEST-*` sin romper dashboards FI.

#### Scenario: Fixture canónico versionado
- **WHEN** se inspecciona `data/finanzas/punto-cero-2324.json`
- **THEN** contiene `fondoCC` {id:"fondo-cc-punto-cero", nombre:"Cuenta Corriente", tipo:"gasto_comun", saldoInicial:17082694}, 186 egresos y 45 ingresos con fechas ISO, categorías mapeadas según familia y `esRecurrente` solo en "Pago Administración", y 24 entradas `saldoCC`; totales $62.491.011 egresos / $45.408.317 ingresos validados en ETL

#### Scenario: Migración v26→v27 puebla el punto cero de forma idempotente
- **WHEN** `migrate(persistedV26, 26)` corre sobre un store v26 sin el fondo histórico
- **THEN** crea `fondo-cc-punto-cero` con saldoInicial 17082694, inserta 186 egresos con folios `FE-####` únicos y continuos y 45 ingresos con ids `fi-ing-hist-*`; una segunda ejecución no crea duplicados ni nuevos folios

#### Scenario: Folios históricos continúan secuencia sin chocar con seed ni TEST-*
- **WHEN** el store v26 ya contiene egresos con folios `FE-*` (seed o TEST-*)
- **THEN** los 186 históricos usan el rango siguiente del contador `siguienteFolioFE` (max existente +1 .. max+186) sin colisionar y el decision log lo documenta

#### Scenario: Saldo del fondo Cuenta Corriente cuadra con el libro
- **WHEN** se calcula `saldoFondo("fondo-cc-punto-cero", {cobros:[], egresos:egresosHist, emisiones:[], ingresosFI:ingresosHist, saldoInicialPorFondo:{"fondo-cc-punto-cero":17082694}})` sobre el store migrado
- **THEN** retorna 0

#### Scenario: Totales por año coinciden con el libro
- **WHEN** se suman los montos migrados por año
- **THEN** egresos 2023 = 19.506.242, egresos 2024 = 42.984.769, ingresos 2023 = 13.309.017, ingresos 2024 = 32.099.300

#### Scenario: Dashboards FI no rompen tras el punto cero
- **WHEN** se renderizan morosidad/reportes y el store contiene el punto cero
- **THEN** los componentes consumen `fondosFI/egresosFI/ingresosFI` sin error y reflejan los montos históricos en sus agregados

### Requirement: Espejo BD de Finanzas (sync ST)
El sistema SHALL mantener en BD (Prisma/SQLite) un espejo de retención de las colecciones FI `fondosFI` (con `saldoInicial`), `egresosFI` e `ingresosFI` mediante `POST /api/fi/sync`: ingesta batch idempotente (upsert por id, máximo 500 elementos por petición) autenticada, scoped a una comunidad donde el usuario tenga membresía, sin operaciones de delete ni de actualización cruzada de comunidades. El cliente SHALL enviar solo el delta no persistido (Set de ids ya enviados) con debounce de 2 segundos tras el último cambio, sin bloquear la UI; ante respuesta 401 SHALL marcar los ids del batch como fallidos sin reintento en bucle. El sistema SHALL exponer `GET /api/fi` (paginado, filtros `fondoId` y `q`) para verificar el espejo, y un panel read-only en `/finanzas` que muestre totales BD vs store (egresos, ingresos, saldo por fondo) de modo que el punto cero 2023-2024 sea verificable en BD. El store SHALL seguir siendo la fuente de la UI; la BD actúa como espejo de retención.

#### Scenario: Sync batch idempotente del punto cero
- **WHEN** el cliente envía `POST /api/fi/sync` con fondos, egresos e ingresos del punto cero (182 egresos, 44 ingresos, fondo CC con saldoInicial 17082694) y repite el mismo batch
- **THEN** la BD contiene exactamente 182 egresos y 44 ingresos sin duplicados y el fondo Cuenta Corriente conserva su `saldoInicial`

#### Scenario: Cliente sync con debounce y delta
- **WHEN** se registran varios cambios FI consecutivos en menos de 2 segundos
- **THEN** el cliente envía una sola petición con los ids aún no persistidos a los 2 segundos del último cambio, sin bloquear la UI

#### Scenario: Rechazo sin pertenencia a la comunidad
- **WHEN** un usuario autenticado envía `POST /api/fi/sync` con `x-comunidad-id` de una comunidad donde no tiene membresía
- **THEN** la API responde 403 y no persiste ningún elemento del batch

#### Scenario: Batch inválido o excesivo
- **WHEN** el batch supera 500 elementos o ningún elemento tiene forma válida
- **THEN** la API responde 400 sin persistir nada

#### Scenario: 401 sin bucle de reintento
- **WHEN** el POST responde 401 (sesión expirada)
- **THEN** el cliente marca el batch como fallido y no reintenta en bucle; espera el próximo cambio FI

#### Scenario: Verificación del espejo desde /finanzas
- **WHEN** un usuario con sesión consulta el panel "Espejo BD (ST)" en `/finanzas`
- **THEN** ve los totales leídos de BD vía `GET /api/fi` (egresos, ingresos, saldo por fondo) comparados con el store, sin botones de mutación

### Requirement: Setup de pagos TEST vía helper compartido
El spec de pagos SHALL crear su dato TEST vía `e2e/helpers/datos-test`
(`crearUnidadTEST` + `crearCobroTEST` con fondo del seed) y limpiarlo al
final (`limpiarCobroTEST` con reset vía PUT + `limpiarUnidadTEST`), sin setup
inline duplicado. El flujo UI (Libro de cobros, Registrar pago, fila pagada)
queda idéntico.

#### Scenario: Cobro TEST pendiente se paga en la UI
- **WHEN** existe un cobro pendiente TEST creado vía el helper
- **THEN** la fila aparece en el Libro de cobros, Registrar pago lo marca
  pagado y el cleanup no deja residuos TEST.

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

