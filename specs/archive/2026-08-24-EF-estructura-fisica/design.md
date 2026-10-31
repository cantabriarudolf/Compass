## Context

The physical structure is the skeleton of the system. We need a UI that allows administrators to define whether their condominium is vertical (Building) or horizontal (Houses) and build the hierarchy accordingly.

## Goals / Non-Goals

**Goals:**
- Implement a flexible 3-level hierarchy: Macro-Sector > Micro-Sector > Unit.
- Allow Micro-Sectors to be optional (e.g., Manzana > Casa directly).
- Use customizable labels for each level.
- Provide a clear UI to visualize the whole building/condo structure.
- Form implementation for adding/editing units with all attributes (SII, Services, etc.).

**Non-Goals:**
- Actual DB implementation (using mock data stores).
- Complex bulk import from Excel (this will be a future phase).
- Real-time map visualization (SVG/Canvas).

## Decisions

- **Navigation Pattern**: Use a Drill-down or Tree-view approach to manage large numbers of units without overwhelming the UI.
- **Form Patterns**: Use `react-hook-form` and `zod` for validation of unit data (SII role format, metraje coefficients).
- **Labels**: Store labels as part of the Macro-Sector configuration to adapt the UI dynamically.

## Risks / Trade-offs

- **UI Complexity**: Managing hundreds of units in a single view can be slow. We will use pagination or lazy loading if necessary.
- **Hierarchy Depth**: Limiting to 3 levels to maintain simplicity, though the document suggests 3 is enough for most cases.
