# ES-estacionamientos Specification — Deprecado v8 (absorbido en EF)

## Purpose
> **v8:** colección `estacionamientos` y `ubicacionesEstacionamiento` eliminadas. Los 83 estacionamientos son `unidades` con `tipoUnidadId: tipo-es-1` y microsectores `est-sup/sub1/sub2/vis` del macrosector `estacionamientos` en EF. Este spec se conserva como histórico; el comportamiento actual es el de `EF-estructura-fisica` + `VU-vinculacion-unidades`.

Gestionar el inventario de plazas de parking, su ubicación técnica y su vinculación jerárquica con las unidades habitacionales o comerciales (ahora como vista filtrada de `EF`).

## Requirements

### Requirement: Hierarchical Linking (Granularidad)
The system MUST provide a granular selector to link a parking spot with a specific unit.

#### Scenario: Cascading Selection
- **WHEN** linking a parking spot to a unit
- **THEN** the user MUST select Macro-Sector -> Micro-Sector -> Unit in sequence
- **AND** the selector MUST filter units by the chosen sectors

### Requirement: Location Detail (v8: microsector de EF)
The system MUST derivar la ubicación desde `microSectores[unidad.microSectorId]` (`est-sup`, `est-sub1`, `est-sub2`, `est-vis`) en lugar de campo libre `ubicacionesEstacionamiento`.

#### Scenario: Microsector Location
- **WHEN** viewing a parking unit `u-E-*`
- **THEN** the location MUST be resolved from `microSectores[unidad.microSectorId].nombre`
- **AND** legacy `ubicacionesEstacionamiento` MUST NOT be used

### Requirement: Status Tracking (v8: unidad.estadoId + vínculos)
The system MUST mostrar estado (`maestros.estadosOcupacion`) y ocupación derivada de `vinculos` activos sobre `u-E-*` (Ocupado/Libre).

#### Scenario: Occupancy Derived
- **WHEN** a parking unit has an active `vinculo` with role `propietario`
- **THEN** it MUST be shown as Ocupado with owner name
- **AND** otherwise it MUST be shown as Libre

### Requirement: High Density Visualization (v8: vista EF filtrada)
The inventory MUST ser la vista filtrada de `EF` (`unidades` donde `etiqueta=Estacionamiento`), con tabla buscable/filtrable heredada de `EF-estructura-fisica`.

#### Scenario: Filtered View
- **WHEN** the user filters by macrosector `estacionamientos`
- **THEN** only parking units MUST be shown
- **AND** the table MUST support search by `numero` and `estadoId`

### Requirement: Migración v8
The system SHALL migrar los `estacionamientos` legacy desde v7 como `unidades` `u-E-*` en `data/inventario/estructura.ts` y SHALL limpiar la key legacy del persist `estacionamientos` en `store.ts` v8 `migrate`.

#### Scenario: Legacy Clean
- **WHEN** a user with v7 persisted state upgrades to v8
- **THEN** the migrate MUST convert `estacionamientos` to `unidades` and remove the legacy key
