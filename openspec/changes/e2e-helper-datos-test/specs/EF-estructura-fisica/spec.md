## ADDED Requirements

### Requirement: Setup EF TEST vía helper compartido
El test EF de poblamiento SHALL crear su unidad TEST vía
`e2e/helpers/datos-test` (`crearUnidadTEST` + `limpiarUnidadTEST` con FKs del
seed), sin setup inline duplicado. La afirmación (número visible en la
estructura) queda idéntica.

#### Scenario: Unidad TEST del helper aparece en la estructura
- **WHEN** existe una unidad TEST creada vía el helper
- **THEN** la estructura la muestra y el cleanup no deja residuos TEST.
