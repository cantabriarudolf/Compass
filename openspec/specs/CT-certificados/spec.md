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

### Requirement: Historial de Emisión con código de verificación
Cada certificado emitido SHALL registrarse en `certificadosCT` con folio CT-#### correlativo, código de verificación único, fecha, solicitante, tipología y snapshot inmutable del payload usado. El historial es auditablemente inmutable: solo registros TEST son eliminables.

#### Scenario: Código único verificable
- **WHEN** se generan varios certificados
- **THEN** cada uno recibe folio y código de verificación distintos, consultables desde el historial

#### Scenario: Historial inmutable
- **WHEN** se intenta eliminar un certificado emitido no TEST
- **THEN** la acción retorna `{ok:false}` preservando la trazabilidad documental

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

