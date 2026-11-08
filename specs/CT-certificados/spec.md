# CT-certificados Specification

## Purpose

Generar la documentación oficial y acreditaciones para residentes y personal, garantizando la validez de la información mediante la firma digital del administrador, folios verificables e historial de emisión. Fuente de verdad: `Data/NSGC/docs/especificaciones/CT - Certificados.md`.

## Requirements

### Requirement: Tipologías de Certificados con gates por fuente
El sistema SHALL ofrecer 4 tipologías que se nutren de datos reales del store, validando antes de emitir:
- **Certificado de Residencia**: el solicitante DEBE tener vínculo vigente (sin `fechaFin`) en la unidad indicada.
- **Estado de Cuenta / Fondos**: snapshot de cargos, pagos y saldo pendiente de la unidad desde FI.
- **Certificado Liquidación de Sueldo**: solo sobre liquidaciones PL confirmadas; generado por administración o descargado por el trabajador tras cierre.
- **Certificado "Al Día"**: el sistema valida que el saldo pendiente total de la unidad sea <= 0 antes de permitir la emisión.

#### Scenario: Al Día bloqueado por mora
- **WHEN** se intenta emitir un certificado Al Día para una unidad con saldo pendiente > 0
- **THEN** la acción retorna `{ok:false}` citando la deuda y no registra emisión

#### Scenario: Residencia exige vínculo activo
- **WHEN** se solicita un certificado de residencia para una persona sin vínculo vigente en la unidad
- **THEN** la emisión es rechazada citando VU

### Requirement: Emisión por tipología y quién puede emitir cada una
`POST /api/certificados-ct` SHALL despachar la tipología a la clave de permiso que la gobierna mediante un único mapa (`RECURSO_DE_EMISION_POR_TIPO` en `lib/certificados-ct.ts`, el mismo que consume la pantalla): `residencia` → `ct:residencia`, `al_dia` → `ct:al_dia`, `estado_cuenta` y `liquidacion_sueldo` → `ct`. Un rol sin `crear` sobre la clave de esa tipología SHALL recibir 403 y SHALL NOT crear fila. El filtro de tipologías de `/comunidad/certificados` SHALL resolverse en el servidor con esa misma tabla, de modo que la pantalla nunca ofrezca una tipología que la ruta va a negar.

Base legal (Ley 21.442): el **certificado de residencia no está regulado** por la ley ni reservado al administrador — el boletín 17737-14, en tramitación, busca *facultar* a los administradores para emitirlo, prueba negativa de que hoy no lo están—, así que el residente SHALL poder emitirlo por sí mismo, sólo para su vínculo vigente y su propia persona. El **estado de cuenta** y el **«al día»** SHALL quedar reservados a la administración: el art. 20 N° 4 pone entre sus funciones «emitir certificados en lo relativo al estado de deudas de las unidades» y el art. 15 manda acreditar la calidad de copropietario hábil «mediante certificado expedido por el administrador»; el art. 21 les da acceso a la documentación, y consultar no es certificar. La **liquidación de sueldo** es documento del empleador (PL). Propietario y arrendatario no se distinguen: la residencia es un hecho del ocupante y el sistema usa el vínculo vigente.

Las compuertas SHALL evaluarse en este orden y no otro: `rechazoDeEmisionAjena` (404, sin revelar la existencia ni el saldo de la unidad ajena) → tipología no emisible (403) → gate de saldo (409). El gate de saldo va último porque su mensaje imprime el monto pendiente de la unidad.

#### Scenario: El residente emite su certificado de residencia
- **WHEN** un residente hace `POST /api/certificados-ct` con `tipo: "residencia"` y su propia unidad y persona, con vínculo vigente
- **THEN** la respuesta es 201 y el registro queda a nombre de la persona de la sesión

#### Scenario: Residencia sin anclaje no acredita ningún vínculo
- **WHEN** un residente emite `residencia` sin `unidadId` ni `personaId`
- **THEN** la respuesta es 400 («El certificado de residencia exige persona y unidad.») y no se crea fila: la administración conserva su camino sin anclaje

#### Scenario: El residente no emite «al día» aunque su saldo sea cero
- **WHEN** un residente hace `POST /api/certificados-ct` con `tipo: "al_dia"` para su propia unidad sin deuda
- **THEN** la respuesta es 403 (la clave `ct:al_dia` le concede `ver`, no `crear`) y no se crea fila: el saldo en cero no habilita un acto que la ley reserva al administrador

#### Scenario: Estado de cuenta y liquidación tampoco salen de su mano
- **WHEN** un residente pide `estado_cuenta` de su unidad o `liquidacion_sueldo` de su persona
- **THEN** ambas responden 403 y no crean fila (`ct` sin `crear` para el residente; la liquidación es documento del empleador)

#### Scenario: El orden de compuertas pone el 404 antes del 403 y del 409
- **WHEN** un residente pide cualquier tipología contra la unidad o la persona de un vecino
- **THEN** la respuesta es 404, sin monto y sin id, aunque la tipología tampoco fuera emisible para su rol: el alcance se resuelve antes y el saldo del vecino nunca se calcula

