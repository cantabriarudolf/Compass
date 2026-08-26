# AM-auditoria-metricas (delta del change PL-liquidaciones-remuneraciones)

## ADDED Requirements

### Requirement: Eventos de Remuneraciones (PL)
El catálogo de eventos MUST incluir los eventos del módulo PL: `PL_GENERATE_PAYSLIP` (liquidación generada en borrador), `PL_ADD_ADVANCE` (adelanto registrado con folio ADE), `PL_DELETE_PAYSLIP` (liquidación borrador eliminada) y `PL_EXPENSE_SYNC` (confirmación sincronizada como egreso FI categoría sueldos). Cada evento SHALL registrar data cuantificable cuando aplique (monto total, monto del adelanto, horas extra liquidadas) y alimentar las métricas derivables: gasto mensual total en remuneraciones, volumen de adelantos por trabajador, desviación presupuestaria vs proyección PE y tasa de retenciones previsionales.

#### Scenario: Ciclo de pago auditado
- **WHEN** se registra un adelanto, se genera la liquidación y se confirma
- **THEN** los tres eventos quedan registrados como inmutables con su data cuantificable y el egreso FI referenciado

#### Scenario: Métrica de retenciones
- **WHEN** el dashboard de AM consolida las liquidaciones confirmadas del periodo
- **THEN** expone tasa de retenciones = descuentos legales / total imponible
