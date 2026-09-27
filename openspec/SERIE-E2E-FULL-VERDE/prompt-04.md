> **Este archivo ES tu prompt.** Ventana P4 de la serie E2E-FULL-VERDE (cierre).
> Léelo completo (incluido `00-plan.md` de la serie) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie E2E-FULL-VERDE)

Estado previo: STORE_VERSION 28, vitest 82 archivos 809/809, tsc 0, lint 0 errores.
Serie VALIDACION-PERFILES en PARCIAL. P1: reseed reproducible + GATED; P2: lane
crud verde; P3: lanes flujo/a11y/smoke verdes. Series cerradas: FRONTERA,
BD-FUENTE-VERDAD, UI-MIGRACION-BD, PRODUCCION (+FASE2).
Método del proyecto: por cada cambio → openspec-propose → implementar con
openspec-apply-change → validar → commitear (conventional español) → sincronizar
specs mains y archivar con openspec-archive-change → skill nsgc-prepush antes de
cualquier push.
Reglas permanentes: dato de dominio solo vía API REST con scope `comunidadId`
(`withComunidadScope`: última membresía, take:1, sin override); mocks de `data/`
son solo seed; D1 media por referencia (sin base64/Blob); secretos jamás en
localStorage ni código; cada cambio de esquema Prisma = migración + tests.
Terminología RG §4: "comunidad" (nunca "condominio").
Cuentas TEST (password universal `Test1234!`, 2FA off, comunidad `comunidad-a`):
`admin/comite/conserjeria/residente/mantencion/arrendatario@test.cl`.
Seed reproducible (receta P1, sin pasos manuales). Servidor dev:
`http://localhost:3000` (levantarlo si está caído con `npm run dev`).
`next build` puede fallar por red (Google Fonts): ignóralo salvo ventana de deploy.
Si tu contexto se agota: cierra la tarea en curso + commit + deja el estado exacto
en `openspec/SERIE-E2E-FULL-VERDE/00-plan.md`.

## Arranque: verificación de P3 (antes de tu alcance)

1. `git status` (tree limpio) y `git status -sb` (sin ahead: todo pusheado) y `git log --oneline -8`.
2. `openspec validate --all` → contrastá con el número que P3 declaró.
3. Lee `00-plan.md`: fila P3 HECHA → ejecutá receta reseed P1 y marcá tu fila
   EN CURSO. HECHA pero algo falla → ARREGLA primero (change fix pequeño + test),
   anótalo en la Bitácora, y solo después empieza tu alcance. PARCIAL → completa
   ESE alcance antes del tuyo. Nunca marques EN CURSO si P3 no está cerrada.

## Alcance P4 — Integral y cierre de ambas series

1. Partí de reseed limpio P1. Corre TODO con servidor dev vivo: `npm test`
   (unit completa) + `npx tsc --noEmit` + lint + `npx playwright test` (e2e
   completa, UNA sola corrida) + `openspec validate --all`.
2. Checklist manual §4 de `openspec/changes/roles-validacion-comunidad-a/cuentas-funcionales.md`:
   pídeselo al owner (ojos humanos, ~15 min, las 7 cuentas). Si el owner ya lo
   hizo en el track P0, pedí confirmación explícita y citala en la Bitácora. Sin
   su OK, la serie NO se declara completa: marca PARCIAL y hereda el pendiente
   con nombre y apellido (no archivar, no pushear).
3. Si todo verde + checklist OK: archiva los changes (`roles-validacion-comunidad-a`
   y `roles-specs-perfil` si existe, más los de esta serie) tras CI verde local,
   sincroniza specs mains, actualiza fila P4 y Bitácora.
4. nsgc-prepush (skill obligatoria antes de pushear) + push. Marca E2E-FULL-VERDE
   COMPLETA en `00-plan.md` y VALIDACION-PERFILES COMPLETA en su `00-plan.md`.
   Apaga el dev server post-ventana.

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado (HECHA/PARCIAL + motivo). 2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes archivados. 4. Números finales: STORE_VERSION,
   unit X/Y, e2e X/Y, tsc/eslint OK. 5. Desviaciones vs el prompt.
6. Pendientes fuera de la serie (decisiones del owner).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`.
