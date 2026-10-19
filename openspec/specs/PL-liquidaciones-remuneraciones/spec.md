# PL-liquidaciones-remuneraciones Specification

## Purpose

Automatizar el cálculo de haberes, descuentos y pagos del personal integrando la asistencia reportada con las condiciones contractuales para generar documentos legales y registros contables precisos. Fuente de verdad: `Data/NSGC/docs/especificaciones/PL - Liquidaciones y Remuneraciones.md`.
## Requirements
### Requirement: Generación de Liquidaciones con estructura estándar chilena
El sistema SHALL generar liquidaciones de sueldo calculando en tiempo real, a partir de la ficha del trabajador (PE) y los parámetros vigentes:
- **Sueldo Base** proporcional a los días trabajados sobre el mes comercial de CF (`diasMesComercial`).
- **Horas Extras** según §1.1: valor hora ordinaria = (Sueldo Base / días mes comercial × 7) / jornada semanal (PE/CF); monto = valor hora × 1.5 × horas reportadas.
- **Gratificación Legal**: 25% del imponible con tope = factor `topeGratificacionLegal` × ingreso mínimo mensual / 12 (parámetros CF).
- **Bonos/Aguinaldos** manuales con flag imponible; **Asignación Familiar** desde el tramo MA referenciado por la ficha × cargas; **movilización/colación** como no imponibles.
- **Descuentos legales**: AFP por `tasaCotizacion` del maestro; salud Fonasa 7% o Isapre (valor UF con `ufMensual` o %); SIS por `tasaSIS`; seguro de cesantía y APV opcionales.
- **Totales de control**: total haberes, total imponible, total descuentos, alcance líquido, descuento de anticipos pendientes y líquido final a pagar.

#### Scenario: Cálculo de hora extra según jornada
- **WHEN** se genera una liquidación para un trabajador con 2 horas extra registradas
- **THEN** el valor hora se deriva del sueldo base, el mes comercial de CF y la jornada semanal de la ficha, aplicando recargo 50%
- **AND** las líneas quedan snapshot-eadas inmutables en la liquidación

#### Scenario: CF sin parámetros legales bloquea la generación
- **WHEN** se intenta generar una liquidación sin `ufMensual`, `ingresoMinimoMensual`, `topeGratificacionLegal` o `tasaSIS` cargados en CF
- **THEN** la acción retorna `{ok:false}` citando "CF no cargado" y no muta el estado

### Requirement: Gestión de Adelantos de Sueldo
El sistema SHALL registrar adelantos en efectivo con glosa explicativa obligatoria, folio de comprobante ADE auto-generado y ciclo de vida `pendiente → descontado`. Un adelanto descontado queda ligado a su liquidación y no puede eliminarse.

#### Scenario: Comprobante de entrega instantáneo
- **WHEN** la administración registra un anticipo válido
- **THEN** el sistema emite folio ADE-#### auditable (`PL_ADD_ADVANCE`) y notifica al trabajador por canal simulado

#### Scenario: Anticipo descontado en la liquidación
- **WHEN** se genera una liquidación del periodo para un trabajador con adelantos pendientes
- **THEN** los anticipos se restan como "Descuento de Anticipos" y pasan a estado descontado al confirmar

### Requirement: Integración contable con FI
Al confirmar una liquidación el sistema SHALL registrar automáticamente un Egreso de Comunidad en FI bajo la categoría "sueldos", imputado al fondo GC activo, dejando la referencia materializada (`egresoFIReferencia`). Solo liquidaciones confirmadas admiten certificado CT §1.3.

#### Scenario: Confirmación sincroniza egreso
- **WHEN** la administración confirma una liquidación en borrador
- **THEN** se crea el egreso FI categoría sueldos por el total a pagar y la referencia queda materializada con evento `PL_EXPENSE_SYNC`

#### Scenario: Eliminación restringida
- **WHEN** se intenta eliminar una liquidación confirmada o con egreso sincronizado
- **THEN** la acción retorna `{ok:false}`; solo borradores sin egreso son eliminables (`PL_DELETE_PAYSLIP`)

### Requirement: Historial de Folios
Cada liquidación SHALL llevar un folio único correlativo LIQ-#### que permita búsqueda rápida y auditoría documental.

#### Scenario: Folio correlativo único
- **WHEN** se generan varias liquidaciones en la sesión
- **THEN** cada una recibe el siguiente folio LIQ disponible sin duplicados

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

### Requirement: Integración con Auditoría y Métricas (AM)
Toda operación del ciclo de remuneraciones SHALL emitir eventos inmutables con data cuantificable:
- **Evento:** `PL_GENERATE_PAYSLIP`, `PL_ADD_ADVANCE`, `PL_DELETE_PAYSLIP`, `PL_EXPENSE_SYNC`
- **Data Cuantificable:** gasto mensual total en remuneraciones (monto del egreso), volumen de adelantos por trabajador, horas extra liquidadas
- **Métrica:** desviación presupuestaria en sueldos vs proyección PE, tiempo de ciclo de pago, tasa de retenciones previsionales sobre imponibles

#### Scenario: Ciclo de remuneración trazado
- **WHEN** se registra un adelanto, se genera una liquidación en borrador y se confirma
- **THEN** los eventos `PL_ADD_ADVANCE`, `PL_GENERATE_PAYSLIP` y `PL_EXPENSE_SYNC` quedan registrados como inmutables con su data cuantificable

### Requirement: Setup de remuneraciones TEST vía helper compartido
El spec de remuneraciones SHALL crear su trabajador TEST vía
`e2e/helpers/datos-test` (`crearTrabajadorTEST`: maestros legales + params
CF + persona con ficha completa) y limpiarlo al final
(`limpiarTrabajadorTEST`: borradores + egreso espejo + persona), sin setup
inline duplicado. El flujo UI (generar borrador, confirmar, folio LIQ-)
queda idéntico. La liquidada confirmada sigue inmutable por diseño (documento
de auditoría con periodo TEST futuro).

#### Scenario: Trabajador TEST del helper genera y confirma liquidación
- **WHEN** existe un trabajador TEST creado vía el helper
- **THEN** el flujo genera el borrador con folio LIQ-, lo confirma y el
  cleanup elimina borradores, egreso espejo y persona sin residuos TEST.

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

