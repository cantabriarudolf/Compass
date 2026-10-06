# CT-certificados (delta del change gd-periodos-directiva)

## MODIFIED Requirements

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
