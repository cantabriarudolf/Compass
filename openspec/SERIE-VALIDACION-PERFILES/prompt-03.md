> **Este archivo ES tu prompt.** Ventana P3 de la serie VALIDACION-PERFILES.
> Léelo completo (incluido `00-plan.md` de la serie) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie VALIDACION-PERFILES)

Estado previo: STORE_VERSION 28, vitest 82 archivos, e2e 43 specs (auth 5, crud 32,
flujo 3, smoke 2, a11y 1), tsc 0 errores (2026-09-26). Series cerradas:
SERIE-FRONTERA, SERIE-BD-FUENTE-VERDAD, SERIE-UI-MIGRACION-BD, SERIE-PRODUCCION (+FASE2).
Método del proyecto: por cada cambio → openspec-propose → implementar con
openspec-apply-change → validar → commitear (conventional español) → sincronizar
specs mains y archivar con openspec-archive-change → skill nsgc-prepush antes de
cualquier push.
Reglas permanentes: dato de dominio solo vía API REST con scope `comunidadId`
(`withComunidadScope`: última membresía, take:1, sin override); mocks de `data/`
son solo seed; D1 media por referencia (sin base64/Blob); secretos jamás en
localStorage ni código; cada cambio de esquema Prisma = migración + tests.
Cuentas TEST (password universal `Test1234!`, 2FA off, comunidad `comunidad-a`):
`admin/comite/conserjeria/residente/mantencion/arrendatario@test.cl`
(arrendatario = login rol `residente` + ficha p-arrendatario-1 con vínculo
arrendatario vigente en u-A-101). Matriz sidebar esperada en
`e2e/auth/roles-accesos.spec.ts` (MATRIZ). Seed reproducible:
`npm run seed:authz` + `npm run seed:mocks -- --comunidad-id=comunidad-a`
(OBLIGATORIO el flag con backup-a en la BD).
Verificación por ventana: `cd k0mp4ss_fe/apps/web` y `npx tsc --noEmit` + lint
(0 errores) + suites indicadas + `openspec validate --all` sin fallos.
Servidor dev: `http://localhost:3000` (levantarlo si está caído con `npm run dev`).
`next build` puede fallar por red (Google Fonts): ignóralo salvo ventana de deploy.
Si tu contexto se agota: cierra la tarea en curso + commit + deja el estado exacto
en `openspec/SERIE-VALIDACION-PERFILES/00-plan.md`.

## Arranque: verificación de P2 (antes de tu alcance)

1. `git status` (tree limpio) y `git status -sb` (sin ahead: todo pusheado) y `git log --oneline -8.
2. `openspec validate --all` → sin fallos.
3. Lee `00-plan.md`: fila P2 HECHA y todo OK → marca tu fila EN CURSO y continúa.
   HECHA pero algo falla → ARREGLA primero (change fix pequeño + test), anótalo en la
   Bitácora, y solo después empieza tu alcance. PARCIAL → completa ESE alcance antes
   del tuyo. Nunca marques EN CURSO si P2 no está cerrada.

## Alcance P3 — Integral y archivo

1. Corre TODO: `npm test` (unit completa) + `npx tsc --noEmit` + lint +
   `npx playwright test` (e2e completa, 43+ specs nuevas de P2) con servidor dev vivo.
2. Checklist manual §4 de `cuentas-funcionales.md`: pídeselo al owner (ojos humanos,
   ~15 min, las 7 cuentas). Sin su OK, la serie NO se declara completa: marca PARCIAL
   y hereda el pendiente con nombre y apellido.
3. Si todo verde + checklist OK: archiva los changes (`roles-validacion-comunidad-a`
   y `roles-specs-perfil` si existe) tras CI verde local, actualiza fila P3 y Bitácora.
4. nsgc-prepush + push. Marca la serie COMPLETA en `00-plan.md`.

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado (HECHA/PARCIAL + motivo). 2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes archivados. 4. Números finales: STORE_VERSION,
   unit X/Y, e2e X/Y, tsc/eslint OK. 5. Desviaciones vs el prompt.
6. Pendientes fuera de la serie (decisiones del owner).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`.