#### Scenario: La pantalla no ofrece lo que la ruta niega
- **WHEN** un residente abre `/comunidad/certificados`
- **THEN** el formulario recibe del servidor sólo `residencia`; la administración recibe las cuatro tipologías

#### Scenario: Administración y comité conservan su veredicto
- **WHEN** la administración emite cualquiera de las cuatro tipologías, o el comité intenta emitir
- **THEN** la administración obtiene 201 en las cuatro y el comité 403 (sólo tiene `ct` `ver`)

### Requirement: Historial de Emisión con código de verificación
Cada certificado emitido SHALL registrarse en `certificadosCT` con folio CT-#### correlativo, código de verificación único, fecha, solicitante, tipología y snapshot inmutable del payload usado. El historial es auditablemente inmutable: solo registros TEST son eliminables. Cuando exista un período de directiva vigente al momento de emitir, el registro SHALL incluir además `directivaRef` como snapshot no bloqueante: el `periodoId` del período vigente y sus `firmantes` (`personaId`, `nombre` y `cargo` de los miembros vigentes de ese período). La ausencia de período vigente NO SHALL bloquear la emisión: en ese caso `directivaRef` queda ausente.

#### Scenario: Código único verificable
- **WHEN** se generan varios certificados
- **THEN** cada uno recibe folio y código de verificación distintos, consultables desde el historial

#### Scenario: Historial inmutable
- **WHEN** se intenta eliminar un certificado emitido no TEST
- **THEN** la acción retorna `{ok:false}` preservando la trazabilidad documental

#### Scenario: Snapshot de la directiva vigente
- **WHEN** se emite un certificado existiendo un período de directiva vigente
- **THEN** el registro guarda `directivaRef.periodoId` con la lista de `firmantes` (persona, nombre y cargo) de la nómina vigente de ese período

#### Scenario: Emisión sin período vigente
- **WHEN** se emite un certificado sin período de directiva vigente registrado
- **THEN** la emisión se completa igual y el registro queda sin `directivaRef`

### Requirement: Firma digitalizada embebida solo en el documento
El PDF SHALL generarse con pdfmake incluyendo la firma digitalizada configurada en CF (`firmaDigitalizadaUrl`) como imagen embebida en el documento. El store MUST persistir únicamente la referencia (URL/metadatos D1); jamás el binario ni data-URLs del PDF o de la firma.

#### Scenario: PDF firmado sin persistir binario
- **WHEN** la administración genera un certificado en PDF
- **THEN** el documento descargado lleva la firma embebida y el store solo guarda `firmaUrl` como referencia

#### Scenario: Firma no configurada
- **WHEN** se genera un certificado sin `firmaDigitalizadaUrl` en CF
- **THEN** el PDF se emite con línea de firma en blanco y el registro queda auditado

### Requirement: Dependencias de Carga y Seed (ST)
CT SHALL declarar sus entidades ST con el orden canónico de carga:

- **Entidades ST**: colección `certificadosCT` en `CompassData`.
- **Depende de**: MP/VU (residencia), FI (estado de cuenta y al día), PL (liquidación confirmada), CF (identidad + firma).
- **Load Order Rank**: 6 (`6=CT/PL`).
- **Seed Manifest**: colección transaccional nace vacía; sin seeds estáticos.
- **Validación Referencial**: escritura valida FKs según tipología (unidad/persona/liquidación existentes).
- **Carga Bulk**: iteración rank asc conforme al manifest canónico.
- **Migración**: bump 23→24 aditivo (colección vacía).

#### Scenario: Store persistido v23 migra a v24
- **WHEN** un usuario con estado persistido en versión 23 abre la aplicación
- **THEN** `certificadosCT` queda disponible vacía sin pérdida de datos previos

### Requirement: Integración con Auditoría y Métricas (AM)
Cada documento generado SHALL quedar auditado como evento legal rastreable:
- **Evento:** `CT_GENERATE_RESIDENCE`, `CT_GENERATE_FINANCIAL`, `CT_GENERATE_PAYROLL`, `CT_GENERATE_AL_DIA`
- **Data Cuantificable:** cantidad de certificados por tipo, tiempo de respuesta en solicitudes
- **Métrica:** unidades con mayor demanda de certificados, trazabilidad de documentos para validación externa vía código de verificación

#### Scenario: Emisión por tipología trazada
- **WHEN** se emiten certificados de residencia, estado de cuenta, liquidación y al día
- **THEN** cada emisión genera su evento inmutable correspondiente referenciando el registro CT

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

### Requirement: GATED certificados con trío TEST propio vía API
El spec GATED de certificados SHALL crear su trío TEST vía API REST
(POST `/api/personas` + POST `/api/unidades` + POST `/api/vinculos` con rol
propietario activo) y limpiarlo al final en orden (vínculo → persona →
unidad, guards 409), sin depender de QA-Lab "Poblar todo".

#### Scenario: Certificado residencia con trío TEST
- **WHEN** persona + unidad + vínculo activo TEST existen vía API
- **THEN** el flujo genera el PDF con folio CT-, el historial lo muestra con
  código VC- y el cleanup no deja residuos TEST.
