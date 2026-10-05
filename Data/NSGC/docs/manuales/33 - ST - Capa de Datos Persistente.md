# 🗄️ 33 - Capa de Datos Persistente (ST)

Este módulo es el corazón de datos de GECOS en el frontend. Centraliza el estado del dominio en un único store global, lo persiste entre recargas y expone acciones CRUD validadas.

## 🚀 Funcionalidad Principal

Ser la fuente de verdad temporal del frontend mientras no haya backend. Toda entidad del sistema vive acá y se comparte entre módulos.

## 🛠️ Arquitectura

- **Store Global**: implementado con Zustand en `apps/web/lib/store.ts`.
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

## 💡 Tips de Oro

- **Hidratación**: toda página que lee del store debe usar `useStoreRehydrated()` y mostrar un skeleton hasta que `hasHydrated` sea `true`.
- **Nunca uses `useState` local** para datos de dominio: leé del store con `useCompassStore` y mutá con sus acciones.
- **Mocks**: los archivos de `apps/web/data/` son solo semillas. No los importes directamente desde páginas o componentes.

## 🔗 Dependencias

- Alimenta de datos a todos los módulos operativos: **TU**, **EF**, **ES**, **MP**, **VU**, **MA**, **CF**, **AM**, etc.
- Las reglas de uso están definidas en **RG - Reglas Generales**.
