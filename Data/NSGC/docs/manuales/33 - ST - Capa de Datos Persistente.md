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
- **Configuración Global**: parámetros del condominio.

## ⚠️ Reglas de Integridad

Las eliminaciones validan dependencias. No podés borrar:
- Un tipo de unidad con unidades físicas asociadas.
- Un macro sector con micro sectores.
- Un micro sector con unidades.
- Una unidad con estacionamientos o vínculos de persona.
- Un estacionamiento con asignación activa.
- Una persona con vínculos de unidad.

- **Producción: Neon PostgreSQL** (FASE2 P1, parcial intencional): `lib/prisma.ts` usa `datasourceUrl: process.env.DATABASE_URL` (SQLite en dev/test, Neon en prod vía dashboard Vercel) + `@prisma/extension-accelerate` para pooling. Migraciones SQLite respaldadas en `prisma/migrations-sqlite-backup/`. Pendiente: script de datos SQLite→PG, backup/restore para PG y cambio de provider al desplegar.

## 💡 Tips de Oro

- **Hidratación**: toda página que lee del store debe usar `useStoreRehydrated()` y mostrar un skeleton hasta que `hasHydrated` sea `true`.
- **Nunca uses `useState` local** para datos de dominio: leé del store con `useCompassStore` y mutá con sus acciones.
- **Mocks**: los archivos de `apps/web/data/` son solo semillas. No los importes directamente desde páginas o componentes.

## 🔗 Dependencias

- Alimenta de datos a todos los módulos operativos: **TU**, **EF**, **ES**, **MP**, **VU**, **MA**, **CF**, **AM**, etc.
- Las reglas de uso están definidas en **RG - Reglas Generales**.
