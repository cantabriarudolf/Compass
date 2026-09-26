> **Este archivo ES tu prompt.** Ventana P1 de la serie VALIDACION-PERFILES.
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

## Alcance P1 — Transversales (solo verificación; NO escribas código de fix aquí)

1. Marca tu fila EN CURSO en `00-plan.md`. Reporta `git status -sb` (tree limpio;
   si hay ahead sin pushear, repórtalo, NO pushees trabajo ajeno).
2. Corre, en orden, redirigiendo salida a archivos y reportando solo el tail:
   `npx tsc --noEmit` · `npm run lint` · `npm test` (suite unit completa) ·
   `npx playwright test e2e/auth` (lane auth con servidor dev vivo; instala
   chromium solo si falta).
3. Verifica la matriz transversal SIN modificar specs: `roles-accesos.spec.ts`
   debe afirmar visibles/ocultos por rol + `403` en
   `/api/admin/usuarios?comunidadId=comunidad-a` para no-admin y `200` para admin.
4. Si algo da ROJO: NO lo arregles (los fixes van por ARRANQUE de P2 con su change).
   Registra evidencia exacta (archivo, línea, salida) en tu reporte.
5. El checklist manual §4 de `cuentas-funcionales.md` (ojos del owner) queda como
   TAREA DEL OWNER, no de esta ventana: lístalo como pendiente heredado.

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado (HECHA/PARCIAL + motivo). 2. Commits (hash + subject) y push
   sí/no (P1 verify-only normalmente no commitea nada: decláralo).
3. Specs/changes tocados (ninguno esperado). 4. Números: tsc, eslint, unit X/Y,
   e2e-auth X/Y, STORE_VERSION. 5. Desviaciones vs el prompt.
6. Pendientes heredados a P2 (incluye checklist manual del owner + rojos con evidencia).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`.
   Además actualiza tu fila en `00-plan.md` (Estado + Commit final o "s/cambios").
