# EF-estructura-fisica — Delta Specs for e2e-rojos-flujo-a11y-smoke

## MODIFIED Requirements

### Requirement: Setup EF TEST vía helper compartido

El test EF de poblamiento SHALL crear su unidad TEST vía
`e2e/helpers/datos-test` (`crearUnidadTEST` + `limpiarUnidadTEST` con FKs del
seed), sin setup inline duplicado. La afirmación (número visible en la
estructura) queda idéntica. El setup SHALL ser independiente del QA-Lab "Poblar
todo de una vez": `crearUnidadTEST` hace `POST /api/unidades` reutilizando
microSector/tipo/estado de una unidad seed del mismo scope, con nombre único por
corrida (patrón `test-<prefijo>-<entidad>-<ts>`, prefijo `pob-ef`) y etiqueta
`TEST-Flujo`, y el cleanup hace `DELETE /api/unidades/:id`, de modo que la
reejecución no colisione y no queden residuos. Motivo estructural (P4): el
QA-Lab escribe al store legacy mientras las páginas migradas leen la BD.

#### Scenario: Unidad TEST del helper aparece en la estructura
- **WHEN** existe una unidad TEST creada vía el helper
- **THEN** la estructura la muestra y el cleanup no deja residuos TEST.

#### Scenario: Crear y visualizar unidad propia sin QA-Lab
- **WHEN** el spec de poblamiento EF crea su unidad TEST vía el helper y se visita `/inventario/estructura`
- **THEN** la fila con el número aparece y el cleanup vía API la elimina, sin residuos y sin haber poblado desde el QA-Lab.
