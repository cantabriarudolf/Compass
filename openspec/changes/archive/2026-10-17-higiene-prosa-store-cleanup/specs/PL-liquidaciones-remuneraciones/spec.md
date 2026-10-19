## MODIFIED Requirements

### Requirement: Dependencias de Carga y Seed (ST)
PL SHALL declarar sus entidades ST con el orden canónico de carga:

- **Entidades ST**: colecciones `liquidacionesPL` (snapshot inmutable de líneas/totales + referencias) y `adelantosPL` (monto, glosa, estado, folio) en `CompassData`.
- **Depende de**: MP (trabajador), PE (ficha laboral con afpId/saludId/asignacionFamiliarId), MA (maestros legales), CF (parámetros operativos y legales), FI (fondo GC destino).
- **Load Order Rank**: 6 (`6=CT/PL`).
- **Seed Manifest**: ambas colecciones nacen vacías (datos transaccionales); sin seeds estáticos.
- **Validación Referencial**: escritura valida trabajador existente con ficha laboral y FKs legales vigentes; lectura tolera maestros eliminados usando el snapshot.
- **Carga Bulk**: iteración rank asc conforme al manifest canónico; eventos AM por colección.
- **Migración**: bump 22→23 aditivo (colecciones vacías); campos CF y `sueldoBase` opcionales no invalidan stores previos.

#### Scenario: Store persistido v22 migra a v23
- **WHEN** un usuario con estado persistido en versión 22 abre la aplicación
- **THEN** las colecciones PL aparecen disponibles vacías sin pérdida de datos previos

#### Scenario: Escritura con FK legal huérfana
- **WHEN** el `POST /api/liquidaciones` recibe un trabajador cuyo `afpId` ya no existe en el maestro
- **THEN** responde 400 citando la FK huérfana y no crea la liquidación
