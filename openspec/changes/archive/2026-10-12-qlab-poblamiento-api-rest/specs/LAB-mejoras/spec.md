## ADDED Requirements

### Requirement: QA-Lab pobla Estructura Física FI vía API REST

El sistema SHALL poblar la fase FI del QA-Lab ("Poblar todo", paso 13) vía API REST en lugar
del store legacy: `POST /api/fondos-fi`, `POST /api/egresos-fi`, `POST /api/emisiones-gc`,
`POST /api/cobros-fi` y las acciones dedicadas de pago, mora y retiro de fondo, con ids fijos
`test-*-fi` para upsert idempotente. El poblamiento SHALL además materializar las 3 conexiones
cross-módulo de la fase (IN, RA y MT). Lo poblado SHALL quedar visible en las páginas reales
(`/inventario/estructura`, `/operaciones/reservas`, `/finanzas/gastos-comunes`), que leen BD vía
API. "Borrar todo lo de prueba" SHALL eliminar el residuo FI vía API.

#### Scenario: Poblar FI deja el fondo y el cargo visibles

- **WHEN** se ejecuta "Poblar todo" y se abre `/finanzas/gastos-comunes`
- **THEN** el fondo, el egreso, la emisión de gasto común y el cobro de la unidad `test-*-fi`
  aparecen con datos de BD, no del store.

#### Scenario: Repoblar FI es idempotente

- **WHEN** se ejecuta "Poblar todo" dos veces con limpieza intermedia
- **THEN** no hay duplicados (upsert por id) y la fase reporta ok.

#### Scenario: Pago, mora y retiro son acciones REST dedicadas

- **WHEN** el poblamiento registra un pago, aplica mora o retira del fondo
- **THEN** la operación se ejecuta por una acción REST dedicada que emite su evento de auditoría
  una sola vez por request.

### Requirement: QA-Lab pobla Certificados de Trabajo CT vía API REST

El sistema SHALL poblar la fase CT del QA-Lab vía `POST /api/certificados-ct` (upsert por id
fijo `test-*-ct`) en lugar del store, portando el gate de deuda/saldo y la inmutabilidad de
`removeCertificadoCT` a la capa API. El certificado poblado SHALL quedar visible en
`/comunidad/certificados`. "Borrar todo lo de prueba" SHALL intentar el borrado vía API y
reportar el certificado inmutable como residuo honesto, no como error.

#### Scenario: Poblar CT deja el certificado visible

- **WHEN** se ejecuta "Poblar todo" y se abre `/comunidad/certificados`
- **THEN** el certificado `test-*-ct` aparece listado con su estado de deuda/saldo calculado en
  la API.

#### Scenario: Borrar no elimina el certificado inmutable

- **WHEN** se ejecuta "Borrar todo lo de prueba" sobre un certificado generado
- **THEN** la API rechaza el borrado del certificado inmutable y el lab lo reporta como residuo
  honesto.
