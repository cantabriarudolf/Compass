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
- `EF-estructura-fisica`: Hierarchical management of physical assets.
- `unidades-detalle`: Specialized attributes for each unit (services, SII role, occupation).

## Impact

- `apps/web/app/inventario/estructura/page.tsx`: New management view.
- `apps/web/components/inventario/`: New components for tree view or grid view of the building structure.
- Mock data stores for the physical hierarchy.
