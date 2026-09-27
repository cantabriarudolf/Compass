> **Este archivo ES tu prompt.** Ventana P1 de la serie E2E-FULL-VERDE.
> Léelo completo (incluido `00-plan.md` de la serie) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie E2E-FULL-VERDE)

Estado previo: STORE_VERSION 28, vitest 82 archivos 809/809, tsc 0, lint 0 errores.
Serie VALIDACION-PERFILES en PARCIAL (commits `9429d97` + `1a08b6d`, main ahead 2
sin push): serie-scope verde (lane auth 19/19, 5 specs P2, bitácora, multas con
null-guards P3). E2e full válida (scope A) 70 pass / 23 fail / 2 skip sobre 95
tests. Series cerradas: FRONTERA, BD-FUENTE-VERDAD, UI-MIGRACION-BD, PRODUCCION (+FASE2).
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
Seed reproducible: `npm run seed:authz` + `npm run seed:mocks -- --comunidad-id=comunidad-a`.
GAP CONOCIDO (lo fijás vos en esta ventana): `seed-authz.mjs` hace upsert in place
y NO reordena membresías → restore+seed pierde scope A. Receta manual temporal:
borrar y recrear la membresía admin-a (queda última por createdAt → scope A).
Verificación por ventana: `cd k0mp4ss_fe/apps/web` y `npx tsc --noEmit` + lint
(0 errores) + suites indicadas + `openspec validate --all` (o el change tocado).
Servidor dev: `http://localhost:3000` (levantarlo si está caído con `npm run dev`).
`next build` puede fallar por red (Google Fonts): ignóralo salvo ventana de deploy.
Si tu contexto se agota: cierra la tarea en curso + commit + deja el estado exacto
en `openspec/SERIE-E2E-FULL-VERDE/00-plan.md`.

## Alcance P1 — Higiene y determinismo (infra, sin tocar módulos de P2/P3)

1. Change openspec (p. ej. `e2e-higiene-determinismo`): fix `scripts/seed-authz.mjs`
   para que el orden de membresías sea determinista y admin-a quede ÚLTIMA por
   createdAt aunque las filas ya existan (delete+create o touch createdAt;
   documentalo en el seed). Verificá: restore del backup P3 + seeds + scope admin
   = comunidad-a SIN receta manual.
2. Convención TEST-*/cleanup documentada (dónde va en repo: el change): los specs
   que crean registros los nombran `TEST-*` con timestamp y limpian lo que puedan;
   lo que no se pueda limpiar se lista como conocido.
3. Estrategia GATED: los 4 specs que usan QA-Lab "Poblar todo de una vez"
   (certificados, pagos, portal, remuneraciones) destruyen el seed. Definí e
   implementá el aislamiento (p. ej. orden fijo al final de la corrida, o flag de
   re-seed posterior, o poblar contra comunidad dedicada) y dejamelo funcionando.
4. Verificá que el restore de nombre de admin-configuracion (finally, hecho en P3)
   sigue en pie y es compatible con tu estrategia.
5. Criterio de salida: receta reseed 100% reproducible (restore + 2 seeds, sin
   pasos manuales) que deja scope A + BD lista; `npx playwright test e2e/auth`
   verde sobre ese estado; tsc/lint/validate OK.

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado (HECHA/PARCIAL + motivo). 2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes archivados. 4. Números: STORE_VERSION,
unit X/Y, e2e X/Y, tsc/eslint OK. 5. Desviaciones vs el prompt.
6. Pendientes heredados a P2.
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`.
