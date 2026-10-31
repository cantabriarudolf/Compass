# Proposal: Migración SQLite → PostgreSQL

## Contexto

El proyecto usa Prisma + SQLite en desarrollo (`provider = "sqlite"`, `DATABASE_URL=file:./dev.db`).
La SERIE-PRODUCCION-FASE2 P1 ya preparó la infraestructura para PostgreSQL en producción:
`lib/prisma.ts` usa `datasourceUrl`, `.env.example` documenta `DATABASE_URL` para PostgreSQL,
y el código está listo para Neon/Supabase.

**Gap**: el schema Prisma sigue con `provider = "sqlite"`, no hay script de migración de datos,
y no hay estrategia definida para entornos dev vs prod.

## Objetivo

Migrar el stack de datos de SQLite a PostgreSQL con cero pérdida de datos y sin regresión
funcional. La migración debe ser reversible (backup) y testeable.

## Alcance

1. **Cambio de provider**: `prisma/schema.prisma` de `sqlite` a `postgresql`.
2. **Estrategia dual dev/prod**: SQLite para dev local (rápido, sin Docker) + PostgreSQL
   para CI/producción, o migración completa a PostgreSQL en todos los entornos.
3. **Script de migración de datos**: exportar SQLite → importar PostgreSQL (idempotente).
4. **Migraciones Prisma**: regenerar para PostgreSQL o usar `db push` en dev.
5. **Tests**: verificar que la suite completa pasa contra PostgreSQL.
6. **Documentación**: actualizar manuales, README, `.env.example`.

## No-alcance

- Cambio de ORM (se mantiene Prisma).
- Sharding o read replicas.
- Migración de datos del store (localStorage) — eso es ST capa de datos, no BD relacional.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Pérdida de datos durante migración | Backup obligatorio antes de correr script. Script idempotente (upsert por ID). |
| Regresión en tests | Correr suite completa antes y después. CI con PostgreSQL. |
| Diferencias de tipo SQLite↔PostgreSQL | Auditar campos `Json`, `DateTime`, `Float`. Prisma abstrae la mayoría. |
| Dev local sin PostgreSQL | Docker compose o schema dual. Documentar ambos caminos. |

## Esfuerzo estimado

1–2 ventanas (dependiendo de la estrategia dual vs completa).

## Decisión pendiente del owner

- ¿**Dual** (SQLite dev / PostgreSQL prod) o **completa** (PostgreSQL en todos lados)?
- Si completa: ¿Docker local o instancia cloud gratuita (Neon/Supabase) para dev?
- Si dual: ¿acepta el overhead de mantener dos schemas sincronizados?
