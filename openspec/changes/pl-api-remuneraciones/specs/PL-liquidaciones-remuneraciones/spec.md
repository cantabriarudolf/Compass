## ADDED Requirements

### Requirement: API REST de generación de liquidaciones
El sistema SHALL exponer `POST /api/liquidaciones` (generar) con scope
`comunidadId` (`withComunidadScope`, 404 cross-comunidad) y authz solo
administración (`puede(rol, accion, "pl")`): valida trabajador existente con
ficha laboral y sueldo base (400 si no), FKs legales MA vigentes (400),
parámetros CF completos (400 "CF no cargado"), duplicado trabajador+periodo
(409); calcula server-side vía `pl-utils`, asigna folio LIQ- correlativo,
vincula la proyección PE del periodo si existe y emite `PL_GENERATE_PAYSLIP`.
El snapshot resultante es inmutable (sin PUT).

#### Scenario: Generación TEST vía API persiste en BD
- **WHEN** un admin genera una liquidación para un trabajador con ficha y
  sueldo base en un periodo libre
- **THEN** responde 201 y la liquidación queda en BD con folio LIQ- y totales
  calculados.

#### Scenario: Duplicado por trabajador y periodo bloqueado
- **WHEN** se genera una segunda liquidación para el mismo trabajador y periodo
- **THEN** responde 409 y no crea registros.

#### Scenario: CF sin parámetros legales bloquea la generación
- **WHEN** se genera sin `ufMensual`, `ingresoMinimoMensual`,
  `topeGratificacionLegal` o `tasaSIS` cargados en CF
- **THEN** responde 400 citando "CF no cargado" y no muta el estado.

### Requirement: API REST de confirmación con egreso espejo en FI
El sistema SHALL exponer `POST /api/liquidaciones/[id]/confirmar` (solo
administración): exige estado borrador (400 si no) y fondo GC activo (400 si
no); crea el egreso FI categoría sueldos por el líquido a pagar (folio FE-
correlativo, validado con `EgresoFISchema`), marca la liquidación como
confirmada con `egresoFIReferencia` materializada, pasa a descontados los
adelantos vinculados y emite `PL_EXPENSE_SYNC`.

#### Scenario: Confirmación sincroniza egreso
- **WHEN** un admin confirma una liquidación en borrador
- **THEN** responde 200, la liquidación queda confirmada y existe el egreso FI
  categoría sueldos por el total a pagar.

#### Scenario: Confirmación repetida rechazada
- **WHEN** se confirma una liquidación ya confirmada
- **THEN** responde 400 y no crea un segundo egreso.

### Requirement: Lectura y borrado de liquidaciones con dato de BD
El sistema SHALL exponer `GET /api/liquidaciones` (paginado) y
`/api/liquidaciones/[id]` (GET_ONE, DELETE) vía crud-factory con
`LiquidacionPLSchema` y 404 cross-comunidad; DELETE solo borrador sin egreso
(409 si no). La page `/finanzas/remuneraciones` SHALL leer/generar/confirmar
vía el hook `use-liquidaciones` en lugar del store legacy, manteniendo UX y
textos ("Borrador", "Confirmada", "LIQ-", folios, vista previa del cálculo).

#### Scenario: Historial persiste tras recargar
- **WHEN** un admin genera y confirma una liquidación desde la page
- **THEN** el historial la muestra con folio LIQ- y badge Confirmada incluso
  tras recargar (dato de BD, no de store).

### Requirement: GATED remuneraciones con dato TEST propio vía API
El spec GATED de remuneraciones SHALL crear su trabajador TEST con ficha
completa vía POST `/api/personas` (FKs desde `/api/maestros/*`) y asegurar
parámetros CF vía PUT `/api/configuracion`, generar+confirmar la liquidación
vía UI y limpiar al final (DELETE liquidaciones TEST + egreso espejo +
persona), sin depender de QA-Lab "Poblar todo".

#### Scenario: Liquidación TEST de punta a punta sin QA-Lab
- **WHEN** existe un trabajador TEST con ficha creado vía API
- **THEN** el combo lo lista, el botón Generar se habilita, la confirmación
  sincroniza el egreso y el cleanup no deja residuos TEST.
