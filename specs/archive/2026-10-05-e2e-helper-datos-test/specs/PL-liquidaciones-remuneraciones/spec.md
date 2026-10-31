## ADDED Requirements

### Requirement: Setup de remuneraciones TEST vía helper compartido
El spec de remuneraciones SHALL crear su trabajador TEST vía
`e2e/helpers/datos-test` (`crearTrabajadorTEST`: maestros legales + params
CF + persona con ficha completa) y limpiarlo al final
(`limpiarTrabajadorTEST`: borradores + egreso espejo + persona), sin setup
inline duplicado. El flujo UI (generar borrador, confirmar, folio LIQ-)
queda idéntico. La liquidada confirmada sigue inmutable por diseño (documento
de auditoría con periodo TEST futuro).

#### Scenario: Trabajador TEST del helper genera y confirma liquidación
- **WHEN** existe un trabajador TEST creado vía el helper
- **THEN** el flujo genera el borrador con folio LIQ-, lo confirma y el
  cleanup elimina borradores, egreso espejo y persona sin residuos TEST.
