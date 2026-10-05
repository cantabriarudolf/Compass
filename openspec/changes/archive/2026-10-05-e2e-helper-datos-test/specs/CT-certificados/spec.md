## ADDED Requirements

### Requirement: Setup de certificados TEST vía helper compartido
El spec de certificados SHALL crear su trío TEST vía
`e2e/helpers/datos-test` (`crearTrioCertificadoTEST`: persona + unidad +
vínculo propietario activo) y limpiarlo al final
(`limpiarTrioCertificadoTEST` en orden vínculo → persona → unidad, guards
409), sin setup inline duplicado. El flujo UI (generar PDF, folio CT-,
historial, VC-) queda idéntico.

#### Scenario: Certificado residencia con trío TEST del helper
- **WHEN** el trío TEST existe vía el helper
- **THEN** el flujo genera el PDF con folio CT-, el historial lo muestra con
  código VC- y el cleanup no deja residuos TEST.
