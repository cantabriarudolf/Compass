## MODIFIED Requirements

### Requirement: Unidad TEST propia visible en estructura (flujo EF)
El spec de poblamiento EF SHALL crear su unidad vía `POST /api/unidades`
(reutilizando microSector/tipo/estado de una unidad seed del mismo scope)
con número único `TEST-999-<ts>`, verificarla en `/inventario/estructura`
y eliminarla (cleanup). No depende del relato QA-Lab (store legacy vs BD).

#### Scenario: Crear y visualizar unidad
- **WHEN** se POSTea la unidad TEST y se visita `/inventario/estructura`
- **THEN** la fila con el número aparece y el cleanup la elimina.
