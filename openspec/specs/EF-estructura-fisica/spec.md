# EF-estructura-fisica Specification

## Purpose
Establecer la infraestructura física y lógica de las propiedades de la comunidad, permitiendo una gestión jerárquica, auditable y basada en plantillas técnicas.
## Requirements
### Requirement: Flexible Hierarchy
The system MUST support a 3-level hierarchy (Macro-Sector > Micro-Sector > Unit) where the Micro-Sector level MUST be optional.

#### Scenario: Optional Micro-Sector
- **WHEN** an administrator creates a macro-sector for a horizontal community (casas) without needing a micro-sector
- **THEN** the system MUST allow saving the unit directly under the macro-sector with `No Aplica` as micro-sector

### Requirement: Customizable Labels (Categorías)
The system MUST use user-friendly terminology (Categorías) instead of technical names.
- **Categoría Macro**: Torre, Manzana, Etapa.
- **Categoría Micro**: Piso, Nivel, Pasaje.
- **Categoría Unidad**: Depto, Casa, Local, Estacionamiento, Bodega.

#### Scenario: Labels Administered in MA
- **WHEN** the admin manages categorías (macro, micro o de unidad) in the Maestros Administrativos module (`/admin/maestros`)
- **THEN** the created/edited labels MUST be persisted in `MaestroCollections` of the store (`categoriasMacro`, `categoriasMicro`, `categoriasUnidad`)
- **AND** the EF forms and unit etiquetas MUST read them from the store, never from hardcoded lists

### Requirement: Technical Unit Sheet (Ficha Técnica)
Every unit MUST contain detailed technical and tax data.
- **Tributario**: MUST include "Rol de Avalúo (SII)".
- **Servicios**: MUST include Customer ID and Meter Number for Water, Electricity, and Gas.
- **Metrics**: MUST include Metraje (m2) and Prorrateo (%).

#### Scenario: Complete Technical Sheet
- **WHEN** an administrator views or edits a unit
- **THEN** the ficha MUST display Rol de Avalúo, Customer IDs and Meter Numbers for Agua/Luz/Gas, plus Metraje and Prorrateo
- **AND** missing fields MUST be highlighted as required

### Requirement: Template Inheritance
Units MUST inherit their base metrics (m2, monto GC) from a "Tipo de Unidad" (Categoría Física) template.

#### Scenario: Metraje Protection
- **WHEN** viewing a unit form
- **THEN** the metraje MUST be read-only and inherited from the template

### Requirement: Logical Deactivation (Soft Delete)
Master data (Unit Types, Categories) MUST NOT be permanently deleted.

#### Scenario: Toggle Status
- **WHEN** an admin wants to remove a type
- **THEN** they MUST toggle its status to "Inactive"
- **AND** inactive types MUST NOT appear in new registration forms

### Requirement: Scalable Macro-Sector Navigation
The UI MUST handle an arbitrary number of Macro-Sectors using scrollable tabs or a compact selector.

#### Scenario: Many Towers
- **WHEN** the community has more than 6 macro-sectors
- **THEN** the navigation MUST remain scrollable and accessible without breaking the layout

### Requirement: Sector Assignment on Unit Creation
When creating or editing a unit, the system MUST require explicit assignment to a valid Macro-Sector and Micro-Sector.

#### Scenario: New Unit from Any View
- **WHEN** an administrator creates a new unit
- **THEN** the unit form MUST display selectors for Macro-Sector and Micro-Sector
- **THEN** the system MUST prevent saving until a valid Micro-Sector is selected
- **THEN** the saved unit MUST be associated with the selected Micro-Sector (and therefore its Macro-Sector).

#### Scenario: Reassign Existing Unit
- **WHEN** an administrator edits an existing unit
- **THEN** the form MUST allow changing the Macro-Sector and Micro-Sector
- **THEN** the updated unit MUST reflect the new sector assignment.

