# MP-maestro-personas Specification

## Purpose
Establecer un registro único de identidad para todas las personas relacionadas con la comunidad, permitiendo una gestión centralizada, segura y con enfoque en la vulnerabilidad.

## Requirements

### Requirement: Unique Identity (RUT/DNI)
The system MUST use a unique identifier (RUT in Chile) to prevent duplicate records of the same person.
- **Validation**: The system SHOULD validate the RUT format and check digit.

#### Scenario: Duplicate Prevention
- **WHEN** an administrator tries to register a person with a RUT already existing
- **THEN** the system MUST reject the duplicate and show the existing record

### Requirement: Vulnerability Indicators
The person profile MUST include flags for special conditions.
- **Condition: Third Age**: Flag to identify residents over 65 years old.
- **Condition: Disability**: Flag to identify residents with reduced mobility or other disabilities.
- **Action**: These flags MUST be visible in emergency reports.

#### Scenario: Emergency Visibility
- **WHEN** a person has a vulnerability flag
- **THEN** the flag MUST be visible as an icon in listings and as a banner in the detail sheet

### Requirement: Unified Contact Data
Every person MUST have at least one primary phone and email registered.

#### Scenario: Contact Required
- **WHEN** saving a person without phone or email
- **THEN** the system MUST reject the save and highlight the missing contact field

### Requirement: Role Flexibility
A person MUST be able to hold multiple roles simultaneously (Owner, Resident, Staff).

#### Scenario: Multi-role
- **WHEN** a person is registered
- **THEN** they can be linked to one or more units with different relationship types
- **AND** each role MUST enable its specific extension panel (e.g., Datos Laborales for Staff)

### Requirement: Dependencias de Carga y Seed (ST) - MP Rank 1 paralelo a TU

Entidad `CompassData.personas` `k0mp4ss_fe/apps/web/lib/store.ts:81`, seed `data/comunidad/personas.ts:50 personas` (54 registros). `Depende de: [MA.condicionesEspeciales]` `k0mp4ss_fe/apps/web/data/admin/maestros.ts:159` (5 condiciones). Campo `persona.condicionesEspecialesIds?: string[]` es FK array subset de `maestros.condicionesEspeciales.id`. `Rank 1` paralelo a `TU` (ambos rank 1, sin orden entre ellos, pero ambos antes de `EF:2` y `VU:3`). `savePersona:259` SHALL validar `condicionesEspecialesIds` subset. `removePersona:264` ya valida inverso `vinculos.personaId`.

#### Scenario: Condición huérfana
- **WHEN** `savePersona({condicionesEspecialesIds:["no-existe"]})`
- **THEN** retorna `{ok:false, error:"condicionEspecial no existe"}`.

#### Scenario: Carga MP sin MA
- **WHEN** bulk carga `personas` antes que `maestros.condicionesEspeciales`
- **THEN** `validateSeedOrder` reporta FK array dangling.

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

### Requirement: Eventos AM de Carga MP

Bulk `personas` SHALL emitir `MP_SEED_LOADED` y mutaciones `MP_CREATE/MP_UPDATE_DATA` `Data/NSGC/docs/especificaciones/MP - Maestro de Personas.md:74`.

#### Scenario: Bulk MP auditado
- **WHEN** se cargan 54 personas
- **THEN** `AM` registra `valorCuantificable:54`.

### Requirement: Vista Residentes — directorio filtrado de residentes sobre MP
El sistema SHALL proveer la vista `/personas/residentes` como directorio filtrado read-only sobre las colecciones existentes `personas` y `vinculos` (MP+VU), sin duplicar edición ni mutaciones, listando exclusivamente personas que posean al menos un vínculo vigente (sin `fechaFin`) con rol `propietario` o `arrendatario` y mostrando para cada una su identidad, contacto, unidad vinculada y estado de cuenta, con enlace a la ficha en `/comunidad/personas/[id]` cuando el patrón exista.

