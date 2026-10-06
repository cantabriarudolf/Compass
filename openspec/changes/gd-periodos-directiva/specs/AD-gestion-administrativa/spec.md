# AD-gestion-administrativa (delta del change gd-periodos-directiva)

## MODIFIED Requirements

### Requirement: Directiva y Firma Digitalizada
El panel SHALL administrar los miembros de la directiva con cargo (`presidente|tesorero|secretario|director` vía `datosGobernanza`) y firma digitalizada cargada como referencia (URL/metadata, sin payload binario). Cada carga o reemplazo de firma emite `AD_DIRECTIVA_SIGN_UPLOAD`. La firma queda disponible para la aprobación formal de actas de GD. La ficha `datosGobernanza` SHALL declarar además, de forma opcional, el `periodoId` del período de directiva al que pertenece el miembro y `fechaTermino`/`motivoTermino` (`renuncia|remocion|fin_periodo`) para dejar constancia del término del cargo. Al guardar una persona con rol `directiva` cuya ficha no declara `periodoId`, `savePersona` SHALL heredar automáticamente el `periodoId` del período vigente registrado.

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
