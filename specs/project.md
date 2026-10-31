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
- **Data layer (ST)**: All domain data SHALL persist in the server (Prisma database accessed through the REST API) and SHALL be read from there through the `lib/api/use-*` hooks. The global store `apps/web/lib/store.ts` (Zustand + persist, key `compass-store`) is a **legacy** layer marked `@deprecated`: `STORE_VERSION` is frozen at 28, no new domain migrations are added, it MUST NOT receive new domain entities and its domain actions MUST NOT be used as the mutation mechanism for pages. Mocks in `apps/web/data/` are the **server** seed, applied by the `seed:mocks`/`db:*` npm scripts, and MUST NOT be imported directly by pages/components. Every new capability MUST declare its entities as a Prisma table plus a REST route, including referential-integrity validations on delete. See `ST-capa-datos-persistente` and `RG` (Reglas Generales).
- **Alcance de cambios (OpenSpec)**: 1 módulo NSGC = 1 change OpenSpec (convención 1:1 con la capability `<AA>-<kebab-name>`); excepción: PE puede partirse en 2 changes si su alcance lo exige.
- **Documentos PDF**: pdfmake es el motor estándar de generación documental (CT certificados, PL liquidaciones) con firma digitalizada embebida como imagen; se instala al implementar dichos módulos, no antes.
- **Notificaciones**: se materializan como bandeja in-app simulada (`notify()` en el store, canal `email_simulado`, eventos AM); el envío real por correo (SMTP) queda fuera de alcance hasta SG. Media/adjuntos siempre por referencia (metadatos + URL), jamás base64/Blob en el store (ver ST).

---

## Cross-Reference OpenSpec ↔ NSGC Docs

Each OpenSpec capability maps 1:1 to its module spec in `Data/NSGC/docs/especificaciones/` using the AA prefix.

| OpenSpec capability (spec folder) | NSGC spec file |
| :--- | :--- |
| `RG-*` | `RG - Reglas Generales.md` |
| `MA-maestros-administrativos` | `MA - Maestros Administrativos.md` |
| `EF-estructura-fisica` | `EF - Estructura Fisica.md` (desde v8 incluye estacionamientos como `u-E-*`) |
| `ES-estacionamientos` | `ES - Estacionamientos.md` — **deprecado v8, absorbido en EF** (spec histórico) |
| `TU-tipos-unidad` | `TU - Tipos de Unidad.md` |
| `MP-maestro-personas` | `MP - Maestro de Personas.md` |
| `VU-vinculacion-unidades` | `VU - Vinculacion Unidades.md` |
| `CV-visor-mensajes` | `CV - Visor de Mensajes.md` (consume `actasGD.avisoCVReferencia` de GD) |
| `PL-liquidaciones-remuneraciones` | `PL - Liquidaciones y Remuneraciones.md` (materializa `liquidacionPLReferencia` de PE; egreso FI sueldos) |
| `CF-configuracion-global` | `CF - Configuracion Global.md` |
| `AM-auditoria-metricas` | `AM - Auditoria y Metricas.md` |
| `RP-roles-permisos` | `RP - Roles y Permisos.md` |
| `AU-autenticacion-sesion` | `AU - Autenticacion y Sesion.md` (implementada: Auth.js credentials JWT + `Usuario`/`Membresia` por comunidad con `puede()` server-side + rate limit persistente BD 10/15min, serie Plataforma P5/P4) |
| `SG-hardening-despliegue` | `SG - Hardening y Despliegue.md` (implementado serie Plataforma P6/P7: CSP report-only + headers, re-chequeos D-iii 5/5, backups con restore probado) |
| `RG-reglas-generales` | `03 - RG - Reglas Generales.md` |
| `ST-capa-datos-persistente` | Interno (capa de datos/persistencia, cross-cutting) |
| `PI-portal-inmobiliario` | `PI - Portal Inmobiliario.md` |
| `AD-gestion-administrativa` | `AD - Gestión Administrativa.md` |
| `GD-gestion-directiva` | `GD - Gestión de Directiva.md` |
| `CO-comunicacion-vecinos` | `CO - Comunicacion Vecinos.md` |
| `GE-gestion-solicitudes` | `GE - Gestion de Solicitudes.md` |
| `IR-inventario-recursos` | `IR - Inventario y Recursos.md` |
| `IN-infracciones-multas` | `IN - Infracciones y Multas.md` |
| `MT-mantenimiento-proyectos` | `MT - Mantenimiento y Proyectos.md` |
| `RA-reservas-amenities` | `RA - Reservas y Amenities.md` |
| `CV-visor-mensajes` | `CV - Visor de Mensajes.md` (consume `actasGD.avisoCVReferencia` de GD) |
| `FI-finanzas-morosidad` | `FI - Finanzas y Morosidad.md` (materializa `cargoFIReferencia` de IN/MT/RA) |
| `PE-personal-servicios` | `PE - Personal y Servicios.md` (proyección PE → FI con `liquidacionPLReferencia` materializada por PL) |
| `PL-liquidaciones-remuneraciones` | `PL - Liquidaciones y Remuneraciones.md` (materializa `liquidacionPLReferencia` de PE; egreso FI sueldos) |
| `CT-certificados` | `CT - Certificados.md` (consume VU/FI/PL; firma embebida solo en el PDF) |
| `RE-reporteria-dashboards` | `RE - Reporteria y Dashboards.md` (consolida MP/VU/EF/PE/GE/FI/IR/AM) |
| `LAB-mejoras` | `LAB - Mejoras Lab.md` |
| `DEV-qa-lab` | Interno (tooling QA, sin doc NSGC) |
| `UI-interfaz-principal` | Cross-cutting UI (no AA code) |
| `UI-navegacion-lateral` | Cross-cutting UI (no AA code) |

### Remaining NSGC modules (pending OpenSpec specs)
Ninguno: los 32 specs del roadmap (incluidos `AU` y `SG`) existen en `openspec/specs/` y la serie Plataforma P1–P8 está completa (auth, authz, Prisma scoping, secretos, Auth.js, CSP/headers, auditoría OWASP, backups con restore probado).

### Novedades 2026-08-31 / 2026-09-01 (QA + menú 100% + frontera)
- **QA infra**: Dashboard QA `/admin/qa-dashboard` (estado de corridas, estimados CLI vs Chrome, alerta de máquina ahogada — `lib/qa-estado.ts` + `qa-estado.json`); skill `pruebas` v2.1 (preflight de sistema + registro en dashboard); CI e2e verde con suite completa (setup e2e resiliente + gate del QA Lab por `APP_ENV`).
- **Series completadas**: CRUD-E2E (6/6, 22 specs CRUD), QA-LAB (3/3, lab 27→0 errores "Carga completa OK" + guard), MENU-100 (6/6: `/personas/residentes`, `/dashboard` Resumen, `/operaciones/accesos`, `/operaciones/paqueteria`, menú sin placeholders, dashboard OpenSpec 31/31 Completado), FRONTERA (6/6: poblado idempotente "Limpiar y poblar", logs de auditoría con retención en BD — `POST /api/auditoria/sync` + `GET /api/auditoria` — y ABAC contextual `puedeContextual()` + matriz visible en `/admin/permisos`).
- **Frontera restante**: C3 Google SSO — EN PAUSA pendiente credenciales Google Cloud del owner (checklist en `openspec/BACKLOG-100.md` §C3).
### Folder naming rule
- Specs and active changes: `<AA>-<kebab-case-name>` (e.g. `EF-estructura-fisica`).
- Cross-cutting UI specs use `UI-` prefix.
- Archived changes: `YYYY-MM-DD-<name>` (AA prefix optional in archive).