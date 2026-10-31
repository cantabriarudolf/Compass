# Design: e2e-fresh-prisma-generate (hallazgo R3-missing-prisma-generate)

## D1 — El hallazgo (CRITICAL, inferencial + refuter confirmado)

`scripts/e2e-fresh.mjs` prepara la base descartable de la lane e2e local con paridad al
job `e2e` de `.github/workflows/ci.yml`:

```
(1) npx prisma migrate deploy --schema=prisma/schema.sqlite.prisma
(2) npm run e2e:reseed-base
```

El cliente Prisma es singleton por `node_modules/.prisma/client`: el último
`prisma generate` gana para todos los subprocessos. El script regeneraba el cliente
**nunca**, así que si el último generate fue el default (PostgreSQL — típico tras correr
el job `unit-pg`, que ejecuta `npx prisma generate` a secas), el seed de `e2e:reseed-base`
corre con el client PG contra `file:./perf-fresh.db` y muere con exit 1. En el CI esto no
explota porque el job `e2e` hace su propio `prisma generate --schema` antes; el hueco era
del script local. Review RDD de la porción C3 (SERIE-NOCHE-2).

## D2 — El fix: paso (a.2) generate con el schema SQLite

Entre el `migrate deploy` (paso a) y el `e2e:reseed-base` (paso b) se inserta:

```js
correr("npx", ["prisma", "generate", "--schema=prisma/schema.sqlite.prisma"], {
  DATABASE_URL: databaseUrl,
});
```

El generate recibe el `DATABASE_URL` propio de la base descartable (aunque para
`generate` solo importa el schema) y regenera el client apuntando a SQLite, de modo que
el seed subsiguiente —y cualquier corrida Playwright con el mismo comando— usa el client
correcto. El encabezado del script actualiza la lista de paridad a 4 pasos:
migrate → generate → seed → advertencias/comando.

## D3 — Por qué aquí y no en otro lado

- La guarda de nombre (`perf*.db`, jamás `dev.db`) y el `DATABASE_URL` explícito por
  subprocess ya aíslan la base; el generate nuevo hereda ese mismo env, sin superficie
  nueva.
- El CI ya genera el client SQLite en el job `e2e`; el fix le da paridad al script local
  sin tocar `ci.yml`.
- Ubicación del requisito: `DEV-qa-lab`, requirement de la lane e2e (el único que
  documenta la receta `e2e:reseed-base`/`e2e:higiene` y la corrida única); no aplica
  `SG-hardening-despliegue` (no tiene requisito de lane/script e2e).

## D4 — Evidencia RED→GREEN (observada por el orquestador)

- RED: con cliente PG activo (`npx prisma generate` default), el script viejo falla en
  `npm run e2e:reseed-base` con exit 1 (seed contra `file:./perf-fresh.db` con client PG).
- GREEN: con el fix, la misma condición completa el pipeline y termina con
  "Lista: base fresca + seed completo".

## D5 — Riesgos residuales

- El `prisma generate` agrega ~5-10 s a cada `e2e:fresh`; irrelevante frente al costo de
  una lane completa y elimina una clase entera de fallo no determinista según el orden en
  que se corrieron los jobs antes.
- Si en el futuro se paraleliza la lane con varias bases, el client sigue siendo singleton:
  cualquier runner que necesite otro schema deberá regenerar antes de seedear (mismo
  patrón que introduce este change).
