# 💰 12 - FI - Finanzas y Morosidad

La caja de la comunidad: fondos con imputación obligatoria, egresos categorizados con comprobante digitalizado, emisión mensual del Gasto Común en modalidad fija o prorrateo, fondo de reserva con aporte automático, morosidad con mora pro-rata y corte de servicios, y pagos con ajuste manual auditado.

## 🚀 Funcionalidad Principal

Dos pilares: el **Libro Financiero** concentra todo el movimiento en cobros (`cobrosFI`) imputados a un fondo y egresos (`egresosFI`) que salen de un fondo — el saldo de cada fondo se deriva de sus movimientos (base caja), nunca se almacena; la **Emisión GC** genera la deuda del periodo leyendo el modo de CF (`modoCalculoGC`): fijo toma el monto base del tipo de unidad, variable reparte el gasto total por el coeficiente de prorrateo de cada unidad.

## 🛠️ Secciones

- **Gastos Comunes (`/finanzas/gastos-comunes`)**:
  - **Fondos**: CRUD del maestro de cajas (gasto_comun, reserva con % de aporte, especial, amenities) con campo opcional **Saldo de apertura** (`saldoInicial`) — 0 fiel al flujo, ajustado cuadra el libro; el saldo derivado lo suma. No eliminables con movimientos imputados (incluye ingresos manuales).
  - **Egresos**: registro con folio `FE-####`, categoría (Sueldos, Mantención…), flag recurrente/fijo para el termómetro de presupuesto y comprobante por URL (D1, jamás base64).
  - **Ingresos manuales (P1)**: tab **Ingresos** con form "Registrar ingreso a fondo" (fecha, monto>0, concepto, fondo, familia opcional) + lista ingresos recientes. Sin folio secuencial; audita `FI_INGRESO_REGISTRADO`. Suma al saldo del fondo junto a cobros y aportes.
  - **Punto cero 2023-2024 (P2)**: fondo **Cuenta Corriente** (`fondo-cc-punto-cero`, saldoInicial 17082694) con 182 egresos y 44 ingresos históricos cargados desde `INGvsEGR.xlsx` vía `data/finanzas/punto-cero-2324.json` (migración v27 idempotente, folios `FE-####` continuos). Saldo derivado = 0 (cuadra con Saldo CC del libro).
  - **Emisión GC**: wizard por periodo `AAAA-MM` (no repetible), alcance total o personalizado, vista previa prorrateada; exige propietario vigente en cada unidad incluida y aplica automáticamente el % al Fondo de Reserva.
  - **Morosidad**: tabla de unidades atrasadas con botón "Aplicar mora" (tasa mensual configurable, pro-rata diario), panel destacado de **Corte de Servicios** según `limiteMesesAvisoCorte` y gestión de cobranza notificada.
- **Recaudación (`/finanzas/pagos`)**: libro unificado filtrable por concepto/estado con KPIs recaudado vs por cobrar; detalle por cobro (moras, pagos, diferencias) y registro de pago con exigible exacto (base + moras − pagos previos). Si el monto difiere, la justificación es obligatoria y nace un **informe de diferencia inmutable**.
- **Espejo BD (ST) (`/finanzas`)**: panel read-only de verificación del espejo en la capa de datos persistente (change `fi-sync-bd`). El cliente sync (`lib/fi-sync.ts`) envía a `POST /api/fi/sync` el delta de fondos (con saldo de apertura), egresos e ingresos 2s después del último cambio (debounce, batch ≤500, upsert idempotente, sin delete); el panel consulta `GET /api/fi` y muestra por fondo los totales BD vs Store con badge **Cuadrado/Pendiente-Divergente**. Con BD limpia, el fondo Cuenta Corriente del punto cero cuadra exacto ($17.082.694 apertura / $62.491.011 egresos / $45.408.317 ingresos / saldo $0). El store sigue siendo la fuente de la UI — la BD es espejo de retención/consulta.

## 🔌 Acciones en la capa de datos (API)

