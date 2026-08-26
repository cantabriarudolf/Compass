# AM-auditoria-metricas (delta del change RE-reporteria-dashboards)

## ADDED Requirements

### Requirement: Eventos de Reportería (RE)
El catálogo de eventos MUST incluir los eventos del módulo RE: `RE_DASHBOARD_VIEW` (acceso a cada vista del mando), `RE_REPORT_GENERATED` (reporte creado con bloques) y `RE_REPORT_DISTRIBUTED` (distribución con alcance). Cada evento SHALL registrar data cuantificable (vista consultada, bloques incluidos, cantidad de destinatarios) y alimentar las métricas derivables: tasa de consumo de reportes por rol, frecuencia de acceso por perfil y exactitud de la segmentación.

#### Scenario: Ciclo reportería auditado
- **WHEN** se abre el mando, se genera un reporte segmentado y se distribuye
- **THEN** los tres eventos quedan registrados como inmutables con su data cuantificable

#### Scenario: Alcance medible
- **WHEN** una distribución alcanza N destinatarios resueltos
- **THEN** `RE_REPORT_DISTRIBUTED` registra el alcance N para la métrica de exactitud de segmentación
