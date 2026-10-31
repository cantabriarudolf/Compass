# Proposal: e2e-fresh-prisma-generate (hallazgo R3-missing-prisma-generate)

## Problema

Hallazgo CRITICAL `R3-missing-prisma-generate` del review RDD de la porción C3
(SERIE-NOCHE-2): `scripts/e2e-fresh.mjs` corría `npx prisma migrate deploy
--schema=prisma/schema.sqlite.prisma` y seguía directo a `npm run e2e:reseed-base` sin
regenerar nunca el cliente Prisma para ese schema. Si el último `prisma generate` de la
máquina fue el default (PostgreSQL — p. ej. tras el job `unit-pg` del CI, que corre
`npx prisma generate` a secas), el seed de `e2e:reseed-base` ejecutaba un cliente PG
contra la base descartable SQLite y moría con exit 1. Inferencial + refuter confirmado:
con cliente PG el script viejo falla en `npm run e2e:reseed-base`; con el fix completa
("Lista: base fresca + seed completo").

## Propuesta

1. `scripts/e2e-fresh.mjs` ejecuta `npx prisma generate --schema=prisma/schema.sqlite.prisma`
   (con el `DATABASE_URL` propio de la base descartable) **entre** el `migrate deploy` y el
   `e2e:reseed-base`, como paso (a.2) del pipeline. Semántica del resto del script intacta.
2. Encabezado del script actualizado: la lista de pasos de paridad con el job `e2e` de
   `ci.yml` ahora declara 4 pasos (migrate → generate → seed → advertencias/comando).
3. Delta de spec: el requirement de la lane e2e en `DEV-qa-lab` documenta que `e2e:fresh`
   fija el cliente Prisma del schema SQLite antes del seed, con escenario de regresión.

## No-objetivos

- Rediseñar la semántica del script (el orden migrate → seed y las guardas de nombre
  `perf*.db` / jamás `dev.db` quedan idénticos).
- Tocar el job `e2e` del CI (allí el `prisma generate --schema` ya existía en el flujo).
- Archivar el change en esta ventana (lo decide el orquestador tras CI verde del PR).
