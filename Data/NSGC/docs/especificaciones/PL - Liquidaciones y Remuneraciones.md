# PL - Liquidaciones y Remuneraciones

El objetivo de este módulo es automatizar el cálculo de haberes, descuentos y pagos del personal, integrando la asistencia reportada con las condiciones contractuales para generar documentos legales y registros contables precisos.

## 1. Generación de Liquidaciones (Liquidar)

El sistema procesa la información de la ficha del trabajador y su actividad mensual para determinar el sueldo líquido a pagar.

### Estructura de la Liquidación (Basada en Estándar Chileno):

- **Haberes Imponibles:**
    - **Sueldo Base:** Calculado sobre 30 días o proporcional a la asistencia.
    - **Gratificación Legal:** (Calculada automáticamente si aplica).
    - **Horas Extras:** Según reporte de asistencia.
    - **Bonos y Aguinaldos:** Ingresados manualmente o por reglas de calendario (ej: Fiestas Patrias).
- **Haberes No Imponibles:**
    - **Asignación de Movilización.**
    - **Asignación de Colación.**
    - **Asignación Familiar (Cargas):** Si el trabajador tiene cargas autorizadas.
- **Descuentos Legales y Voluntarios:**
    - **AFP (Previsión):** Porcentaje según la administradora cargada en el Maestro.
    - **Salud:** Fonasa (7%) o Isapre (valor UF o %).
    - **Ahorro Previsional:** APV y Ahorro Voluntario (Cuenta 2).
    - **Seguro de Cesantía:** (Si corresponde según contrato).
- **Totales de Control:**
    - **Total Haberes:** Suma de imponibles y no imponibles.
    - **Alcance Líquido:** Monto total tras descuentos antes de anticipos.
    - **Descuento de Anticipos:** Resta de adelantos entregados durante el mes.
    - **Total Líquido a Pagar:** Monto final a transferir al trabajador.

### 1.1 Lógica de Cálculo de Horas Extras (Estándar Chile):

El sistema automatiza el cálculo basado en la jornada semanal registrada en la ficha del trabajador (`PE`):
1.  **Sueldo Diario:** `Sueldo Base / 30` (o según "Días Mes Comercial" en `CF`).
2.  **Sueldo Semanal:** `Sueldo Diario * 7`.
3.  **Valor Hora Ordinaria:** `Sueldo Semanal / Jornada Semanal` (ej: 44 o 45 hrs).
4.  **Valor Hora Extra (Recargo 50%):** `Valor Hora Ordinaria * 1.5`.
5.  **Monto a Pagar:** `Valor Hora Extra * Horas Extras Reportadas`.

Este cálculo se realiza en tiempo real al generar la liquidación, cruzando los datos del **Reporte de Asistencia** con el **Sueldo Base** contractual.

## 2. Gestión de Adelantos de Sueldo

Permite el flujo de caja para el personal mediante entregas parciales antes de la fecha de cierre.

### Funcionalidades:
- **Registro de Anticipos:** Ingreso de montos en efectivo con glosa explicativa para trazabilidad.
- **Comprobante de Entrega:** Generación instantánea de un recibo de adelanto para firma del trabajador.
- **Control de Estado:** Seguimiento del ciclo de vida del adelanto (`Pendiente` -> `Descontado` en liquidación).

## 3. Integración Contable y Documental

El módulo garantiza que cada pago de remuneración tenga un impacto directo en la contabilidad de la comunidad.

### Flujo de Integración:
- **Registro de Gastos Comunes (Egresos):** 
    - Al confirmar una liquidación o un adelanto, el sistema registra automáticamente un **Egreso de Comunidad** en el Módulo de Gastos Comunes.
    - Clasificación automática bajo la categoría de "Sueldos" para reportes de transparencia.
- **Historial de Folios:** Generación de números de folio únicos para cada liquidación, permitiendo una búsqueda rápida y auditoría documental.
- **Vista de Impresión y Certificación:** La generación oficial de la liquidación en PDF y el recibo de adelanto es gestionada por el motor central del [Módulo de Certificados (CT)](<CT - Certificados.md>#13-certificado-liquidacion-de-sueldo), asegurando la validez de la firma y el formato institucional.

## 4. Integración con Auditoría y Métricas (AM)

Control exhaustivo de los egresos de dinero por concepto de capital humano:
- **Evento:** `PL_GENERATE_PAYSLIP`, `PL_ADD_ADVANCE`, `PL_DELETE_PAYSLIP`, `PL_EXPENSE_SYNC`.
- **Data Cuantificable:** Gasto mensual total en remuneraciones, volumen de adelantos por trabajador, días trabajados promedio.
- **Métricas:** Desviación presupuestaria en sueldos, tiempo de ciclo de pago, tasa de retenciones previsionales.