#### Scenario: Acceso a la vista Residentes
- **WHEN** el usuario navega a `/personas/residentes`
- **THEN** el sistema muestra el heading "Residentes" y la descripción "Directorio filtrado de residentes y propietarios — vínculos vigentes con unidad."
- **AND** renderiza la tabla/grilla con las personas filtradas (solo vínculos vigentes propietario/arrendatario).

#### Scenario: Filtro por vínculo vigente
- **WHEN** la vista carga datos de `vinculos` y `personas`
- **THEN** el listado SHALL incluir solo personas donde `vinculos.some(v => v.personaId === persona.id && !v.fechaFin && (v.rol === "propietario" || v.rol === "arrendatario"))`
- **AND** SHALL excluir personas con solo roles `copropietario`/`ocupante`, sin vínculos, o con vínculos cerrados (`fechaFin` definida).

#### Scenario: Unidad vinculada y estado visibles
- **WHEN** una persona con vínculo vigente se renderiza
- **THEN** la fila muestra la etiqueta de unidad (`unidades.find(u.id === vinculo.unidadId)`) y el rol del vínculo
- **AND** muestra `estadoCuenta` (badge) y contacto (`telefonoMovil`/`email`).

#### Scenario: Link a ficha MP y read-only
- **WHEN** el usuario ve una fila de residente
- **THEN** la fila ofrece un link "Ver Ficha" hacia `/comunidad/personas/{persona.id}`
- **AND** la vista no ofrece acciones de creación/edición/borrado de personas o vínculos (solo lectura; la edición vive en `/comunidad/personas`).

#### Scenario: Skeleton durante hidratación
- **WHEN** `hasHydrated === false`
- **THEN** la vista muestra skeleton (`animate-pulse`) en lugar de la tabla.

#### Scenario: Navegación lateral habilitada
- **WHEN** la vista existe
- **THEN** `/personas/residentes` ya no pertenece a `RUTAS_PENDIENTES` en `AppSidebar` y el item "Residentes" es navegable sin badge "Próximamente".

### Requirement: Setup MP TEST vía helper compartido

El test MP de poblamiento SHALL crear su persona TEST vía
`e2e/helpers/datos-test` (`crearPersonaTEST` + `limpiarPersonaTEST`), sin
setup inline duplicado. La afirmación (RUT raw visible en el directorio) queda
idéntica. El setup SHALL ser independiente del QA-Lab "Poblar todo de una vez"
(`crearPersonaTEST` hace `POST /api/personas` y el cleanup
`DELETE /api/personas/:id`), y los specs de flujo
(`e2e/flujo/poblamiento`, `e2e/flujo/personas`) SHALL usar nombres, emails y
RUT únicos por corrida (timestamp + DV válido vía `rutUnicoTEST`/`dvRutTEST`)
para que las reejecuciones no colisionen. Motivo estructural (P4): el QA-Lab
escribe al store legacy mientras las páginas migradas leen la BD.

#### Scenario: Persona TEST del helper aparece en el directorio
- **WHEN** existe una persona TEST creada vía el helper
- **THEN** el directorio la muestra y el cleanup no deja residuos TEST.

#### Scenario: Persona y unidad propias visibles en su módulo
- **WHEN** el spec de flujo crea una persona o unidad TEST vía el helper y se visita su página
- **THEN** aparece en la grilla o tabla y el cleanup vía API la elimina, sin residuos.

#### Scenario: Directorio crea desde la UI con email único
- **WHEN** admin crea una identidad desde "Crear Nueva Persona"
- **THEN** aparece en la grilla (RUT formateado con puntos por el formulario) y el cleanup vía API la elimina.

### Requirement: Validación de referencias tolerante a null de BD
`esReferenciaValida` SHALL tratar null como ausente: las filas Prisma traen
`fotografiaUrl: null` y el PUT de firma reventaba con TypeError (500, dialog
de gestión que no cierra).

#### Scenario: Guardar firma digitalizada persiste
- **WHEN** se carga una URL de firma en `/admin/gestion` tab Directiva
- **THEN** el PUT responde 200, el dialog cierra y la URL aparece en la card
  (test de regresión en `personas.test.ts`).
