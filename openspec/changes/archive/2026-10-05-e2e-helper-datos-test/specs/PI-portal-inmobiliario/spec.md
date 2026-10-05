## ADDED Requirements

### Requirement: Setup de portal TEST vía helper compartido
El spec de portal SHALL crear su publicación TEST vía
`e2e/helpers/datos-test` (`crearPublicacionTEST` con unidad del seed +
`snapshotPublicacionesTEST` previo) y limpiarla al final
(`limpiarPublicacionesNuevasTEST` por diferencia + `limpiarPublicacionTEST`),
sin setup inline duplicado. El flujo UI (catálogo, Gestionar vitrina, Nueva
publicación manual) queda idéntico.

#### Scenario: Vitrina TEST y gestión con manual del helper
- **WHEN** existe una publicación TEST creada vía el helper
- **THEN** el catálogo la muestra y la manual creada por la UI se limpia por
  diferencia sin dejar residuos TEST.
