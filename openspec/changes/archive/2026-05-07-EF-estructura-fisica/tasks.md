## 1. Setup & Data Mocking

- [x] 1.1 Create mock data stores for `MacroSectors`, `MicroSectors`, and `Units`.
- [x] 1.2 Define TypeScript interfaces according to the documentation (SII Role, Metraje, Coeficiente, etc.).

## 2. Infrastructure UI (Structure)

- [x] 2.1 Create the main page at `apps/web/app/inventario/estructura/page.tsx`.
- [x] 2.2 Implement a "Building Tree" or "Drill-down" navigator to visualize the hierarchy.
- [x] 2.3 Implement the "Macro-Sector" management (Create/Edit Tower/Manzana).

## 3. Unit Management

- [x] 3.1 Implement the "Unit" form with shadcn/ui.
- [x] 3.2 Include fields for Services (Customer ID / Meter Number) and SII Role.
- [x] 3.3 Add "Occupation Status" badges (In Use, For Rent, etc.).

## 4. Integrity & Polish

- [x] 4.1 Implement validation logic for unique unit numbers.
- [x] 4.2 Verify that labels change dynamically based on the configuration (Torre/Piso vs Manzana/Casa).
- [x] 4.3 Update the global roadmap (`docs/03`) to reflect progress.
