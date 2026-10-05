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
El panel SHALL administrar los miembros de la directiva con cargo (`presidente|tesorero|secretario|director` vía `datosGobernanza`) y firma digitalizada cargada como referencia (URL/metadata, sin payload binario). Cada carga o reemplazo de firma emite `AD_DIRECTIVA_SIGN_UPLOAD`. La firma queda disponible para la aprobación formal de actas de GD.

#### Scenario: Carga de firma por referencia (D1)
- **WHEN** un miembro de la directiva (o administración) sube su firma digitalizada
- **THEN** `datosGobernanza.firmaDigital` guarda solo la URL/referencia de la imagen
- **AND** AM registra `AD_DIRECTIVA_SIGN_UPLOAD`

#### Scenario: Intento de firma embebida rechazado
- **WHEN** una acción recibe la firma como data-URL/base64
- **THEN** retorna `{ok:false}` con error D1 y no muta el estado

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

