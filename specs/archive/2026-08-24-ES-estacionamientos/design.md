## Context

Parking spaces are often managed separately from apartments. We need a flexible system that allows independent prorating and historical tracking.

## Goals

- Maintain a searchable inventory of all parking spaces.
- Support different locations (Surface, Sub-1, Sub-2, etc.).
- Allow optional association with a physical Unit.
- Track history: Start Date, End Date, and ID of the associated entity.

## Decisions

- **Data Model**: Separate table for `Estacionamientos` linked to `Units`.
- **UI Design**: Use a Dashboard with filtering by Location and Assignment Status (Occupied/Free).
- **History**: Implement a "Timeline" or "History Table" for each parking spot to show assignment transitions.

## Risks / Trade-offs

- **Bulk Assignment**: For big condos, individual assignment is slow. We might need a "Bulk Link" feature in the future.
- **Independent Ownership**: Sometimes a person owns a parking spot without owning an apartment. The system MUST support null Unit IDs.
