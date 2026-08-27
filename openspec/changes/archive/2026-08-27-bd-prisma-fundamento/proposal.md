# Proposal: bd-prisma-fundamento — Prisma + comunidadId + repos con scoping (C1/C1b/C3b)

## Why
La plataforma está en store v25 sobre localStorage (Zustand) sin persistencia server-side ni aislamiento multi-comunidad. La serie Plataforma P2 exige el fundamento Prisma según `Data/NSGC/docs/especificaciones/SG - Hardening y Despliegue.md §1` (C1, C1b, C3b) y `Data/NSGC/docs/auditorias/consolidado - 2026-08-24-b.md §3 (Fase C)`. Sin `comunidadId` indexado en toda entidad y sin repositorios con scoping obligatorio no se puede avanzar a B3/Authz ni a Auth.js.

## What Changes
- **BREAKING**: No funcional (store cliente intacto v25). Se añade capa server-side lista para P4/P5.
- Instalar `prisma` + `@prisma/client` (SQLite en dev) en `k0mp4ss_fe/apps/web`; `DATABASE_URL` en `.env.local` (gitignored) documentado en `.env.example`; `.db` gitignored; `prisma/migrations` commiteadas.
- `C1` — `prisma/schema.prisma` con TODA entidad de dominio derivada de `CompassData` (store v25) y `lib/schemas.ts`. Inventario: Comunidad + 45 colecciones top-level (estructura, comunidad, portal, notificaciones, controles, actas, CO/GE/IR/IN/MT/RA/CV/FI/PE/PL/CT/RE, eventos, configuración) + 20 maestros MA → total ~66 modelos. TODA entidad lleva `comunidadId String @index` (D3 tenant compartido) y relación a `Comunidad` con `onDelete: Cascade`. `prisma migrate dev` corre limpio.
- `C1b` — `lib/repos/` con factory obligatorio `crearRepositorio(comunidadId)` (ningún método expone query sin scope). Implementa CRUD scoped por `comunidadId` usando PrismaClient. Tests de aislamiento A/B con sqlite `:memory:`/archivo temporal: dos comunidades, cross-read y cross-write fallan (retorna null / lanza o no muta).
- `C3b` — Constraints de unicidad compuesta OPCIONALES tabla por tabla (D5: repetidos permitidos en app). Cada constraint documentada en `design.md` con justificación; p.ej. `[comunidadId, nombre]` en `TipoUnidad` si aporta valor, evitando globales.
- El store cliente NO se toca: los repos existen server-side listos para consumirse (P4/P5 los usan). Sin cambios de UI.
- Deltas de spec: `ST-capa-datos-persistente` MODIFIED (evolución a repos server-side) y capability NUEVA `SG-hardening-despliegue` (C1/C1b/C3b).

## Capabilities
### New Capabilities
- `SG-hardening-despliegue`: Hardening y despliegue fase C/D. Purpose: Checklist técnico de seguridad para completar la Fase C restante (pre-Base de Datos) y ejecutar íntegramente la Fase D (pre-deploy), derivado del consolidado de auditorías. Ver `Data/NSGC/docs/especificaciones/SG - Hardening y Despliegue.md`. Incluye C1 (modelo Prisma con comunidadId indexado), C1b (repos con scoping obligatorio + tests A/B), C3b (unicidad compuesta opcional documentada).

### Modified Capabilities
- `ST-capa-datos-persistente`: Evolución documentada a capa de datos persistente server-side con repositorios Prisma scoping por comunidadId. El store cliente persiste (v25) pero los repos server-side quedan listos para P4/P5.

## Impact
- `k0mp4ss_fe/apps/web/prisma/schema.prisma` (nuevo) + `prisma/migrations/*` + `lib/prisma.ts` + `lib/repos/*` + `lib/repos/*.test.ts` + `.env.example` + `.env.local` (gitignored) + `.gitignore` para `*.db`.
- `openspec/specs/SG-hardening-despliegue/spec.md` (nuevo al archivar) + `openspec/specs/ST-capa-datos-persistente/spec.md` (evolución al archivar).
- Sin cambio de `STORE_VERSION` (permanece 25) ni de UI. Verificaciones: `tsc --noEmit`, `eslint`, `npm test` verde, `openspec validate --all`, `prisma migrate dev` y `prisma generate` limpios.
