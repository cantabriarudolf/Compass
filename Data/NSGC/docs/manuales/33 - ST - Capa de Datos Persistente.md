# 🗄️ 33 - Capa de Datos Persistente (ST)

Este módulo es el corazón de datos de GECOS en el frontend. Centraliza el estado del dominio en un único store global, lo persiste entre recargas y expone acciones CRUD validadas.

## 🚀 Funcionalidad Principal

Ser la fuente de verdad temporal del frontend mientras no haya backend. Toda entidad del sistema vive acá y se comparte entre módulos.

## 🛠️ Arquitectura

- **Store Global**: implementado con Zustand. `apps/web/lib/store.ts` es la fábrica que combina por spread el estado de dominio con **7 slices hoja** en `apps/web/lib/store/slices/`: `ir-slice.ts` (Inventario y Recursos), `mt-slice.ts` (Mantenimiento y Proyectos), `ad-slice.ts` (Gestión Administrativa), `pi-slice.ts` (Portal Inmobiliario), `co-slice.ts` (Comunicación Vecinos), `ge-slice.ts` (Gestión de Solicitudes) y `cv-slice.ts` (Visor de Mensajes).
- **Cómo se combina**: dentro de la factory va primero `...seedData()` y después `...irSlice(set, get, api)`, `...mtSlice(set, get, api)`, `...adSlice(...)`, `...piSlice(...)`, `...coSlice(...)`, `...geSlice(...)`, `...cvSlice(...)`. Cada slice recibe los mismos `(set, get, api)` y declara **sólo** su estado y sus acciones; las interfaces de todos los miembros siguen en `CompassStore` (en `lib/store.ts`), así que `useCompassStore` y `@/lib/store` no cambian para la app.
- **Helpers puros**: sin estado y sin ciclo runtime viven en `apps/web/lib/store/helpers.ts` (`registrarEvento`, `periodoDirectivaVigente`, `esMiembroDirectivaVigente`, `resolverVariablesCO`, `upsert`, …); `lib/store.ts` los re-exporta.
- **Cross-writes**: una acción puede mutar estado de otro dominio con `get()`/`set()` (p. ej. `publicarActaEnCV` de AD escribe `avisosCV` de CV); como todo se combina en un único objeto final, funciona igual que en el monolito.
- **Movimiento puro (change `st-split-fase2`)**: el split sólo cambió **dónde** se declaran el estado y las acciones. `STORE_VERSION` está congelada en **28** y el shape persistido (`CompassData`, `seedData`, `partialize`, migraciones) no cambió.
- **Persistencia**: `localStorage` con key `compass-store`, versión de esquema y función `migrate`.
- **Patrón Repository**: las páginas no mutan el estado directamente; usan acciones como `saveUnidad`, `removePersona`, `saveConfiguracion`, etc.
- **Seed Inicial**: la primera carga siembra datos desde `apps/web/data/`.

## 🛠️ Entidades Cubiertas

- **Inventario**: tipos de unidad, macro sectores, micro sectores, unidades y estacionamientos.
- **Comunidad**: personas y vínculos de unidad.
- **Maestros**: AFP, bancos, previsiones, feriados, categorías, estados, etc.
- **Configuración Global**: parámetros de la comunidad.

## ⚠️ Reglas de Integridad

Las eliminaciones validan dependencias. No podés borrar:
- Un tipo de unidad con unidades físicas asociadas.
- Un macro sector con micro sectores.
- Un micro sector con unidades.
- Una unidad con estacionamientos o vínculos de persona.
- Un estacionamiento con asignación activa.
- Una persona con vínculos de unidad.

- **Producción: Neon PostgreSQL + dual SQLite/PG** (st-migracion-postgres, cerrada 2026-10-05): `lib/prisma.ts` usa `datasourceUrl: process.env.DATABASE_URL` (SQLite en dev/test, Neon en prod vía dashboard Vercel) + `@prisma/extension-accelerate` para pooling. Un solo schema fuente (`prisma/schema.prisma`, provider `postgresql`); `scripts/sync-schema.mjs` genera `prisma/schema.sqlite.prisma` para dev (`npm run db:dev/generate/push`, migraciones SQLite históricas en `prisma/migrations/`, respaldo en `prisma/migrations-sqlite-backup/`). CI corre la suite unit en ambos motores (job `unit` SQLite + job `unit-pg` con service postgres:16). Corte de datos: `npm run db:prod:migrar-datos` (→ `scripts/deploy-migrar-datos.mjs`: valida `DATABASE_URL` PG, crea el esquema baseline con `db push` y migra con `scripts/migrate-sqlite-to-postgres.mjs`, idempotente upsert por ID — probado: 23087 filas, 71/71 tablas, 0 fallidas) y recién después el build. Pendiente del owner: `DATABASE_URL` de Neon en Vercel + corrida real + primera migración PG versionada post-corte.

- **Tablas auth en BD (no en store)**: `Usuario`, `Membresia`, `RateLimitAttempt` (rate limit persistente SG D-v), `tokenVersion` (invalidación sesiones FASE2 P2), `twoFactorSecret`/`twoFactorBackupCodes` (2FA FASE2 P3), `solicitudEliminacion`/`solicitudEliminacionAt` (derecho al olvido FASE2 P6, Ley 21.719). Estas viven solo en Prisma/BD, **no** en el store Zustand (congelado v28). Fail-fast Google provider en prod (sg-google-provider-prod-guard): valida `GOOGLE_CLIENT_ID`/`SECRET` en `NODE_ENV=production` al cargar `lib/auth.ts`. JWT 24h maxAge + 1h sliding verificado (sg-jwt-maxage-verify): `authConfig.session.maxAge=86400`, `updateAge=3600` en `lib/auth.config.ts:26`.

## 💡 Tips de Oro

- **Hidratación**: toda página que lee del store debe usar `useStoreRehydrated()` y mostrar un skeleton hasta que `hasHydrated` sea `true`.
- **Nunca uses `useState` local** para datos de dominio: leé del store con `useCompassStore` y mutá con sus acciones.
- **Mocks**: los archivos de `apps/web/data/` son solo semillas. No los importes directamente desde páginas o componentes.

## 🔗 Dependencias

- Alimenta de datos a todos los módulos operativos: **TU**, **EF**, **ES**, **MP**, **VU**, **MA**, **CF**, **AM**, etc.
- Las reglas de uso están definidas en **RG - Reglas Generales**.
