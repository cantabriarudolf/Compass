# AM-auditoria-metricas (delta del change CT-certificados)

## ADDED Requirements

### Requirement: Eventos de Certificados (CT)
El catálogo de eventos MUST incluir los eventos del módulo CT: `CT_GENERATE_RESIDENCE`, `CT_GENERATE_FINANCIAL` (incluye estado de cuenta y al día con su data), `CT_GENERATE_PAYROLL` y `CT_GENERATE_AL_DIA`. Cada evento SHALL registrar data cuantificable (tipología emitida, unidad/persona destino) y alimentar las métricas derivables: cantidad de certificados por tipo, unidades con mayor demanda y trazabilidad por código de verificación.

#### Scenario: Emisión auditada por tipología
- **WHEN** se emiten certificados de las cuatro tipologías
- **THEN** cada emisión queda registrada como evento inmutable con su referencia al registro CT

#### Scenario: Intento bloqueado visible
- **WHEN** un certificado Al Día es rechazado por mora
- **THEN** el intento queda registrado en AM como data de control, sin crear registro de emisión
