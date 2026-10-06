# GD-gestion-directiva Specification

## Purpose
Registrar reuniones y actas de la directiva con control de asistencia, flujo de aprobación por quórum 100% y publicación formal a propietarios, resguardando la privacidad frente a residentes. Fuente de verdad: `Data/NSGC/docs/especificaciones/GD - Gestión de Directiva.md`.

## Requirements

### Requirement: Registro de Reunión y Acta
El sistema MUST permitir registrar reuniones con fecha, hora, lugar y tabla de temas; control de asistencia marcando presentes y ausentes de la directiva vigente (`personas.datosGobernanza`) e invitados especiales (texto libre); minuta de acuerdos; y soporte documental con adjuntos por referencia (acta escaneada o imágenes: solo nombre, tipo MIME, tamañoKB, url — D1). La gestión se realiza con `saveActaGD`/`removeActaGD` retornando `StoreResult` con validación referencial de asistentes. La validación de asistencia SHALL acotarse al período de directiva vigente: un asistente cuenta como miembro solo si su ficha de gobernanza pertenece a ese período (una ficha sin `periodoId` cuenta únicamente mientras no exista período registrado, y una ficha con `fechaTermino` nunca cuenta). El acta SHALL llevar el `periodoId` del período vigente al momento de su creación — heredado automáticamente cuando el payload no lo declara — tanto en `saveActaGD` (store) como en `POST /api/actas-gd`.

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

#### Scenario: Acta hereda el período vigente
- **WHEN** se crea un acta sin declarar `periodoId` y existe un período de directiva vigente en la comunidad
- **THEN** el acta se persiste con el `periodoId` de ese período vigente (trazabilidad del libro GD)

### Requirement: Flujo de Aprobación de Actas

El acta MUST permanecer en estado "Borrador de Directiva" hasta que todos los miembros vigentes de la directiva aprueben mediante `aprobarActaGD` (botonera "Aprobar Acta" por miembro, con firma digitalizada disponible desde AD). El sistema MUST ofrecer un monitor de firmas pendientes. Al alcanzar el 100% de la directiva vigente, el acta pasa a "Publicada": emite notificación a todos los propietarios vía `notify()` con canal `email_simulado` (con link/descarga del acta referenciada) y queda con la referencia de aviso en CV marcada como `"pendiente"` hasta que el Visor de Mensajes la publique mediante `publicarActaEnCV`, momento en que la referencia se materializa con el id del aviso creado. La "directiva vigente" cuyo 100% define el quórum SHALL acotarse a las fichas de gobernanza activas cuyo `periodoId` coincide con el período de directiva vigente (una ficha sin `periodoId` cuenta solo mientras no exista período registrado; una ficha con `fechaTermino` queda fuera), tanto en `aprobarActaGD` (store) como en `POST /api/actas-gd/[id]/aprobar`.

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

#### Scenario: Quórum acotado al período vigente
- **WHEN** existe un período vigente con una nómina de 3 fichas y hay fichas de gobernanza de otro período o legadas sin `periodoId`
- **THEN** el 100% requerido para publicar se computa solo sobre las 3 fichas del período vigente

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

### Requirement: Gestión robusta ante extensiones nulas
La vista `/admin/gestion` MUST NOT reventar (`Application error`) cuando una
persona en la comunidad tiene `datosGobernanza` o `datosLaborales` en `null`
(JSON de BD) en vez de ausente. Los filtros de las listas de Directiva y
Personal SHALL tratar `null` igual que `undefined` (solo entran fichas con
extensión presente), de modo que los 6 roles de validación rendericen la
página sin excepciones de cliente.

#### Scenario: Directiva con ficha sin extensión no revienta
- **WHEN** un rol con acceso (admin, comite, residente, arrendatario con login
  residente) abre `/admin/gestion` en una comunidad donde existe al menos una
  persona con `datosGobernanza` en `null`
- **THEN** la página SHALL renderizar el sidebar y las listas sin
  `Application error` y sin `pageerror`, excluyendo esa ficha del cajón de
  Directiva.

#### Scenario: Personal con ficha sin extensión no revienta
- **WHEN** se carga `/admin/gestion` con una persona con `datosLaborales` en
  `null`
- **THEN** la pestaña Personal SHALL excluir esa ficha sin excepciones,
  igual que con extensión ausente.

### Requirement: Períodos de Directiva con Período Vigente Único
El sistema SHALL registrar los períodos de directiva como entidad `PeriodoDirectiva` (`id`, `fechaInicio`, `duracionMeses`, `fechaInscripcion`, `referenciaInscripcion`, `fechasEstimadas?`, `estado: vigente|cerrado`, `actaOrigenId?`, `miembros`), persistida en la tabla `periodos_directiva` y gestionada por la acción legacy `savePeriodoDirectiva` (store) y por `/api/periodos-directiva` (POST upsert idempotente por id, GET paginado scoped, detalle/PUT/DELETE en `[id]`, `POST /[id]/cerrar`), siempre acotada a la comunidad del usuario. `duracionMeses` SHALL estar entre 1 y 36 (art. 17 Ley 21.442) y `referenciaInscripcion` SHALL ser obligatoria. SHALL existir a lo más un período `vigente` por comunidad: al activar uno nuevo el vigente previo se cierra archivando su nómina (rotación), y un `PUT` que intente activar otro vigente distinto SHALL rechazarse con 409. La nómina de un período que se activa `vigente` SHALL ser impar de 3 a 5 miembros, cada uno existente en MP con cuenta `activa` y cargo `presidente|tesorero|secretario|director`. Un período `cerrado` NO SHALL reabrirse. La vista `/comunidad/directiva` SHALL mostrar el período vigente (inicio, fin, inscripción, nómina y respaldo), sus alertas de vencimiento solo informativas (vencido, ≤30 y ≤90 días) y los períodos históricos en solo lectura.

