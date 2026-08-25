# GD-gestion-directiva Specification

## Purpose
Registrar reuniones y actas de la directiva con control de asistencia, flujo de aprobación por quórum 100% y publicación formal a propietarios, resguardando la privacidad frente a residentes. Fuente de verdad: `Data/NSGC/docs/especificaciones/GD - Gestión de Directiva.md`.
## Requirements
### Requirement: Registro de Reunión y Acta
El sistema MUST permitir registrar reuniones con fecha, hora, lugar y tabla de temas; control de asistencia marcando presentes y ausentes de la directiva vigente (`personas.datosGobernanza`) e invitados especiales (texto libre); minuta de acuerdos; y soporte documental con adjuntos por referencia (acta escaneada o imágenes: solo nombre, tipo MIME, tamañoKB, url — D1). La gestión se realiza con `saveActaGD`/`removeActaGD` retornando `StoreResult` con validación referencial de asistentes.

#### Scenario: Acta con asistencia completa
- **WHEN** el administrador o secretario guarda un acta con presentes, ausentes e invitados
- **THEN** `saveActaGD` persiste el registro validando que presentes/ausentes sean miembros de directiva vigentes
- **AND** AM registra `GD_ACTA_CREATED` y un evento `GD_ASISTENCIA_REG` por miembro

#### Scenario: Adjuntos por referencia (D1)
- **WHEN** se adjunta el acta escaneada o imágenes de registros físicos
- **THEN** cada adjunto guarda solo metadatos + URL, jamás base64/Blob

#### Scenario: Asistente inexistente rechazado
- **WHEN** `saveActaGD` recibe un asistente que no existe en `personas`
- **THEN** retorna `{ok:false}` con error de integridad y no muta el estado

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

### Requirement: Privacidad Propietario vs Residente
Las actas MUST ser invisibles para residentes (arrendatarios) por defecto: solo propietarios y administración acceden al repositorio documental. Un residente ve un acta únicamente si el propietario de su unidad activó `residenteVeActas` en `controlesPropiedad` (AD), check bloqueado por defecto.

#### Scenario: Residente sin autorización
- **WHEN** un residente intenta abrir `/comunidad/directiva` sin `residenteVeActas` en su unidad
- **THEN** no ve ninguna acta ni su contenido

#### Scenario: Residente autorizado por su dueño
- **WHEN** el propietario activó el check de actas y el residente abre la sección
- **THEN** ve las actas publicadas (no los borradores) de su unidad/comunidad

#### Scenario: Borradores restringidos
- **WHEN** cualquier rol distinto de directiva/administración consulta actas en estado "Borrador de Directiva"
- **THEN** los borradores no son visibles

### Requirement: Integración con Auditoría y Métricas (AM)
El módulo SHALL emitir `GD_ACTA_CREATED`, `GD_ACTA_APPROVED` y `GD_ASISTENCIA_REG` como eventos inmutables con data cuantificable: número de actas aprobadas, días promedio de aprobación (creado→publicada) y porcentaje de asistencia por reunión.

#### Scenario: Métricas de gobernanza
- **WHEN** la reportería consulta gobernanza
- **THEN** puede derivar tiempo promedio de aprobación, cumplimiento de quórum y actas publicadas a partir de eventos y fechas del acta

