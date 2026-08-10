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

---

## Cross-Reference OpenSpec ↔ NSGC Docs

Each OpenSpec capability maps 1:1 to its module spec in `Data/NSGC/docs/especificaciones/` using the AA prefix.

| OpenSpec capability (spec folder) | NSGC spec file |
| :--- | :--- |
| `RG-*` | `RG - Reglas Generales.md` |
| `MA-*` | `MA - Maestros Administrativos.md` |
| `EF-estructura-fisica` | `EF - Estructura Fisica.md` |
| `ES-estacionamientos` | `ES - Estacionamientos.md` |
| `TU-*` | `TU - Tipos de Unidad.md` |
| `MP-maestro-personas` | `MP - Maestro de Personas.md` |
| `VU-vinculacion-unidades` | `VU - Vinculacion Unidades.md` |
| `UI-interfaz-principal` | Cross-cutting UI (no AA code) |
| `UI-navegacion-lateral` | Cross-cutting UI (no AA code) |

### Remaining NSGC modules (pending OpenSpec specs)
`AD`, `GD`, `RP`, `CF`, `FI`, `CO`, `PE`, `IN`, `GE`, `IR`, `RA`, `RE`, `AM`, `PI`, `MT`, `CT` — not yet defined in `openspec/specs/`. Create each spec using its AA prefix when implemented.

### Folder naming rule
- Specs and active changes: `<AA>-<kebab-case-name>` (e.g. `EF-estructura-fisica`).
- Cross-cutting UI specs use `UI-` prefix.
- Archived changes: `YYYY-MM-DD-<name>` (AA prefix optional in archive).