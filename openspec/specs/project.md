# Project: Compass (Modular Dashboard)

## Overview
This project is a modular dashboard system built with Next.js and shadcn/ui.

It starts as a structured UI built with mock data and evolves step by step into a production-ready frontend connected to a real backend.

---

## Core Concept

This is NOT a single-screen demo. The system is:

- **Modular**: Each functionality is independent.
- **Scalable**: Designed to grow in modules and roles.
- **Built in stages**: Following a logical roadmap of dependencies.

Each module represents a functional domain (Finance, Community, Infrastructure, etc.).

---

## Development Conventions
- **Language**: Simple Spanish for folder names, routes, and documentation.
- **Technology**: Next.js (App Router), Tailwind CSS, shadcn/ui.
- **Methodology**: OpenSpec for change and specification management.
- **Data layer (ST)**: All domain data lives in the global store `apps/web/lib/store.ts` (Zustand + persist, key `compass-store`, versioned with `migrate`). Pages and components MUST read via `useCompassStore` and MUST only mutate through store actions (repository pattern). Mocks in `apps/web/data/` are the store's seed only and MUST NOT be imported directly by pages/components. Every new capability MUST declare its entities and CRUD actions (`saveX`/`removeX` returning `StoreResult`) on the store, including referential-integrity validations on delete. See `ST-capa-datos-persistente` and `RG` (Reglas Generales).

---

## Cross-Reference OpenSpec ↔ NSGC Docs

Each OpenSpec capability maps 1:1 to its module spec in `Data/NSGC/docs/especificaciones/` using the AA prefix.

| OpenSpec capability (spec folder) | NSGC spec file |
| :--- | :--- |
| `RG-*` | `RG - Reglas Generales.md` |
| `MA-*` | `MA - Maestros Administrativos.md` |
| `EF-estructura-fisica` | `EF - Estructura Fisica.md` (desde v8 incluye estacionamientos como `u-E-*`) |
| `ES-estacionamientos` | `ES - Estacionamientos.md` — **deprecado v8, absorbido en EF** (spec histórico) |
| `TU-tipos-unidad` | `TU - Tipos de Unidad.md` |
| `MP-maestro-personas` | `MP - Maestro de Personas.md` |
| `VU-vinculacion-unidades` | `VU - Vinculacion Unidades.md` |
| `CV-visor-mensajes` | `CV - Visor de Mensajes.md` |
| `PL-liquidaciones-remuneraciones` | `PL - Liquidaciones y Remuneraciones.md` |
| `CF-configuracion-global` | `CF - Configuracion Global.md` |
| `AM-auditoria-metricas` | `AM - Auditoria y Metricas.md` |
| `RP-roles-permisos` | `RP - Roles y Permisos.md` |
| `UI-interfaz-principal` | Cross-cutting UI (no AA code) |
| `UI-navegacion-lateral` | Cross-cutting UI (no AA code) |

### Remaining NSGC modules (pending OpenSpec specs)
`AD`, `GD`, `FI`, `CO`, `PL`, `IN`, `GE`, `IR`, `RA`, `RE`, `PI`, `MT`, `CT` — not yet defined in `openspec/specs/`. Create each spec using its AA prefix when implemented.
### Folder naming rule
- Specs and active changes: `<AA>-<kebab-case-name>` (e.g. `EF-estructura-fisica`).
- Cross-cutting UI specs use `UI-` prefix.
- Archived changes: `YYYY-MM-DD-<name>` (AA prefix optional in archive).