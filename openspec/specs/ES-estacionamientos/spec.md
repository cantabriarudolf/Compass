# ES-estacionamientos Specification — Deprecado v8 (absorbido en EF)

## Purpose
> **v8:** colección `estacionamientos` y `ubicacionesEstacionamiento` eliminadas. Los 83 estacionamientos son `unidades` con `tipoUnidadId: tipo-es-1` y microsectores `est-sup/sub1/sub2/vis` del macrosector `estacionamientos` en EF. Este spec se conserva como histórico; el comportamiento actual es el de `EF-estructura-fisica` + `VU-vinculacion-unidades`.

Gestionar el inventario de plazas de parking, su ubicación técnica y su vinculación jerárquica con las unidades habitacionales o comerciales (ahora como vista filtrada de `EF`).

## Requirements

### Requirement: Hierarchical Linking (Granularidad)
The system MUST provide a granular selector to link a parking spot with a specific unit.
- **Scenario**: Cascading Selection
  - **WHEN** linking a unit
  - **THEN** the user MUST select Macro-Sector -> Micro-Sector -> Unit in sequence.

### Requirement: Location Detail (v8: microsector de EF)
The system MUST derivar la ubicación desde `microSectores[unidad.microSectorId]` (`est-sup`, `est-sub1`, `est-sub2`, `est-vis`) en lugar de campo libre `ubicacionesEstacionamiento`.
- **Scenario**: Specificity (legacy)
  - **THEN** descripciones como "Sub-1, near Pillar 15" corresponden ahora a `est-sub1`.

### Requirement: Status Tracking (v8: unidad.estadoId + vínculos)
The system MUST mostrar estado (`maestros.estadosOcupacion`) y ocupación derivada de `vinculos` activos sobre `u-E-*` (Ocupado/Libre).

### Requirement: High Density Visualization (v8: vista EF filtrada)
The inventory MUST ser la vista filtrada de `EF` (`unidades` donde `etiqueta=Estacionamiento`), con tabla buscable/filtrable heredada de `EF-estructura-fisica`.
- **Scenario**: Advanced Filtering
  - **THEN** el usuario filtra por macrosector `estacionamientos` y por `estadoId` — mismo patrón que EF.

### Requirement: Migración v8
Al migrar desde v7, los `estacionamientos` legacy no se pierden: se migraron como `unidades` `u-E-*` en `data/inventario/estructura.ts` y `store.ts` v8 limpia la key legacy del persist.
