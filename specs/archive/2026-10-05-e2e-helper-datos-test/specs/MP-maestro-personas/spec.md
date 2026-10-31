## ADDED Requirements

### Requirement: Setup MP TEST vía helper compartido
El test MP de poblamiento SHALL crear su persona TEST vía
`e2e/helpers/datos-test` (`crearPersonaTEST` + `limpiarPersonaTEST`), sin
setup inline duplicado. La afirmación (RUT raw visible en el directorio)
queda idéntica.

#### Scenario: Persona TEST del helper aparece en el directorio
- **WHEN** existe una persona TEST creada vía el helper
- **THEN** el directorio la muestra y el cleanup no deja residuos TEST.
