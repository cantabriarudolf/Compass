# Design: bd-prisma-fundamento (C1/C1b/C3b)

## Context
Serie Plataforma P2 cubre SG §1 C1/C1b/C3b y consolidado 2026-08-24-b §3 Fase C. El store actual `k0mp4ss_fe/apps/web/lib/store.ts:300` está en v25 con ~45 colecciones top-level + 20 maestros (ver `CompassData` y `lib/schemas.ts`). No hay BD. Decisiones D1 (Prisma), D3 (tenant compartido con `comunidadId`) y D5 (repetidos permitidos en app, BD decide) ya tomadas. P2 no toca UI ni store cliente; instala fundamento server-side para B3/Authz (P4) y Auth.js (P5).

## Goals / Non-Goals
**Goals:**
- C1: `prisma/schema.prisma` SQLite dev con toda entidad de dominio y `comunidadId` indexado, migración inicial limpia.
- C1b: `lib/repos/` con scoping obligatorio `crearRepositorio(comunidadId)` y tests A/B que prueban aislamiento.
- C3b: constraints de unicidad compuesta opcionales, documentadas.

**Non-Goals:**
- Migrar datos del store a Prisma (queda para dominio real post-serie, no en ventanas 8).
- C2-final (secretos a env), B3, Auth.js, CSP — quedan en P3-P7.
- UI, cambios de `STORE_VERSION` (sigue 25).

## Decisions
- **Prisma SQLite dev**: `provider = "sqlite"` y `url = env("DATABASE_URL")`. `DATABASE_URL="file:./dev.db"` en `.env.local` (gitignored), documentado en `.env.example`. `.db` gitignored. Alternativa Postgres descartada para dev (requiere Docker). `prisma generate` en `postinstall` opcional.
- **Prisma schema inventario**: `Comunidad` (id, nombre, slug @unique, createdAt) como raíz tenant. 45 modelos top-level mapeados 1:1 a `CompassData` keys + 20 modelos maestro mapeados a `MaestroCollections` (ver lista en proposal). Cada modelo tiene `id String @id`, `comunidadId String`, `comunidad Comunidad @relation(fields:[comunidadId], references:[id], onDelete:Cascade)`, `@@index([comunidadId])`, `createdAt/updatedAt` donde aporta. Campos de negocio tipados según `lib/schemas.ts` (String/Int/Float/Boolean/DateTime/Json). Arrays/objetos anidados (p.ej. `historialTarifas`, `evidencias`, `moras[]`) como `Json`. Esto garantiza `prisma migrate dev` limpio en SQLite y preserva contratos Zod sin explotar en decenas de tablas hijas. Alternativa de normalizar cada nested en tabla propia descartada por costo/tiempo de P2 y porque P4/P5 consumirán repos con payload Json validado por Zod.
- **Naming**: `@@map` snake_case para tablas (opcional). `comunidadId` siempre indexado (D3).
- **Repositorios**: `lib/prisma.ts` singleton PrismaClient (globalThis para HMR). `lib/repos/index.ts` exporta `crearRepositorio(comunidadId: string)` que valida `comunidadId` no vacío y retorna objeto con acceso a cada modelo scoped: `tiposUnidad: { findMany, findById, create, update, delete }` etc. Ningún método acepta `comunidadId` como parámetro opcional ni expone `prisma.*` sin where `comunidadId`. Internamente cada operación hace `where: { id, comunidadId }` o `data: { ..., comunidadId }`. Factory es único punto de acceso; tests importan `crearRepositorio`.
- **Tests A/B**: archivo `lib/repos/repos.test.ts` usa `DATABASE_URL="file:/tmp/test-p2-XXXX.db"` (o `file::memory:?cache=shared` con `better-sqlite3` workaround) y `prisma migrate deploy` o `prisma db push` programático vía `$executeRaw` + creación. Patrón: crear dos comunidades `comunidadA`/`comunidadB` vía `prisma.comunidad.create`, luego `repoA = crearRepositorio(comunidadA.id)` y `repoB = crearRepositorio(comunidadB.id)`. Probar: `repoA.create` crea y `repoB.findById` del mismo id retorna null; `repoB.update/delete` sobre id de A no muta/retorna null; `repoA.findMany` no ve datos de B. Usan `beforeAll` con migrate y `afterAll` con `prisma.$disconnect` y borrado de `.db` temporal.
- **C3b constraints**: D5 dice repetidos permitidos en app; BD decide. Se añaden **solo** donde el dominio gana sin romper D5: cada constraint es `@@unique([comunidadId, campo])` con justificación. Lista documentada aquí:

