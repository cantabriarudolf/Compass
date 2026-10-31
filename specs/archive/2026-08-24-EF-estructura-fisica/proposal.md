## Why

The system needs a foundational physical structure to operate. Without a defined hierarchy of towers, floors, and units, we cannot assign residents, calculate expenses, or manage maintenance. This module establishes the "Container" of the entire condominium ecosystem.

## What Changes

- Implementation of a hierarchical data management system for Physical Structure.
- Support for customizable labels (e.g., "Torre", "Piso", "Depto" or "Manzana", "Casa").
- CRUD interface for Macro-Sectors, Micro-Sectors, and Units.
- Integration of unit attributes: SII role, services (meters/customer IDs), and occupation status.
- Placeholder for Real Estate data (valuation, rent details).

## Capabilities

### New Capabilities
- `EF-estructura-fisica`: Hierarchical management of physical assets and specialized attributes for each unit (services, SII role, occupation).

## Correction (post-archive)

After the module was archived, two related issues were detected:

1. **Orphaned units**: creating a new unit from the global or "all sectors" view produced a unit (e.g., "Depto 88") with no association to a Macro-Sector or Micro-Sector. The fix ensures that:
   - The unit form always shows explicit Macro-Sector and Micro-Sector selectors.
   - The current page selection pre-fills the selectors but allows changing them.
   - The save handler validates the `microSectorId` before persisting the unit.
   - Existing units can be reassigned to a different sector during edit.

2. **Confusion between labels and actual sectors**: administrators created "Macro-Sector" and "Micro-Sector" records in Maestros Administrativos (which are only labels such as "Torre" or "Piso") and expected them to appear as selectable sectors in Estructura Física. The fix clarifies the workflow:
   - Maestros Administrativos now labels these entries as "Etiquetas Macro/Micro" and explains that they must be used to create concrete sectors in Estructura Física.
   - Estructura Física shows a clear empty state when no real sectors exist and guides the user to create them.
   - The unit form disables sector selection and explains when no sectors are available.

## Impact

- `apps/web/app/inventario/estructura/page.tsx`: New management view.
- `apps/web/components/inventario/`: New components for tree view or grid view of the building structure.
- Mock data stores for the physical hierarchy.
