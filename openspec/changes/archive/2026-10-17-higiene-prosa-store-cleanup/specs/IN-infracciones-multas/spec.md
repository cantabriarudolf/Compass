## MODIFIED Requirements

### Requirement: Respaldo de la Directiva para Multas Graves
Las multas de categoría Grave o Gravísima MUST contar con el respaldo (voto/validación) de al menos un miembro vigente de la directiva antes de poder aplicarse definitivamente al Gasto Común; `respaldarInfraccionIN` valida que quien respalda tenga extensión de gobernanza activa. Los miembros de Comité/Directiva disponen además de comentarios internos visibles solo para administración y directiva, persistidos en la infracción mediante la API REST (`PUT /api/in/infracciones/[id]`).

#### Scenario: Multa grave sin respaldo bloqueada
- **WHEN** se intenta aplicar una multa Grave sin ningún respaldo directiva
- **THEN** retorna `{ok:false}` exigiendo primero el respaldo de la directiva

#### Scenario: Comentario interno privado
- **WHEN** un director comenta la infracción
- **THEN** el comentario queda asociado con autor y fecha para el panel de supervisión
