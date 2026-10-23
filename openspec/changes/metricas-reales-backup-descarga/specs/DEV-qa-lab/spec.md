## MODIFIED Requirements

### Requirement: Backups JSON auditables

`Exportar JSON` SHALL generar un respaldo con `{_summary, report: SeedValidationReport, historia: [{capitulo, estado, rank, count}], diff}` y SHALL entregarlo como **descarga del navegador** a través de `POST /api/backup`, que SHALL responder el contenido como adjunto con `Content-Disposition: attachment` y nombre `<prefijo>-AAAA-MM-DD_HH-mm.json`.
La fecha del nombre SHALL fijarla el servidor; el cliente SHALL aportar solo el prefijo semántico (`compass-seed-report` para este comprobante), y un prefijo que no cumpla el formato SHALL caer al prefijo por defecto.
El endpoint MUST NOT escribir en el disco del servidor: en producción ese disco es efímero, y un archivo que se pierde no es un respaldo.
`AM` SHALL registrar `ST_SEED_*`.

#### Scenario: Export tras Cargar Todo
- **WHEN** el usuario pulsa `Exportar JSON`
- **THEN** el navegador descarga el archivo con el nombre fechado por el servidor y `AM` registra `ST_SEED_COLLECTION_LOADED`
- **AND** no se crea ningún archivo bajo `Data/NSGC/backups/`
