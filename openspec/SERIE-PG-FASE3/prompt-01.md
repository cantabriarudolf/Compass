> **Este archivo ES tu prompt.** Ventana P1 de la serie PG-FASE3.
> Léelo completo (incluido `00-plan.md` de la serie) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie PG-FASE3)

Estado previo: STORE_VERSION 28, unit 85/835, tsc 0, lint 0, e2e 93+2 skip, validate 36/6. Fases 1-2 de `st-migracion-postgres` HECHAS (infra dual + script probado en Neon: 8354 filas, 70/70). Falta Fase 3: CI contra PG, deploy, docs y verificaciones.
Método del proyecto: por cada cambio → openspec-propose → implementar con openspec-apply-change → validar → commitear (conventional español) → sincronizar specs mains y archivar con openspec-archive-change → skill nsgc-prepush antes de cualquier push.
Reglas permanentes: esquema Prisma = migración + tests; secretos jamás en código; Terminología RG §4: "comunidad". Comandos con `workdir k0mp4ss_fe/apps/web`. Playwright gestiona el dev server. Si tu contexto se agota: cierra la tarea en curso + commit + deja el estado exacto en `openspec/SERIE-PG-FASE3/00-plan.md`.

## Alcance P1 — CI contra PostgreSQL + .env.example

Eres la primera ventana: marca tu fila EN CURSO en `00-plan.md`.

1. Partí de tree limpio. Leé `openspec/changes/st-migracion-postgres/tasks.md` (Fase 3), `proposal.md`/`design.md` del change y `docker-compose.db.yml` + `.env.example` actuales.
2. CI (`.github/workflows/ci.yml`, job `unit`, SIN tocar `e2e`, `e2e-rate-limit` ni `deploy`): agregá service container PostgreSQL y una matriz o job que corra `npm test` (Vitest) contra PG (`DATABASE_URL` postgresql:// + `prisma migrate deploy` con el schema PG antes). Los tests que usan Prisma real deben pasar igual que en SQLite; si alguno asume SQLite (ej. rutas de `file:`), adaptalo con el cambio mínimo y documentalo.
3. `.env.example`: que documente AMBOS providers (SQLite dev local + PostgreSQL prod) con comentarios, sin secretos reales.
4. Verificación local: si hay Docker disponible, levantá PG con el compose y corré la suite unit contra PG en verde; si Docker NO está disponible, documentalo en la Bitácora como pendiente de CI y no bloquees (CI lo verificará). En ambos casos: unit contra SQLite sigue 85/835 + tsc 0 + lint 0.
5. Actualizá los checkboxes 3.1 y 3.4 (y los que correspondan) en `tasks.md` del change con lo observado. NO archives el change (lo hace P2).
6. Commit (conventional español), sin push. Actualiza fila P1 y Bitácora (qué se agregó a CI, resultado PG local o pendiente CI).

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado (HECHA/PARCIAL + motivo). 2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes archivados (ninguno en P1). 4. Números finales: STORE_VERSION,
   unit SQLite x/y, unit PG x/y (o pendiente CI), tsc/eslint OK. 5. Desviaciones vs el prompt.
6. Pendientes heredados a P2.
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`.