#### Scenario: Registro de período vigente y rotación del anterior
- **WHEN** se registra un período con `estado: "vigente"` mientras existe otro período vigente
- **THEN** el período previo queda con `estado: "cerrado"` y su `fechaFin` igual al inicio del nuevo, con su nómina archivada en `miembros`
- **AND** el período nuevo queda vigente con las fichas de su nómina asignadas (`periodoId`)

#### Scenario: Nómina no impar de 3 a 5 rechazada
- **WHEN** se intenta activar un período vigente con una nómina par o fuera del rango 3–5 miembros
- **THEN** la acción retorna `{ok:false}` (400 en la API) citando art. 17 Ley 21.442 y no muta el estado

#### Scenario: Duración mayor a 36 meses rechazada
- **WHEN** se registra un período con `duracionMeses` mayor a 36 (o menor a 1)
- **THEN** la validación de `PeriodoDirectivaSchema` lo rechaza (400 en la API) y no se persiste

#### Scenario: Segundo vigente rechazado por PUT
- **WHEN** un `PUT` intenta pasar a `vigente` un período existente mientras otro período ya está vigente
- **THEN** la API responde 409 sin mutar el estado

#### Scenario: Período cerrado no se reabre
- **WHEN** se intenta pasar a `vigente` un período `cerrado` (por PUT o por POST upsert)
- **THEN** la API responde 409 (el libro archivado no se reabre)

#### Scenario: Eliminación de período vigente bloqueada
- **WHEN** se intenta `DELETE` sobre un período `vigente`
- **THEN** la API responde 409 indicando que debe cerrarse antes (el libro no se borra estando en curso)

#### Scenario: Alerta de vencimiento informativa
- **WHEN** el período vigente está vencido o a ≤30 o ≤90 días de su fin calculado (`fechaFin` o inicio + `duracionMeses`)
- **THEN** la vista muestra un badge de alerta equivalente sin bloquear la gestión de actas (la ley no anula actos por mora en el cierre)

### Requirement: Cierre de Período con Nómina Archivada
El cierre de un período SHALL archivar su nómina en `miembros` (`personaId`, `nombre`, `cargo`, `fechaAsuncion` y, si la ficha los declara, `fechaTermino`/`motivoTermino`), construida desde las fichas de `datosGobernanza` de MP cuyo `periodoId` corresponde al período. El cierre manual (`POST /api/periodos-directiva/[id]/cerrar`) SHALL fijar `estado: "cerrado"` y `fechaFin` (por defecto hoy) y rechazar con 409 un período ya cerrado. Al rotar el vigente, las fichas del período cerrado que no continúan en la nómina entrante SHALL depurarse (`datosGobernanza` removido de la persona). La acción legacy `savePeriodoDirectiva` SHALL emitir el evento AM `GD_PERIODO_REGISTRADO` al registrar un período.

#### Scenario: Cierre manual archiva la nómina desde MP
- **WHEN** la administración cierra el período vigente
- **THEN** el período queda `cerrado` con `fechaFin` y su `miembros` contiene la nómina tomada de las fichas con ese `periodoId`
- **AND** un segundo cierre del mismo período responde 409

#### Scenario: Fichas salientes se depuran al rotar
- **WHEN** se activa un período nuevo y una persona del período anterior no integra la nómina entrante
- **THEN** su `datosGobernanza` se depura y deja de contar para el quórum

#### Scenario: Nómina de un cerrado congelada
- **WHEN** un `PUT` envía `miembros` sobre un período `cerrado`
- **THEN** la API responde 409 (historia del libro) y no reescribe las fichas

#### Scenario: Período con actas no se elimina
- **WHEN** se intenta `DELETE` sobre un período `cerrado` referenciado por actas (`actas_gd.periodoId`)
- **THEN** la API responde 409 preservando la trazabilidad del libro

### Requirement: Migración v28 con Período Inicial Estimado
La migración de `STORE_VERSION` a 28 SHALL inyectar un período inicial `id: "periodo-1"` cuando el estado persistido provenga de una versión previa: `duracionMeses: 36`, `fechasEstimadas: true`, `estado: "vigente"`, `fechaInicio`/`fechaInscripcion` derivadas de la primera ficha de gobernanza y `miembros` construida desde las fichas existentes. SHALL además asignar `periodoId: "periodo-1"` a las fichas de gobernanza que no lo declaren. La migración SHALL ser idempotente por id y NO SHALL inyectar el período si `PeriodoDirectivaSchema` lo rechaza (entonces el quórum legado sigue cubriendo).

#### Scenario: Rehidratación v27 inyecta el período inicial
- **WHEN** un store persistido en versión 27 se rehidrata
- **THEN** `periodosDirectiva` contiene `periodo-1` vigente con `fechasEstimadas: true` y las fichas de gobernanza existentes reciben ese `periodoId` sin perder datos previos

#### Scenario: Segunda migración no duplica el período
- **WHEN** la migración v28 se aplica sobre un estado que ya contiene `periodo-1`
- **THEN** no se duplica el período ni se alteran las fichas ya migradas
