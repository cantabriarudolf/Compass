> **Este archivo ES tu prompt.** Ventana P2 de la serie E2E-SIN-GATED (cierre técnico).
> Léelo completo (incluido `00-plan.md` de la serie) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie E2E-SIN-GATED)

Estado previo: GATED-API-BD P5 PARCIAL — STORE_VERSION 28, unit 85/835, tsc 0,
lint 0 errores, no-GATED 88/89+2 skip, GATED 4/4, validate 41/7 sin-deltas;
main local ahead 19, resguardo en `resguardo/serie-gated-api-bd`. 5 specs con
setup API duplicado: `e2e/crud/pagos|certificados|portal|remuneraciones.spec.ts`
+ `e2e/flujo/poblamiento.spec.ts`. Tag GATED sin significado (tests ya
independientes del orden). Lanes intactos: solo se unifica setup y se elimina
el tag, NO se fusionan specs.
Método del proyecto: por cada cambio → openspec-propose → implementar con
openspec-apply-change → validar → commitear (conventional español) → sincronizar
specs mains y archivar con openspec-archive-change → skill nsgc-prepush antes de
cualquier push.
Reglas permanentes: dato de dominio solo vía API REST con scope `comunidadId`
(`withComunidadScope`); mocks de `data/` son solo seed; D1 media por referencia;
secretos jamás en localStorage ni código; cada cambio de esquema Prisma =
migración + tests. Terminología RG §4: "comunidad" (nunca "condominio").
Cuentas TEST (`Test1234!`, comunidad-a): 7 cuentas `*@test.cl`. Seed:
`npm run e2e:reseed-base` + `e2e:higiene -- --apply`. Comandos con
`workdir k0mp4ss_fe/apps/web`. Playwright gestiona el dev server (no levantar
manual). `next build` puede fallar por red (Google Fonts): ignóralo salvo
ventana de deploy. Si tu contexto se agota: cierra la tarea en curso + commit +
deja el estado exacto en `openspec/SERIE-E2E-SIN-GATED/00-plan.md`.

## Arranque: verificación de P1 (antes de tu alcance)

1. `git status` (tree limpio salvo backups untracked) y `git status -sb` y `git log --oneline -8`.
2. `openspec validate --all` → contrastá con el número que P1 declaró.
3. Lee `00-plan.md`: fila P1 HECHA → ejecutá receta reseed y marcá tu fila
   EN CURSO. HECHA pero algo falla → ARREGLA primero (change fix pequeño + test),
   anótalo en la Bitácora, y solo después empieza tu alcance. PARCIAL → completa
   ESE alcance antes del tuyo. Nunca marques EN CURSO si P1 no está cerrada.

## Alcance P2 — Fin del tag GATED + CI a corrida única

1. Partí de reseed limpio. Quita el tag `(GATED)` de los describes de los 4
   specs (`pagos|certificados|portal|remuneraciones`) y elimina los scripts
   `e2e:nongated` y `e2e:gated` de `package.json`; renombra `e2e:full-orden` o
   eliminalo SOLO si nada más lo usa (verificá: CI, docs, otros scripts,
   `e2e:full-orden` en openspec/series). Si algo lo referencia, dejá un alias
   documentado en vez de romper.
2. Actualiza `.github/workflows/ci.yml` (job `e2e`, SIN tocar `e2e-rate-limit`
   ni `deploy`): seed completo (`seed:authz` + `seed:mocks` como
   `e2e:reseed-base`, adaptado a CI efímero), corrida única
   `npx playwright test`, timeout 25→60 min. Verificá primero qué specs exigen
   datos mock y que el seed de CI los provee.
3. Verificación local que aproxima CI: reseed limpio + `npx playwright test`
   ÚNICO (sin fases) de punta a punta. Si hay interferencia por orden, NO
   reintroduzcas el tag: independizá el spec culpable (setup+cleanup propio,
   patrón P1) y documentalo. Objetivo: corrida única verde.
4. Change openspec `e2e-fin-gated` (propose → apply → abierto, archiva el
   cierre). Valida: corrida única + unit + tsc 0 + lint 0 + validate.
5. Commit (conventional español), sin push. Actualiza fila P2 y Bitácora con los
   números (incluido si la corrida única pasó al primer intento o qué se
   independizó).

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado (HECHA/PARCIAL + motivo). 2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes archivados. 4. Números finales: STORE_VERSION,
   e2e única x/y, unit x/y, tsc/eslint OK. 5. Desviaciones vs el prompt.
6. Pendientes fuera de la serie (decisiones del owner).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`.
