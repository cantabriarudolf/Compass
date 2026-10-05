> **Este archivo ES tu prompt.** Ventana P2 de la serie PG-FASE3 (cierre).
> Léelo completo (incluido `00-plan.md` de la serie) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie PG-FASE3)

Estado previo: STORE_VERSION 28, unit 85/835, tsc 0, lint 0, e2e 93+2 skip, validate 36/6. Fases 1-2 de `st-migracion-postgres` HECHAS (infra dual + script probado en Neon: 8354 filas, 70/70). Falta Fase 3: CI contra PG, deploy, docs y verificaciones.
Método del proyecto: por cada cambio → openspec-propose → implementar con openspec-apply-change → validar → commitear (conventional español) → sincronizar specs mains y archivar con openspec-archive-change → skill nsgc-prepush antes de cualquier push.
Reglas permanentes: esquema Prisma = migración + tests; secretos jamás en código; Terminología RG §4: "comunidad". Comandos con `workdir k0mp4ss_fe/apps/web`. Playwright gestiona el dev server. Si tu contexto se agota: cierra la tarea en curso + commit + deja el estado exacto en `openspec/SERIE-PG-FASE3/00-plan.md`.

## Arranque: verificación de P1 (antes de tu alcance)

1. `git status` (tree limpio) y `git log --oneline -8`.
2. `openspec validate --all` → contrastá con el número que P1 declaró.
3. Lee `00-plan.md`: fila P1 HECHA → marcá tu fila EN CURSO y continúa.
   HECHA pero algo falla → ARREGLA primero, anótalo en la Bitácora, y solo después empieza tu alcance.
   PARCIAL → completa ESE alcance antes del tuyo. Nunca marques EN CURSO si P1 no está cerrada.

## Alcance P2 — Deploy + docs + verificaciones + archive

1. Script de deploy (task 3.2): migrar datos ANTES del build. Ubicalo donde el proyecto pone sus scripts (`k0mp4ss_fe/apps/web/scripts/`, ej. `deploy-vercel.mjs` existe como referencia) y cablealo donde corresponda (job `deploy` de CI y/o `deploy:vercel`). Debe: correr `prisma migrate deploy` contra PG + `migrate-sqlite-to-postgres.mjs` (idempotente, ya probado) y solo después el build. SIN secretos hardcodeados (env del runner/Vercel). Si tocás el job `deploy`, documentalo y avisalo en el reporte (el plan lo permite pero con aviso).
2. Docs (task 3.3): documentá el dual SQLite/PG en los manuales que correspondan (buscá los de AU-autenticación y ST-datos en `Data/NSGC/docs/manuales/`, formato y tono existentes). Sin inventar: solo lo implementado en P1+P2.
3. Verificaciones finales con números ACTUALES (actualizá los checkboxes del change, los viejos 606/606 y 86/88 están desactualizados): tsc 0 + unit SQLite 85/835 + unit PG (resultado P1 o CI) + e2e única (spot-check si la corrida completa excede tu ventana: al menos lanes crud+flujo exportados por P1/P2... no, corrida completa o nada: si no cabe, declará PARCIAL con lo corrido).
4. `openspec archive st-migracion-postgres -y` (si aborta: PARCIAL honesto con el mensaje exacto, sin merges manuales).
5. Commit (conventional español), sin push (el push y el corte real con Neon los decide el owner). Actualiza fila P2 y Bitácora.

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado (HECHA/PARCIAL + motivo). 2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes archivados. 4. Números finales: STORE_VERSION,
   unit SQLite/PG x/y, e2e x/y, tsc/eslint OK. 5. Desviaciones vs el prompt.
6. Pendientes fuera de la serie (decisiones del owner: DATABASE_URL Neon en Vercel + corrida real).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`.
