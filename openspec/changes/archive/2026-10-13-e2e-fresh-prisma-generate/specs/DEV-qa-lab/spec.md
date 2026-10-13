## MODIFIED Requirements

### Requirement: Corrida e2e única sin tag GATED (specs autónomos)
La suite e2e SHALL correr en corrida única (`npx playwright test`, local y job
`e2e` del CI) sin tag `(GATED)` en los `describe` ni scripts de orden
`e2e:nongated` / `e2e:gated` / `e2e:full-orden` (eliminados por SERIE-E2E-SIN-GATED
`b7e88a8`: ya no existen en `package.json`). Cada spec que use poblamiento
QA-Lab SHALL ser autónomo: setup vía helper compartido `e2e/helpers/datos-test.ts`
y cleanup propio (API o `finally`), de modo que ningún spec dependa de su
posición en la corrida ni del dato que otro spec dejó poblado. Entre corridas,
la receta `npm run e2e:reseed-base` + `npm run e2e:higiene --apply` SHALL
restaurar el estado base (detalle en el requirement `Higiene BD repetible
(e2e:higiene)`). El restore del nombre de `admin-configuracion` en `finally`
SHALL mantenerse compatible: restaura el nombre original del seed para que
`permisos` siga encontrando `/Los Aromos/`. `npm run e2e:fresh`
(`scripts/e2e-fresh.mjs`) SHALL regenerar el cliente Prisma del schema SQLite
(`npx prisma generate --schema=prisma/schema.sqlite.prisma`, con el
`DATABASE_URL` propio de la base descartable) entre el `migrate deploy` y el
`e2e:reseed-base`, de modo que el seed y la corrida no dependan de cuál fue el
último `prisma generate` de la máquina (p. ej. el default PostgreSQL tras el job
`unit-pg`), que rompía el seed con exit 1 (R3-missing-prisma-generate).

#### Scenario: Corrida única sin tag GATED ni scripts de orden
- **WHEN** se corre `npx playwright test` (local o job `e2e` del CI)
- **THEN** todos los specs corren en una sola corrida sin fases, ningún
  `describe` lleva `(GATED)` y `package.json` no define `e2e:nongated`,
  `e2e:gated` ni `e2e:full-orden`

#### Scenario: Spec autónomo en cualquier posición de la corrida
- **WHEN** un spec que usa poblamiento QA-Lab corre al inicio, al final o solo
- **THEN** su setup vía `e2e/helpers/datos-test.ts` y su cleanup propio dejan
  el estado acotado: no depende de datos de otros specs ni contamina los que
  corren después

#### Scenario: Receta entre corridas restaura el estado base
- **WHEN** se corre `npm run e2e:reseed-base` y después `npm run e2e:higiene --apply`
  (su dry-run por defecto reporta las filas TEST/QA a purgar)
- **THEN** la BD vuelve al estado base y la corrida siguiente parte determinista,
  sin receta manual de membresías

#### Scenario: e2e:fresh fija el cliente Prisma SQLite antes del seed (R3-missing-prisma-generate)
- **WHEN** el último `prisma generate` de la máquina fue el default PostgreSQL
  (p. ej. tras correr `npx prisma generate` a secas como el job `unit-pg`) y se
  ejecuta `npm run e2e:fresh`
- **THEN** el script corre `npx prisma generate --schema=prisma/schema.sqlite.prisma`
  con el `DATABASE_URL` de la base descartable antes de `npm run e2e:reseed-base`,
  el seed termina completo y el script cierra con "Lista: base fresca + seed completo"
