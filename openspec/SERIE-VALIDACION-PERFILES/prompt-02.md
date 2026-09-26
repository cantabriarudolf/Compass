> **Este archivo ES tu prompt.** Ventana P2 de la serie VALIDACION-PERFILES.
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

## Arranque: verificación de P1 (antes de tu alcance)

1. `git status` (tree limpio) y `git status -sb` (sin ahead: todo pusheado) y `git log --oneline -8`.
2. `openspec validate --all` → sin fallos.
3. Lee `00-plan.md`: fila P1 HECHA y todo OK → marca tu fila EN CURSO y continúa.
   HECHA pero algo falla → ARREGLA primero (change fix pequeño + test), anótalo en la
   Bitácora, y solo después empieza tu alcance. PARCIAL → completa ESE alcance antes
   del tuyo. Nunca marques EN CURSO si P1 no está cerrada.

## Alcance P2 — Propias por perfil (specs nuevas)

1. Crea el change `roles-specs-perfil` (proposal + design + tasks mínimos).
2. Registra la 7ma cuenta en `e2e/auth.setup.ts` (CUENTAS: `arrendatario@test.cl` →
   `e2e/.auth/arrendatario.json`) + entrada MATRIZ en `roles-accesos.spec.ts`
   (mismo menú que residente: Inicio, Operaciones, Finanzas, Comunidad).
3. Escribe estos specs (patrón de `roles-journeys.spec.ts`; entidades `TEST-*`
   nuevas; sin confirmar retiros/pagos del seed; sin conteos frágiles):
   - `e2e/crud/maestros-datos.spec.ts`: admin recorre las 8 subtabs de
     `/admin/maestros` con datos + crea 1 registro `TEST-*`.
   - `e2e/crud/residente-ficha.spec.ts`: residente ve SU ficha p-3 en Mis datos
     + reserva RA + solicita certificado CT de su unidad.
   - `e2e/crud/arrendatario-limite.spec.ts`: arrendatario ve su ficha y su unidad
     arrendada; verifica límite (sin ver finanzas de la unidad).
   - Denegación ABAC: residente pide colección ajena → 403 o filtrado según endpoint.
4. Verde: nuevos specs + lane auth completa + `npx tsc --noEmit` + lint + unit
   afectados. `openspec validate --all` sin fallos.
5. Commit (conventional español) + nsgc-prepush + push. Actualiza fila P2 y Bitácora.

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado (HECHA/PARCIAL + motivo). 2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes archivados. 4. Números: STORE_VERSION, tests X/Y,
   tsc/eslint OK. 5. Desviaciones vs el prompt. 6. Pendientes heredados a P3.
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`.
