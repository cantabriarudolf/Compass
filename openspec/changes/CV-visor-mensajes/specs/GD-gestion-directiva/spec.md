# GD-gestion-directiva (delta del change CV-visor-mensajes)

## MODIFIED Requirements

### Requirement: Flujo de Aprobación de Actas

El acta MUST permanecer en estado "Borrador de Directiva" hasta que todos los miembros vigentes de la directiva aprueben mediante `aprobarActaGD` (botonera "Aprobar Acta" por miembro, con firma digitalizada disponible desde AD). El sistema MUST ofrecer un monitor de firmas pendientes. Al alcanzar el 100% de la directiva vigente, el acta pasa a "Publicada": emite notificación a todos los propietarios vía `notify()` con canal `email_simulado` (con link/descarga del acta referenciada) y queda con la referencia de aviso en CV marcada como `"pendiente"` hasta que el Visor de Mensajes la publique mediante `publicarActaEnCV`, momento en que la referencia se materializa con el id del aviso creado.

#### Scenario: Publicación automática al quórum
- **WHEN** la última firma pendiente completa el 100% de la directiva vigente
- **THEN** el estado pasa a "Publicada" con fecha de publicación
- **AND** `notify()` genera una notificación por propietario con canal `email_simulado`
- **AND** la referencia de aviso en CV queda `"pendiente"` hasta su publicación en el visor

#### Scenario: Referencia materializada por CV
- **WHEN** el visor de mensajes publica un acta Publicada con referencia `"pendiente"`
- **THEN** `avisoCVReferencia` guarda el id del aviso creado y no admite republicación

#### Scenario: Aprobación individual auditada
- **WHEN** un miembro de la directiva aprueba el acta
- **THEN** `aprobarActaGD` registra su id en `aprobaciones`, emite `GD_ACTA_APPROVED` y el monitor muestra las firmas restantes

#### Scenario: Aprobación sin ser directivo rechazada
- **WHEN** un rol sin `datosGobernanza` vigente intenta aprobar
- **THEN** retorna `{ok:false}` según RP y no muta `aprobaciones`
