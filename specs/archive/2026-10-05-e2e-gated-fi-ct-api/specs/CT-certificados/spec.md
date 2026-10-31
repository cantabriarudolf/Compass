## ADDED Requirements

### Requirement: GATED certificados con trío TEST propio vía API
El spec GATED de certificados SHALL crear su trío TEST vía API REST
(POST `/api/personas` + POST `/api/unidades` + POST `/api/vinculos` con rol
propietario activo) y limpiarlo al final en orden (vínculo → persona →
unidad, guards 409), sin depender de QA-Lab "Poblar todo".

#### Scenario: Certificado residencia con trío TEST
- **WHEN** persona + unidad + vínculo activo TEST existen vía API
- **THEN** el flujo genera el PDF con folio CT-, el historial lo muestra con
  código VC- y el cleanup no deja residuos TEST.
