# ST-capa-datos-persistente (delta del change CT-certificados)

## MODIFIED Requirements

### Requirement: Evolución Versionada y Limpieza Legacy

Cada spec que agrega colección SHALL exigir bump de `STORE_VERSION` y `migrate` que haga `mergeById` del seed nuevo y limpie keys legacy. Ejemplo canónico `migrate v8:462` que limpia `estacionamientos` y `ubicacionesEstacionamiento` legacy `k0mp4ss_fe/apps/web/lib/store.ts:485`.

#### Scenario: Nueva colección sin migrate
- **WHEN** `CompassData` crece sin bump `STORE_VERSION` ni `migrate`
- **THEN** usuarios con persist previo quedan sin la colección hasta limpiar `localStorage`.

## ADDED Requirements

### Requirement: Colección de certificados CT en el store

El sistema SHALL incluir en `CompassData` la colección `certificadosCT` (folio, código de verificación único, tipología, snapshot del payload emitido, referencia a fuente y a la firma usada), gestionada mediante acciones repository que retornan `StoreResult`. CT ocupa el rank 6 del manifest canónico (`6=CT/PL`) dependiendo de MP/VU (1/3), FI (4), PL (6) y CF (0). El bump de versión SHALL ser 23 → 24 con migrate aditivo (colección vacía). La firma digitalizada se persiste SOLO por referencia (D1): el binario del PDF y la imagen de firma jamás entran al store.

#### Scenario: Escritura valida FKs por tipología

- **WHEN** `generarCertificadoCT` recibe una unidad o liquidación inexistente para la tipología pedida
- **THEN** retorna `{ok:false}` citando la FK y no muta `certificadosCT`

#### Scenario: Media por referencia en firma

- **WHEN** un intento de emisión adjunta la firma como data-URL/base64
- **THEN** la acción retorna `{ok:false}` citando D1 y no muta el estado

### Requirement: Migración aditiva v23→v24

El migrate SHALL inyectar `certificadosCT` vacía cuando el estado persistido provenga de la versión 23 o anterior.

#### Scenario: Rehidratación v23

- **WHEN** un store persistido en versión 23 se rehidrata
- **THEN** `certificadosCT` queda disponible y ningún dato previo cambia
