## MODIFIED Requirements

### Requirement: Gestor de Avisos con Ciclo de Vida
El sistema MUST gestionar avisos mediante `saveAvisoCV`/`publicarAvisoCV` (store) y la API REST `/api/cv/avisos` (GET paginado, POST upsert idempotente; detalle/PUT/DELETE en `/[id]`), retornando `StoreResult` cuando aplica, con clasificación tipológica (Información/Azul, Éxito/Verde, Advertencia/Naranja, Peligro/Rojo), duración individual en segundos (≥3), caducidad automática opcional (`expiresAt`), tags de organización interna y ciclo estricto: el alta nace Borrador (`CV_DRAFT_CREATED`) editable y eliminable; Publicado no admite eliminación directa y solo pasa a Archivado por expiración o finalización anticipada (`CV_ARCHIVED`); Archivado conserva la data para auditoría y ya no es editable.

#### Scenario: Alta como borrador y publicación
- **WHEN** la administración crea un aviso y luego lo publica
- **THEN** audita `CV_DRAFT_CREATED` y `CV_PUBLISHED`, quedando visible en el carrusel

#### Scenario: Publicado no eliminable
- **WHEN** se intenta eliminar un aviso publicado o archivado
- **THEN** la eliminación se rechaza (la API responde error al DELETE y el store retorna `{ok:false}`); la única salida del carrusel es archivar

#### Scenario: Edición auditada
- **WHEN** se edita un aviso borrador o publicado
- **THEN** persiste el cambio y audita `CV_EDITED`; el archivado rechaza ediciones

### Requirement: Plantillas Rápidas Operativas
El sistema MUST mantener plantillas maestras creadas únicamente por administración mediante la API REST `/api/cv/plantillas` (GET paginado, POST upsert idempotente; detalle/PUT/DELETE en `/[id]`) con tipología, duración sugerida y multimedia opcionales; el personal de servicio MUST poder activarlas mediante `activarPlantillaCV` generando un aviso publicado al instante (aprobación implícita del maestro) con origen trazable a la plantilla.

#### Scenario: Activación ante emergencia
- **WHEN** conserjería activa la plantilla "Portón en mantención" (Advertencia)
- **THEN** nace un aviso Publicado con origen "plantilla" visible en el carrusel

#### Scenario: Plantilla inactiva no activable
- **WHEN** se intenta activar una plantilla desactivada o inexistente
- **THEN** retorna `{ok:false}`
