## ADDED Requirements

### Requirement: Trazabilidad de accesos
El sistema SHALL registrar en el módulo de Auditoría (AM) un log cada vez que se cree, modifique o visualice la ficha de una persona, garantizando la trazabilidad.

#### Scenario: Log de visualización
- **WHEN** un conserje abre la ficha detallada de un residente
- **THEN** se dispara un evento `MP_VIEW_FICHA` al módulo de métricas con el ID del usuario y la fecha
