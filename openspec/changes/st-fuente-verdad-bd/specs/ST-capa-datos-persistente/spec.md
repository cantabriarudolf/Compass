## MODIFIED Requirements

### Requirement: Persistencia entre recargas
El sistema SHALL persistir los datos de dominio en el servidor (base de datos vía API REST), de modo que las modificaciones realizadas en la interfaz sobrevivan a recargas de página. El store legacy `apps/web/lib/store.ts` SHALL conservar únicamente su snapshot histórico en localStorage bajo la key `compass-store`, leído hoy solo por las dos páginas del módulo dev (`/admin/qa-lab`, `/admin/mantenimiento`), y NO SHALL ser la fuente de verdad del dominio.

#### Scenario: Cambio persistido al recargar
- **WHEN** el usuario crea o edita una entidad y luego recarga la página
- **THEN** el estado cargado refleja la última versión guardada en el servidor, no el seed inicial de los mocks.

### Requirement: Versionado y migración del almacenamiento
El sistema SHALL mantener `STORE_VERSION` congelado en 28 y NO SHALL incorporar migraciones de dominio nuevas al store legacy. La función `migrate` y `ESQUEMAS_COLECCION` SHALL conservarse sin cambios, exclusivamente para que un navegador con un snapshot de versión anterior pueda rehidratar el estado legacy sin romper.

#### Scenario: Almacenamiento con versión obsoleta
- **WHEN** el store detecta una versión persistida distinta a la actual
- **THEN** aplica el `migrate` existente sobre ese snapshot y `STORE_VERSION` permanece en 28, sin migraciones de dominio nuevas.

### Requirement: Sembrado inicial desde mocks
Los mocks de `apps/web/data/` SHALL ser la semilla del servidor, aplicada por los scripts `seed:mocks` y `db:*` de npm. El store legacy SHALL seguir inicializándose con ese seed cuando no exista estado persistido, únicamente para las dos páginas del módulo dev que lo leen; los datos de dominio de las páginas del producto provienen del servidor.

#### Scenario: Primera carga sin almacenamiento
- **WHEN** no existe estado persistido en localStorage
- **THEN** el store legacy se siembra con el seed derivado de los mocks y las páginas de dominio muestran los datos obtenidos del servidor.
