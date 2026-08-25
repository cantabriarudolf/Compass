# MT-mantenimiento-proyectos (delta del change FI-finanzas-morosidad)

## MODIFIED Requirements

### Requirement: Proyectos y Proyecciones a Largo Plazo
El sistema MUST mantener planes de trabajo futuros mediante `saveProyectoMT`/`removeProyectoMT` retornando `StoreResult`, con presupuesto estimado y plazo (meses/años); el sistema MUST derivar el monto sugerido de cuota extraordinaria o incremento de fondo de reserva (presupuesto/plazo) sin cálculos externos, y la fecha objetivo alimenta las alarmas por vida útil de componentes. Un proyecto MAY declarar el fondo FI que lo financia (`fondoFinanciamientoId`): al guardarlo, el sistema MUST validar que el fondo exista, esté activo y disponga de saldo suficiente (≥ presupuesto estimado) según el libro de Finanzas.

#### Scenario: Cuota sugerida derivable
- **WHEN** se crea "Mantención de techos" con $12.000.000 a 120 meses
- **THEN** la UI/reportería puede derivar una cuota sugerida de $100.000 mensuales

#### Scenario: Proyecto con fondos insuficientes rechazado
- **WHEN** se crea un proyecto de $5.000.000 declarando un fondo con saldo $2.000.000
- **THEN** `saveProyectoMT` retorna `{ok:false}` por saldo insuficiente sin crear el proyecto

#### Scenario: Proyecto con trabajos no eliminable en uso real
- **WHEN** se descarta un proyecto aún sin ejecución
- **THEN** el cambio de estado queda registrado sin afectar trabajos históricos