### Requirement: Clear Separation Between Sector Labels and Actual Sectors
The UI MUST distinguish the labels configured in Maestros Administrativos (e.g., "Torre", "Piso") from the actual sector instances created in Estructura Física (e.g., "Torre A", "Piso 1").

#### Scenario: Creating a Sector Label
- **WHEN** an administrator adds a Macro or Micro label in Maestros Administrativos
- **THEN** the system MUST make clear that this is only a label to be used later when creating real sectors in Estructura Física.

#### Scenario: Creating a Unit Without Sectors
- **WHEN** there are no actual Macro-Sectors or Micro-Sectors in Estructura Física
- **THEN** the system MUST display guidance to create the real sectors first
- **THEN** the unit creation form MUST disable sector selection and explain why.

### Requirement: Dependencias de Carga y Seed (ST) - EF Rank 2 con orden interno

Entidades `CompassData.macroSectores, microSectores, unidades` `k0mp4ss_fe/apps/web/lib/store.ts:78`. Seed `data/inventario/estructura.ts:107 macroSectores (7), :117 microSectores (23), :135 unidades (166 inc 83 u-E-* + 3 u-LC-*)`. `Depende de: [MA.categoriasMacro, MA.categoriasMicro, MA.estadosOcupacion, TU.tiposUnidad]`. `Rank 2`. Orden interno obligatorio: `macroSectores -> microSectores -> unidades`. `unidades` depende de `microSectores.id`, `tiposUnidadId`, `maestros.estadosOcupacion.id`. `saveMacroSector:202`, `saveMicroSector:221`, `saveUnidad:241` SHALL validar FKs respectivas antes de upsert. `remove*` ya valida inverso `ST:60`.

#### Scenario: Micro con macro huérfano
- **WHEN** `saveMicroSector({macroSectorId:"no-existe"})`
- **THEN** retorna `{ok:false, error:"macroSectorId no existe"}`.

#### Scenario: Unidad con tipo huérfano
- **WHEN** `saveUnidad({tipoUnidadId:"no-existe"})`
- **THEN** retorna `{ok:false}` y no se persiste.

#### Scenario: Carga bulk respeta orden interno
- **WHEN** `seedBulkLoad` carga EF
- **THEN** itera `macroSectores` antes que `microSectores` antes que `unidades`; si invierte, `validateSeedOrder` reporta rank interno violation.

### Requirement: Dona de distribución y color desde MA

`estadosOcupacion.hex` `data/maestros.ts:36` SHALL alimentar `EF` dona `Data/NSGC/docs/manuales/02 - Estructura Física.md:32`. Estado nuevo creado en `MA` SHALL renderizar con color, no gris `ST-capa-datos-persistente:42`.

#### Scenario: Estado nuevo con hex
- **WHEN** QA crea `TEST-EdO-EnLimpieza` en `MA` con `hex:#ef4444`
- **THEN** dona de `EF` muestra segmento rojo sin cambio de código.

### Requirement: Eventos AM de Carga EF

Bulk de `macroSectores/microSectores/unidades` SHALL emitir `EF_SEED_LOADED` y mutaciones `EF_CREATE_UNIT` etc `Data/NSGC/docs/especificaciones/EF - Estructura Fisica.md:53`.

#### Scenario: Bulk EF auditado
- **WHEN** se cargan 166 unidades
- **THEN** `AM` registra `valorCuantificable:166` y `métrica: ratio ocupación = ocupadas/total`.

### Requirement: Setup EF TEST vía helper compartido
El test EF de poblamiento SHALL crear su unidad TEST vía
`e2e/helpers/datos-test` (`crearUnidadTEST` + `limpiarUnidadTEST` con FKs del
seed), sin setup inline duplicado. La afirmación (número visible en la
estructura) queda idéntica.

#### Scenario: Unidad TEST del helper aparece en la estructura
- **WHEN** existe una unidad TEST creada vía el helper
- **THEN** la estructura la muestra y el cleanup no deja residuos TEST.