| Tabla | Constraint | Justificación |
|---|---|---|
| `Comunidad` | `slug @unique` (global) | Identificador URL-safe de la comunidad, no puede colisionar globalmente. |
| `TipoUnidad` | `@@unique([comunidadId, nombre])` | Evita duplicar nombre de tipo por comunidad; el aviso UI D5 ya existe pero BD refuerza sin afectar global. |
| `MacroSector` | `@@unique([comunidadId, nombre])` | Nombres de macro sectores únicos por comunidad (colección pequeña, colisión confusa). |
| `Unidad` | `@@unique([comunidadId, numero])` (opcional, discutido) **NO añadida**: se deja sin constraint porque la app permite repetir número en distintos microsectores; imponerlo rompería D5. Documentado como decisión de no-constraint. |
| `Persona` | `@@unique([comunidadId, rut])` **NO añadida**: D4 exige RUT único por persona pero identidades pueden repetirse entre comunidades (personas distintas con mismo RUT en tenant compartido es válido si son comunidades separadas; además D5 permite repetidos). Se deja sin constraint y se documenta. |
| `VinculoUnidad` | sin unique global; solapamiento se valida en lógica de negocio (fechas), no en BD. |
| `FondoFI` | `@@unique([comunidadId, nombre])` | Fondos con nombre único por comunidad (3 fondos seed). |
| `ProveedorPE` | `@@unique([comunidadId, rut])` | RUT de proveedor único por comunidad (identidad legal). |
| Resto | sin constraints | Repetidos permitidos en app hasta que P3 avise D5; añadir constraint sin necesidad bloquearía casos de banners/avisos duplicados intencionalmente. |

Cada `@@unique` elegida lleva índice implícito; además `@@index([comunidadId])` ya cubre escaneo tenant.

- **STORE_VERSION**: permanece 25, sin `migrate` de store. `lib/store.ts` no se modifica.
- **Env**: `.env.example` añade `DATABASE_URL="file:./dev.db"` con comentario. `.env.local` gitignored (ya por `.gitignore` root `!.env.example` pero `DATABASE_URL` queda allí). Prisma client generado en `node_modules/@prisma/client` + `k0mp4ss_fe/apps/web/node_modules`.

## Risks / Trade-offs
- [66 modelos pueden parecer excesivo] → Mitigación: inventario completo evita desviaciones; `Json` reduce complejidad de migraciones. Si validación pide menos, se puede argumentar ~45+1 modelos cumple mínimo "~25+ colecciones".
- [SQLite Json vs Postgres] → `Json` en SQLite es TEXT, Prisma lo maneja; al migrar a Postgres post-serie se cambia provider sin tocar modelos.
- [Tests con archivo temporal flaky] → Mitigación: usar `file:/tmp/...db?` único por run + `prisma migrate deploy` sin interacción.
- [Scoping bypass via prisma directo] → Mitigación: `lib/prisma.ts` no se exporta para consumo directo desde UI; repos son único export server-side; lint/opinión documentada.

## Migration Plan
1. `npm --prefix k0mp4ss_fe/apps/web install prisma @prisma/client` y `npx prisma init` (si no existe).
2. Crear `prisma/schema.prisma` con `Comunidad` + 65 modelos, `comunidadId` indexado.
3. `DATABASE_URL` en `.env.local` y `.env.example`, `.gitignore` para `*.db`.
4. `npx prisma migrate dev --name init` y `npx prisma generate`.
5. Implementar `lib/prisma.ts` y `lib/repos/*` + test A/B.
6. Validar `npm test -- --run`, `npx tsc --noEmit`, `eslint`, `openspec validate --all`.

## Open Questions
- Ninguna bloqueante. Post-P2 el owner decide Postgres vs SQLite prod y si mantiene `Json` o normaliza.

## Gap tras P2
- Store sigue en localStorage; repos existen pero no son consumidos hasta P4/P5. No hay migración de datos históricos.
