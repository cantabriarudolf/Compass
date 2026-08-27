# SG-hardening-despliegue Specification

## Purpose
Checklist técnico de seguridad para completar la Fase C restante (pre-Base de Datos) y ejecutar íntegramente la Fase D (pre-deploy a producción). Derivado del consolidado de auditorías `Data/NSGC/docs/auditorias/consolidado - 2026-08-24-b.md` y de `Data/NSGC/docs/especificaciones/SG - Hardening y Despliegue.md`. Esta capability cubre SG §1 Fase C pendiente al migrar a BD: C1 modelo Prisma con `comunidadId` indexado, C1b repositorios con scoping obligatorio + tests de aislamiento A/B, y C3b constraints de unicidad compuesta opcionales documentadas.
## Requirements
### Requirement: Modelo Prisma con comunidadId en toda entidad de dominio (C1)
El sistema SHALL proveer `k0mp4ss_fe/apps/web/prisma/schema.prisma` con `datasource db { provider = "sqlite" url = env("DATABASE_URL") }` y `generator client { provider = "prisma-client-js" }`, que modele el inventario definitivo de colecciones derivado de `CompassData` en `lib/store.ts` (v25: estructura, comunidad, portal, notificaciones, controles, actas, CO/GE/IR/IN/MT/RA/CV/FI/PE/PL/CT/RE, eventos, configuración) y de `lib/schemas.ts`, incluyendo los 20 maestros de `MaestroCollections`. Toda entidad de dominio SHALL llevar `comunidadId String` con `@@index([comunidadId])` y relación a `Comunidad` (D3 tenant compartido). `DATABASE_URL` SHALL vivir en `.env.local` (gitignored) y estar documentado en `.env.example`; archivos `*.db` SHALL estar gitignored y `prisma/migrations` commiteada. `prisma migrate dev` SHALL correr limpio.

#### Scenario: Prisma instalado y migración limpia
- **WHEN** se instala `prisma` + `@prisma/client` (SQLite dev) y se ejecuta `prisma migrate dev --name init` con `DATABASE_URL=file:./dev.db` en `.env.local`
- **THEN** la migración aplica sin errores, `prisma generate` crea el cliente y `openspec validate --all` sigue verde.

#### Scenario: Toda entidad con comunidadId indexado
- **WHEN** se inspecciona `prisma/schema.prisma`
- **THEN** cada `model` de dominio (salvo `Comunidad` raíz) contiene `comunidadId String`, `comunidad Comunidad @relation(...)` y `@@index([comunidadId])`.

### Requirement: Repositorios con scoping obligatorio por comunidadId y tests de aislamiento (C1b)
El sistema SHALL exponer repositorios server-side en `k0mp4ss_fe/apps/web/lib/repos/` con factory obligatorio `crearRepositorio(comunidadId: string)` que scopée TODA lectura/escritura por `comunidadId`. Ningún método SHALL exponer query sin `where: { comunidadId }`; `lib/prisma.ts` SHALL ser singleton PrismaClient y no exponer cliente sin scope a `app/`. Tests SHALL usar sqlite `:memory:` o archivo temporal y SHALL demostrar aislamiento A/B: crear dos comunidades A/B, crear entidad con `repoA`, intentar leer/escribir cross-comunidad con `repoB` SHALL FALLAR (findById retorna null, update/delete no muta).

#### Scenario: Aislamiento cross-comunidad falla
- **WHEN** `repoA = crearRepositorio(comunidadA)` crea un `TipoUnidad` y `repoB = crearRepositorio(comunidadB)` hace `findById(id)` o `update/delete` sobre ese id
- **THEN** la lectura retorna `null` y la escritura no afecta al registro de A (0 filas afectadas o error controlado).

#### Scenario: Listado no fuga cross-comunidad
- **WHEN** cada comunidad tiene datos y se llama `findMany` con cada repo
- **THEN** cada listado contiene solo los registros de su propia `comunidadId`.

### Requirement: Constraints de unicidad compuesta opcionales tabla por tabla (C3b)
El sistema MAY definir constraints de unicidad compuesta `@@unique([comunidadId, campo])` tabla por tabla, conforme a D5 (repetidos permitidos en la app, la BD decide). Cada constraint añadida SHALL estar documentada en `openspec/changes/bd-prisma-fundamento/design.md` con justificación; las tablas sin constraint SHALL explicitar la decisión de no-constraint. Ejemplos válidos: `Comunidad.slug @unique`, `TipoUnidad @@unique([comunidadId, nombre])`, `MacroSector @@unique([comunidadId, nombre])`, `FondoFI @@unique([comunidadId, nombre])`, `ProveedorPE @@unique([comunidadId, rut])`. Repetidos cross-comunidad SHALL seguir permitidos.

#### Scenario: Constraint por comunidad documentada
- **WHEN** se declara `@@unique([comunidadId, nombre])` en `TipoUnidad`
- **THEN** duplicar `nombre` dentro de la misma `comunidadId` falla a nivel BD, pero el mismo `nombre` en otra `comunidadId` se permite y la decisión está justificada en `design.md`.

#### Scenario: No-constraint documentada (D5)
- **WHEN** `Unidad.numero` no lleva `@@unique`
- **THEN** `design.md` justifica la omisión (número repetible en distintos microsectores, D5) y la app lo permite.

