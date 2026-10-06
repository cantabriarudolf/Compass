# MP-maestro-personas — Delta Specs for e2e-rojos-flujo-a11y-smoke

## MODIFIED Requirements

### Requirement: Setup MP TEST vía helper compartido

El test MP de poblamiento SHALL crear su persona TEST vía
`e2e/helpers/datos-test` (`crearPersonaTEST` + `limpiarPersonaTEST`), sin
setup inline duplicado. La afirmación (RUT raw visible en el directorio) queda
idéntica. El setup SHALL ser independiente del QA-Lab "Poblar todo de una vez"
(`crearPersonaTEST` hace `POST /api/personas` y el cleanup
`DELETE /api/personas/:id`), y los specs de flujo
(`e2e/flujo/poblamiento`, `e2e/flujo/personas`) SHALL usar nombres, emails y
RUT únicos por corrida (timestamp + DV válido vía `rutUnicoTEST`/`dvRutTEST`)
para que las reejecuciones no colisionen. Motivo estructural (P4): el QA-Lab
escribe al store legacy mientras las páginas migradas leen la BD.

#### Scenario: Persona TEST del helper aparece en el directorio
- **WHEN** existe una persona TEST creada vía el helper
- **THEN** el directorio la muestra y el cleanup no deja residuos TEST.

#### Scenario: Persona y unidad propias visibles en su módulo
- **WHEN** el spec de flujo crea una persona o unidad TEST vía el helper y se visita su página
- **THEN** aparece en la grilla o tabla y el cleanup vía API la elimina, sin residuos.

#### Scenario: Directorio crea desde la UI con email único
- **WHEN** admin crea una identidad desde "Crear Nueva Persona"
- **THEN** aparece en la grilla (RUT formateado con puntos por el formulario) y el cleanup vía API la elimina.
