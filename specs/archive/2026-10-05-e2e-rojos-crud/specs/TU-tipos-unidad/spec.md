## ADDED Requirements
<!-- P1 ROJOS-CRUD: era MODIFIED sin target; el spec nunca lo tuvo -->

### Requirement: Discriminador crear vs editar por modo, no por id
`guardarTipo` SHALL decidir por el modo edición (`editingItem`), no por la
presencia de `id`: el alta pre-genera id y un `if (cuerpo.id)` caía siempre
en PUT contra registro inexistente (404, dialog que no cierra).

#### Scenario: Crear tipo cierra el dialog y muestra la fila
- **WHEN** se crea un tipo en `/inventario/tipos`
- **THEN** el POST responde 201, el dialog cierra y la fila aparece en
  Plantillas Técnicas.
