

### Requirement: Eventos Operativos de Personal (PE)
El catálogo de eventos MUST incluir los eventos operativos del módulo PE: `PE_START_SHIFT` (inicio de turno), `PE_TASK_DONE` (tarea completada desde el panel de monitoreo), `PE_VISITA_TECNICA` (visita técnica registrada), `PE_ENCOMIENDA_RECIBIDA` (encomienda recibida en conserjería), `PE_FICHA_SAVED`, `PE_VISITA_INGRESADA`, `PE_CONTRATISTA_INGRESADO`, `PE_CIERRE_TURNO`, `PE_CIERRE_EDITADO` y `PE_PROYECCION_ENVIADA`. Cada evento SHALL registrar data cuantificable cuando aplique (horas extra, cantidad de tareas, costo proyectado) y alimentar las métricas derivables: porcentaje de cumplimiento del plan de mantenimiento preventivo y volumen de encomiendas gestionadas por turno. Los cierres pendientes alimentan el escenario "Unclosed Shifts" (Operación No Reportada).

#### Scenario: Jornada operativa auditada
- **WHEN** un trabajador inicia turno, recibe una encomienda, registra una visita técnica y cierra su turno
- **THEN** los cuatro eventos quedan registrados como inmutables con su data cuantificable

#### Scenario: Turno no cerrado visible para AM
- **WHEN** una jornada termina sin cierre de turno registrado para esa fecha
- **THEN** la tarjeta correspondiente del reporte diario queda No Informado y el caso es detectable por el panel de incumplimientos
