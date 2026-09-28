## MODIFIED Requirements

### Requirement: Historial de reportes con fuente BD
Generar SHALL persistir el reporte en BD (`POST /api/reportes-re`) y
distribuir SHALL espejar `fechaDistribucion`/`distribuidoA`/
`destinatariosPersonaId` (PUT): el historial lee de BD pero la generación
vivía solo en el store legacy y el título nunca aparecía.

#### Scenario: Generar, ver en historial y distribuir
- **WHEN** se genera un reporte y se distribuye en `/admin/reporteria`
- **THEN** la card con el título aparece en el historial y tras distribuir
  muestra el badge `N destinatario(s)`.
