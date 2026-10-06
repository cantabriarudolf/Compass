# AD-gestion-administrativa Specification

## Purpose
Centralizar el panel de administración: perfiles comunitarios, controles de privacidad/comunicación por unidad, gobernanza con firma digitalizada y acceso de lectura al personal (RRHH). Fuente de verdad: `Data/NSGC/docs/especificaciones/AD - Gestión Administrativa.md`.

## Requirements

### Requirement: Perfiles de Identidad Comunitarios
El panel del administrador SHALL presentar los perfiles de propietarios, residentes y directiva a partir de `personas` y sus vínculos (VU), mostrando nombre, apellidos, RUT, teléfono, email y fotografía. La fotografía SHALL manejarse por referencia (metadatos + URL) conforme a ST; el panel NO SHALL duplicar datos de identidad fuera del store.

#### Scenario: Agrupación por rol comunitario
- **WHEN** la administración abre el Cajón de Comunidad
- **THEN** ve las personas agrupadas según su rol en `personas.roles` y sus vínculos vigentes (propietario, arrendatario/residente, directiva vía `datosGobernanza`)

#### Scenario: Fotografía por referencia (D1)
- **WHEN** se guarda o edita la fotografía de un perfil
- **THEN** se persiste solo como URL/referencia con metadatos, nunca base64/Blob

### Requirement: Controles de Privacidad y Comunicación del Propietario
El sistema MUST mantener una colección `controlesPropiedad` por unidad con los flags `residenteVeMorosidad`, `residenteVeActas` y `alertasResidentesActivas`, editables por el propietario de la unidad y por administración mediante `saveControlPropiedad` (validando FK a `unidades` y retornando `StoreResult`). Por defecto los flags de visibilidad están desactivados y las alertas activadas. Todo cambio emite el evento AM `AD_OWNER_CONFIG_CHANGE`.

#### Scenario: Notificar a Residentes
- **WHEN** el propietario activa "Notificar a Residentes" para su unidad
- **THEN** `residenteVeMorosidad` y/o `residenteVeActas` se persisten en `controlesPropiedad`
- **AND** GD/FI consultan estos flags antes de mostrar actas o reportes de morosidad al residente

#### Scenario: Gestión de Alertas Residentes
- **WHEN** el propietario silencia "Gestión de Alertas Residentes" (visitas, encomiendas, reservas)
- **THEN** `notify()` no genera notificaciones automáticas dirigidas al residente de esa unidad mientras `alertasResidentesActivas` sea `false`

#### Scenario: Cambio auditado
- **WHEN** cualquier flag cambia
- **THEN** AM registra `AD_OWNER_CONFIG_CHANGE` con el estado anterior y nuevo

### Requirement: Directiva y Firma Digitalizada
El panel SHALL administrar los miembros de la directiva con cargo (`presidente|tesorero|secretario|director` vía `datosGobernanza`) y firma digitalizada cargada como referencia (URL/metadata, sin payload binario). Cada carga o reemplazo de firma emite `AD_DIRECTIVA_SIGN_UPLOAD`. La firma queda disponible para la aprobación formal de actas de GD. La ficha `datosGobernanza` SHALL declarar además, de forma opcional, el `periodoId` del período de directiva al que pertenece el miembro y `fechaTermino`/`motivoTermino` (`renuncia|remocion|fin_periodo`) para dejar constancia del término del cargo. Al guardar una persona con rol `directiva` cuya ficha no declara `periodoId`, `savePersona` SHALL heredar automáticamente el `periodoId` del período vigente registrado. El perfil de la persona SHALL ofrecer la administración de esa ficha: un diálogo de alta/edición con cargo (enum), fecha de asunción (ISO) y firma digitalizada opcional por URL, validado con `ExtensionGobernanzaSchema` y con id estable `g-<personaId>` al crear. Si un guardado llega sin el rol `directiva` pero portando `datosGobernanza`, la ficha SHALL depurarse para no dejar miembros fantasma en el quórum y SHALL emitirse el evento `AD_DIRECTIVA_DESVINCULADA`.

