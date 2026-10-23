# Backfill por motor

Estos archivos no son migraciones: son los **backfills de datos** que cada motor necesita
cuando el cambio de esquema no puede ejecutarlos por sí solo.

## Por qué dos dialectos

`prisma/migrations/` está fijado a **SQLite** (`migration_lock.toml: provider = "sqlite"`)
y es lo que corre el job `unit` del CI (`prisma migrate deploy --schema=prisma/schema.sqlite.prisma`).
En **PostgreSQL** este proyecto no tiene migraciones versionadas: el esquema lo crea
`prisma db push` y el job `unit-pg` hace exactamente eso. Es decir, el backfill no puede
vivir en un único archivo SQL válido para ambos motores: `INSERT OR IGNORE` + `json_each`
es SQLite, `ON CONFLICT DO NOTHING` + `jsonb_array_elements` es PostgreSQL.

| Motor | Dónde vive el backfill | Cuándo corre |
|---|---|---|
| SQLite | `prisma/migrations/20261024000000_add_envio_destinatarios_co/migration.sql` (bloque entre `-- @backfill:start` y `-- @backfill:end`) | Solo, con `prisma migrate deploy` / `migrate dev` |
| PostgreSQL | `prisma/backfill/envio_destinatarios_co.pg.sql` | Manual, después de `prisma db push`: `psql "$DATABASE_URL" -f prisma/backfill/envio_destinatarios_co.pg.sql` |

Ambos son **idempotentes**: correrlos dos veces no duplica filas.

## Contrato de los backfills

- Una fila de `envio_destinatarios_co` por cada elemento de `envios_co.destinatarios`
  (`personaId`, `unidadId`).
- `leidoEn` marcado para cada `personaId` presente en `envios_co.lecturas`. El array
  `lecturas` nunca guardó la hora de la lectura (era `string[]`), así que se conserva el
  `createdAt` del envío como cota inferior conocida: marcar la hora de la migración
  inventaría un momento de lectura que no ocurrió.
- No dependen de la aplicación: son SQL puro.

La verificación de conteos vive en `test/co-envio-destinatarios-co.test.ts` (S8): filas de
la tabla == suma de `destinatarios`, y cada `personaId` de `lecturas` quedó con su `leidoEn`.
