## MODIFIED Requirements

### Requirement: Alta de trabajo con folio único y transiciones vía API
El alta SHALL generar folio `MT-*` único (el schema lo exige; `""` daba 400
con dialog que no cierra). Iniciar/Finalizar/Cancelar SHALL usar
`actualizarTrabajo` (PUT REST): las acciones del store legacy eran no-op
sobre registros BD.

#### Scenario: Crear trabajo y transitar a En Curso
- **WHEN** se crea un trabajo en `/inventario/proyectos` y se pulsa Iniciar
- **THEN** la fila muestra el badge "En Curso".
