# 💰 12 - FI - Finanzas y Morosidad

La caja de la comunidad: fondos con imputación obligatoria, egresos categorizados con comprobante digitalizado, emisión mensual del Gasto Común en modalidad fija o prorrateo, fondo de reserva con aporte automático, morosidad con mora pro-rata y corte de servicios, y pagos con ajuste manual auditado.

## 🚀 Funcionalidad Principal

Dos pilares: el **Libro Financiero** concentra todo el movimiento en cobros (`cobrosFI`) imputados a un fondo y egresos (`egresosFI`) que salen de un fondo — el saldo de cada fondo se deriva de sus movimientos (base caja), nunca se almacena; la **Emisión GC** genera la deuda del periodo leyendo el modo de CF (`modoCalculoGC`): fijo toma el monto base del tipo de unidad, variable reparte el gasto total por el coeficiente de prorrateo de cada unidad.

## 🛠️ Secciones

- **Gastos Comunes (`/finanzas/gastos-comunes`)**:
  - **Fondos**: CRUD del maestro de cajas (gasto_comun, reserva con % de aporte, especial, amenities); no eliminables con movimientos imputados.
  - **Egresos**: registro con folio `FE-####`, categoría (Sueldos, Mantención…), flag recurrente/fijo para el termómetro de presupuesto y comprobante por URL (D1, jamás base64).
  - **Emisión GC**: wizard por periodo `AAAA-MM` (no repetible), alcance total o personalizado, vista previa prorrateada; exige propietario vigente en cada unidad incluida y aplica automáticamente el % al Fondo de Reserva.
  - **Morosidad**: tabla de unidades atrasadas con botón "Aplicar mora" (tasa mensual configurable, pro-rata diario), panel destacado de **Corte de Servicios** según `limiteMesesAvisoCorte` y gestión de cobranza notificada.
- **Recaudación (`/finanzas/pagos`)**: libro unificado filtrable por concepto/estado con KPIs recaudado vs por cobrar; detalle por cobro (moras, pagos, diferencias) y registro de pago con exigible exacto (base + moras − pagos previos). Si el monto difiere, la justificación es obligatoria y nace un **informe de diferencia inmutable**.

## 💡 Tips de Oro

- **Todo pasa por un fondo**: si el gasto o cobro no declara fondo activo, el store lo rechaza; sin Fondo de Gasto Común activo no hay emisión posible.
- **CF manda**: `emitirGastoComun` valida `modoCalculoGC` (error "CF no cargado" si falta), usa `diaCortePago` como día de vencimiento del mes siguiente al periodo y respeta el opt-in `notificarEmisionGC`.
- **Mora con criterio**: solo cobros vencidos; idempotente por día (aplicarla dos veces no duplica); el cálculo es `exigible × tasa% × días/30`.
- **Ajuste = papeleta**: descuentos y recargos exigen justificación ≥10 caracteres y generan diferencia inmutable con eventos `FI_RECEIVE_PAYMENT` + `FI_MANUAL_DISCOUNT` (antifraude).
- **Retiros con acta**: sacar dinero del Fondo de Reserva exige un acta GD Publicada como aprobación documentada y saldo suficiente (`FI_FUND_WITHDRAWN`).
- **Engranajes conectados**: multas aplicadas de IN nacen como cobro real (el % GC se convierte a pesos contra el último GC emitido), tarifas/penalizaciones/garantías de RA caen al Fondo de Amenities, los proyectos de MT validan saldo del fondo que los financia y los residentes con deuda vencida no pueden reservar.
- **Auditoría**: `FI_EMISION_GC`, `FI_EGRESS_CREATED`, `FI_MORA_APPLIED`, `FI_RECEIVE_PAYMENT`, `FI_MANUAL_DISCOUNT`, `FI_COBRANZA_SENT`, `FI_FUND_WITHDRAWN`.

## 🔗 Dependencias

- **CF**: modo de cálculo, día de corte, límite de meses y opt-in de notificación.
- **EF/TU/VU**: unidades elegibles (sin estacionamientos), `montoBaseGc`, coeficiente de prorrateo y responsable de cobro (propietario vigente).
- **GD**: actas publicadas como respaldo de retiros del fondo de reserva.
- **IN / MT / RA**: origen de cargos y validación de financiamiento (conexión inversa materializada en esta ventana).
- Notificaciones con `notify()` (**ST**, D3). Estados de cuenta y certificado "Unidad Al Día" llegarán con **CT**.
