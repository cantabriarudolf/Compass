## Why

Parking management is essential for security, financial prorating, and daily operations. The system must track which unit owns or rents each parking space, maintaining a history of assignments to prevent disputes and ensure correct billing.

## What Changes

- Implementation of a Parking Management module (`ES`).
- Creation of an inventory of parking spaces with attributes: Location (Surface/Subterranean), Dimensions, and Prorating coefficients.
- Linking system: Associate parking spaces with Units (`EF`).
- Assignment History: Track who owned/rented the space and when.

## Capabilities

- `ES-estacionamientos`: Management of the physical inventory of parking spaces.
- `asignacion-estacionamientos`: Logical linking between spaces and property units or residents.

## Impact

- `apps/web/app/inventario/estacionamientos/page.tsx`: New management view.
- `apps/web/data/inventario/estacionamientos.ts`: New data store for parking.
- Updated `EF` units view to show associated parking spaces.
