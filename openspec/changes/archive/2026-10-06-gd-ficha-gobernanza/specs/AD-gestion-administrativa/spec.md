# AD-gestion-administrativa (delta del change gd-ficha-gobernanza)

## MODIFIED Requirements

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
