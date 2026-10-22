# 💰 19 - PL - Liquidaciones y Remuneraciones

El motor de remuneraciones del personal: calcula haberes y descuentos con estándar chileno cruzando la ficha laboral de PE con los maestros legales de MA y los parámetros legales de CF, gestiona adelantos con comprobante, sincroniza el gasto en sueldos con Finanzas y emite el PDF oficial con firma digitalizada.

## 🚀 Funcionalidad Principal

Cada liquidación es un **snapshot inmutable**: al generarla el sistema congela valor hora, gratificación, descuentos y totales para que ningún cambio posterior de parámetros reescriba un documento histórico. La confirmación materializa el egreso contable en FI bajo la categoría **Sueldos** y descuenta los adelantos pendientes del trabajador según su naturaleza (anticipo completo, préstamo con tope y saldo), arrastrando al mes siguiente lo que no alcanzó el líquido.

## 🛠️ Secciones

- **Remuneraciones (`/finanzas/remuneraciones`)**:
  - **Liquidaciones**: selector de trabajador con ficha PE (exige `sueldoBase`), periodo y días trabajados; bonos/aguinaldos manuales con flag imponible; movilización y colación como no imponibles; vista previa en vivo del cálculo antes de generar. Folio correlativo **LIQ-####**.
  - **Adelantos**: registro con glosa explicativa obligatoria → comprobante **ADE-####** notificado al trabajador (`email_simulado`). Hay **dos naturalezas distintas**, nunca una sola:
    - **Anticipo de sueldo**: pago anticipado de lo ya devengado. Se descuenta **completo** en la liquidación siguiente, **sin tope**.
    - **Préstamo o deuda**: exige **acuerdo escrito adjunto**; el descuento se topa al **15% mensual** de la remuneración y al **45% en conjunto** con las otras deducciones.
    - Si el líquido no alcanza, el **saldo arrastra** al mes siguiente (con alerta, y nunca dejando el líquido en negativo).
    - Lo que **nunca** se puede descontar: arriendo, luz, agua, herramientas, medicinas, multas no autorizadas y mermas sin responsabilidad acreditada.
    Ciclo Pendiente → Descontado en la próxima liquidación confirmada; un adelanto descontado no es eliminable.
  - **Parámetros Legales**: edición restringida a administración del valor **UF mensual**, ingreso mínimo mensual, tope de gratificación legal (factor 4.75 sobre IMM) y tasa SIS. Cada cambio queda auditado como `CF_UPDATE_PARAM`.
  - **PDF**: botón por fila regenera la liquidación con pdfmake e incrusta la firma del administrador dentro del documento (nunca se guarda base64 en el sistema).

## 🧮 Cómo se Calcula

- **Sueldo base proporcional** = sueldo contractual × días trabajados ÷ mes comercial de CF (30 por defecto).
- **Hora extra §1.1**: diario = base ÷ días comerciales → semanal = diario × 7 → valor hora = semanal ÷ jornada de la ficha → monto = valor hora × **1.5** × horas registradas en el periodo (PE).
- **Gratificación legal** = 25% del imponible, con tope = factor × ingreso mínimo mensual ÷ 12.
- **Descuentos legales**: AFP según tasa del maestro; salud Fonasa 7% o Isapre por valor UF o %; SIS según parámetro; seguro de cesantía 0,6%; APV voluntario. Contratos a honorarios omiten los descuentos legales.
- **Totales de control**: total haberes → total imponible → alcance líquido → **descuento de anticipos** → líquido final a pagar.

## 💡 Tips de Oro

- **"CF no cargado"**: sin los cuatro parámetros legales configurados no se genera ninguna liquidación; llénalos primero en Parámetros Legales.
- **Anticipo ≠ préstamo**: el anticipo de sueldo no es descuento del art. 58 y corre sin tope; el préstamo sí exige acuerdo escrito y respeta el 15% mensual / 45% conjunto. Elige bien la naturaleza al registrar el adelanto.
- **Un documento por periodo**: la misma persona no puede tener dos liquidaciones del mismo mes.
- **Solo borradores se borran**: una vez confirmada, la liquidación queda amarrada al egreso FE de Finanzas y al historial.
- **Proyección conectada**: si existía una proyección de feriados PE del periodo, la liquidación deja su referencia materializada (ya no dice "pendiente").
- **Auditoría**: `PL_GENERATE_PAYSLIP`, `PL_ADD_ADVANCE`, `PL_DELETE_PAYSLIP`, `PL_EXPENSE_SYNC`.

## 🔗 Dependencias

- **PE**: ficha laboral con sueldo base, jornada y horas extras del periodo.
- **MA**: tasas AFP, tipo de salud y tramo de asignación familiar referenciados por id desde la ficha.
- **CF**: mes comercial, jornada estándar y parámetros legales (UF/IMM/tope/SIS).
- **FI**: fondo GC activo destino del egreso de sueldos. **CT**: certificado de liquidación solo sobre documentos confirmados.