El poblamiento del QA-Lab escribe BD vía API REST y lo poblado se ve en las páginas reales (mismo patrón que PI/PL). Tres operaciones quedaron además en el servidor con las reglas del libro:

- **Pago (`POST /api/cobros-fi/[id]/pagar`)**: exige monto > 0, medio de pago y saldo pendiente > 0; si el monto no coincide con el exigible, exige justificación (≥10 caracteres) y agrega la diferencia. Un evento `FI_RECEIVE_PAYMENT` por request.
- **Mora (`POST /api/cobros-fi/[id]/mora`)**: exige vencimiento, tasa > 0, atraso y saldo; **idempotente por día** (repetirla el mismo día no duplica) y un `FI_MORA_APPLIED` solo al aplicar.
- **Retiro de fondo (`POST /api/fondos-fi/[id]/retirar`)**: exige fondo activo, monto > 0, descripción, acta GD publicada cuando se declara (obligatoria en el Fondo de Reserva) y saldo suficiente **calculado contra BD**; crea el egreso `uso_de_fondo` con folio `FE-####` y un `FI_FUND_WITHDRAWN`.

**Higiene TEST**: un cobro `test-*` con pagos puede darse de baja en desarrollo (`DELETE /api/cobros-fi/[id]`), mientras las filas reales siguen bloqueadas con 409. El poblamiento usa períodos dedicados `2019-03` (emisión) y `2019-01` (mora) para no chocar con emisiones reales. Las páginas de FI conservan su cálculo local + `PUT` del cobro: las acciones dedicadas son la vía del servidor y del laboratorio.

## 💡 Tips de Oro

- **Todo pasa por un fondo**: si el gasto o cobro no declara fondo activo, el store lo rechaza; sin Fondo de Gasto Común activo no hay emisión posible.
- **CF manda**: `emitirGastoComun` valida `modoCalculoGC` (error "CF no cargado" si falta), usa `diaCortePago` como día de vencimiento del mes siguiente al periodo y respeta el opt-in `notificarEmisionGC`.
- **Mora con criterio**: solo cobros vencidos; idempotente por día (aplicarla dos veces no duplica); el cálculo es `exigible × tasa% × días/30`.
- **Ajuste = papeleta**: descuentos y recargos exigen justificación ≥10 caracteres y generan diferencia inmutable con eventos `FI_RECEIVE_PAYMENT` + `FI_MANUAL_DISCOUNT` (antifraude).
- **Retiros con acta**: sacar dinero del Fondo de Reserva exige un acta GD Publicada como aprobación documentada y saldo suficiente (`FI_FUND_WITHDRAWN`).
- **Engranajes conectados**: multas aplicadas de IN nacen como cobro real (el % GC se convierte a pesos contra el último GC emitido), tarifas/penalizaciones/garantías de RA caen al Fondo de Amenities, los proyectos de MT validan saldo del fondo que los financia y los residentes con deuda vencida no pueden reservar.
- **Auditoría**: `FI_EMISION_GC`, `FI_EGRESS_CREATED`, `FI_INGRESO_REGISTRADO`, `FI_MORA_APPLIED`, `FI_RECEIVE_PAYMENT`, `FI_MANUAL_DISCOUNT`, `FI_COBRANZA_SENT`, `FI_FUND_WITHDRAWN`.

## 🔗 Dependencias

- **CF**: modo de cálculo, día de corte, límite de meses y opt-in de notificación.
- **EF/TU/VU**: unidades elegibles (sin estacionamientos), `montoBaseGc`, coeficiente de prorrateo y responsable de cobro (propietario vigente).
- **GD**: actas publicadas como respaldo de retiros del fondo de reserva.
- **ST/Prisma**: el espejo BD (`fi-sync-bd`) persiste fondos/egresos/ingresos vía `/api/fi/sync` — requiere sesión activa (el sync corre con el usuario logueado; ante 401 espera el próximo cambio).
- **IN / MT / RA**: origen de cargos y validación de financiamiento (conexión inversa materializada en esta ventana).
- Notificaciones con `notify()` (**ST**, D3). Estados de cuenta y certificado "Unidad Al Día" llegarán con **CT**.
