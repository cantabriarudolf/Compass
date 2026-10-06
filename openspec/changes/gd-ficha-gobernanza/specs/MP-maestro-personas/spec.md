# MP-maestro-personas (delta del change gd-ficha-gobernanza)

## MODIFIED Requirements

### Requirement: Extensiones por Rol y FK a MA/RP

`Persona` base `MP-maestro-personas:22` se extiende por rol `PE(personal): MA.afps/previsiones/mutuales/bancos + CF.jornada` y `GD(directiva)`. Seed `personas` incluye `roles` enum FK blanda a `RP-roles-permisos:22`. Carga de extensiones SHALL esperar `MP` cargada. La extensión `GD(directiva)` (`datosGobernanza`) SHALL ser coherente con el rol en toda escritura de persona: si un guardado llega sin `directiva` en `roles` y con `datosGobernanza`, la ficha SHALL depurarse (`savePersona` en el store y su espejo en la capa API) para no dejar miembros fantasma que inflen el quórum. El guardado vía `savePersona` SHALL emitir `AD_DIRECTIVA_DESVINCULADA` al depurar esa ficha.

#### Scenario: Persona con extensión laboral
- **WHEN** `persona.roles incluye personal` y falta `MA.afps`
- **THEN** validación de extensión laboral falla hasta cargar `MA`.

#### Scenario: Ficha de gobernanza sin rol directiva se depura
- **WHEN** una escritura de persona (UI, QA Lab o API) guarda `roles` sin `directiva` portando `datosGobernanza`
- **THEN** la persona persistida no conserva `datosGobernanza`
- **AND** si la escritura fue vía `savePersona`, AM registra `AD_DIRECTIVA_DESVINCULADA`

#### Scenario: Rol directiva sin ficha queda pendiente
- **WHEN** `savePersona` guarda una persona con rol `directiva` y sin `datosGobernanza`
- **THEN** el guardado es válido y la persona no cuenta como miembro vigente para el quórum hasta registrar su ficha
