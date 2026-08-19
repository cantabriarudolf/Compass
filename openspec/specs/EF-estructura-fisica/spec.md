# EF-estructura-fisica Specification

## Purpose
Establecer la infraestructura física y lógica de las propiedades del condominio, permitiendo una gestión jerárquica, auditable y basada en plantillas técnicas.

## Requirements

### Requirement: Flexible Hierarchy
The system MUST support a 3-level hierarchy (Macro-Sector > Micro-Sector > Unit) where the Micro-Sector level MUST be optional.

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

### Requirement: Template Inheritance
Units MUST inherit their base metrics (m2, monto GC) from a "Tipo de Unidad" (Categoría Física) template.
- **Scenario**: Metraje Protection
  - **WHEN** viewing a unit form
  - **THEN** the metraje MUST be read-only and inherited from the template.

### Requirement: Logical Deactivation (Soft Delete)
Master data (Unit Types, Categories) MUST NOT be permanently deleted.
- **Scenario**: Toggle Status
  - **WHEN** an admin wants to remove a type
  - **THEN** they MUST toggle its status to "Inactive".
  - **THEN** inactive types MUST NOT appear in new registration forms.

### Requirement: Scalable Macro-Sector Navigation
The UI MUST handle an arbitrary number of Macro-Sectors using scrollable tabs or a compact selector.