#### Scenario: Carga de firma por referencia (D1)
- **WHEN** un miembro de la directiva (o administración) sube su firma digitalizada
- **THEN** `datosGobernanza.firmaDigital` guarda solo la URL/referencia de la imagen
- **AND** AM registra `AD_DIRECTIVA_SIGN_UPLOAD`

#### Scenario: Intento de firma embebida rechazado
- **WHEN** una acción recibe la firma como data-URL/base64
- **THEN** retorna `{ok:false}` con error D1 y no muta el estado

#### Scenario: Ficha de directiva hereda el período vigente
- **WHEN** `savePersona` recibe una persona con rol `directiva` y `datosGobernanza` sin `periodoId`, existiendo un período de directiva vigente
- **THEN** la ficha persistida guarda el `periodoId` de ese período vigente sin alterar su cargo ni su firma

#### Scenario: Ficha de gobernanza editable desde el perfil
- **WHEN** la administración abre la pestaña Gobernanza del perfil de una persona con rol `directiva`
- **THEN** ve la ficha vigente (cargo, fecha de asunción, firma digitalizada) con acción de edición, o un estado vacío con acción para registrar la ficha
- **AND** ambas acciones abren un diálogo que persiste `cargoDirectiva` del enum, `fechaAsuncion` en ISO y `firmaDigital` opcional por URL, validado con `ExtensionGobernanzaSchema`
- **AND** al crear, la ficha toma el id estable `g-<personaId>`

#### Scenario: Ficha sin rol directiva se depura y audita
- **WHEN** `savePersona` recibe una persona cuyos `roles` no incluyen `directiva` pero que porta `datosGobernanza`
- **THEN** la persona persistida queda sin `datosGobernanza`, de modo que no cuenta para el quórum de la directiva vigente
- **AND** AM registra `AD_DIRECTIVA_DESVINCULADA` referenciando a esa persona

#### Scenario: Rol directiva sin ficha queda como ficha pendiente
- **WHEN** `savePersona` recibe una persona con rol `directiva` y sin `datosGobernanza`
- **THEN** el guardado se acepta y la persona no cuenta para el quórum hasta registrar su ficha

### Requirement: Acceso Centralizado al Personal (RRHH)
El panel SHALL ofrecer un Cajón de Recursos Humanos que liste las fichas de trabajadores desde `personas.datosLaborales` (conserjes, aseoo, seguridad, mantención). Es un acceso de lectura centralizado: los requerimientos contractuales y previsionales detallados pertenecen a PE y NO SHALL duplicarse aquí.

#### Scenario: Listado de personal
- **WHEN** la administración abre el Cajón de Recursos Humanos
- **THEN** ve las personas con extensión laboral vigente agrupadas por función, leyendo exclusivamente del store

### Requirement: Integración con Auditoría y Métricas (AM)
El módulo SHALL emitir `AD_OWNER_CONFIG_CHANGE` y `AD_DIRECTIVA_SIGN_UPLOAD` como eventos inmutables con data cuantificable (número de propietarios que comparten información, firmas subidas).

#### Scenario: Métrica de rotación de cargos
- **WHEN** la reportería consulta gobernanza
- **THEN** puede derivar rotación de cargos de directiva a partir de `datosGobernanza.fechaAsuncion` y los eventos AM

### Requirement: Switch de privacidad con reflejo inmediato
El switch de morosidad es controlado por la lista SWR y la revalidación
tarda segundos bajo carga dev (el assert a 600ms fallaba). SHALL aplicar
override optimista local al instante, esperar la revalidación tras el PUT y
conciliar después (igual que proyectos/reservas con `mutateGlobal`).

#### Scenario: Toggle flippea y persiste
- **WHEN** se clickea el switch y se recarga
- **THEN** `aria-checked` cambia al instante y persiste tras reload.
