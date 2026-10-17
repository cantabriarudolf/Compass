## MODIFIED Requirements

### Requirement: Períodos de Directiva con Período Vigente Único
El sistema SHALL registrar los períodos de directiva como entidad `PeriodoDirectiva` (`id`, `fechaInicio`, `duracionMeses`, `fechaInscripcion`, `referenciaInscripcion`, `fechasEstimadas?`, `estado: vigente|cerrado`, `actaOrigenId?`, `miembros`), persistida en la tabla `periodos_directiva` y gestionada por `/api/periodos-directiva` (POST upsert idempotente por id, GET paginado scoped, detalle/PUT/DELETE en `[id]`, `POST /[id]/cerrar`), siempre acotada a la comunidad del usuario. `duracionMeses` SHALL estar entre 1 y 36 (art. 17 Ley 21.442) y `referenciaInscripcion` SHALL ser obligatoria. SHALL existir a lo más un período `vigente` por comunidad: al activar uno nuevo el vigente previo se cierra archivando su nómina (rotación), y un `PUT` que intente activar otro vigente distinto SHALL rechazarse con 409. La nómina de un período que se activa `vigente` SHALL ser impar de 3 a 5 miembros, cada uno existente en MP con cuenta `activa` y cargo `presidente|tesorero|secretario|director`. Un período `cerrado` NO SHALL reabrirse. La vista `/comunidad/directiva` SHALL mostrar el período vigente (inicio, fin, inscripción, nómina y respaldo), sus alertas de vencimiento solo informativas (vencido, ≤30 y ≤90 días) y los períodos históricos en solo lectura.

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
El cierre de un período SHALL archivar su nómina en `miembros` (`personaId`, `nombre`, `cargo`, `fechaAsuncion` y, si la ficha los declara, `fechaTermino`/`motivoTermino`), construida desde las fichas de `datosGobernanza` de MP cuyo `periodoId` corresponde al período. El cierre manual (`POST /api/periodos-directiva/[id]/cerrar`) SHALL fijar `estado: "cerrado"` y `fechaFin` (por defecto hoy) y rechazar con 409 un período ya cerrado. Al rotar el vigente, las fichas del período cerrado que no continúan en la nómina entrante SHALL depurarse (`datosGobernanza` removido de la persona). El alta de un período (`POST /api/periodos-directiva`) SHALL emitir el evento AM `GD_PERIODO_REGISTRADO` al registrar un período.

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
