> **Este archivo ES tu prompt.** Ventana P3 de la serie E2E-FULL-VERDE.
> Léelo completo (incluido `00-plan.md` de la serie) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie E2E-FULL-VERDE)

Estado previo: STORE_VERSION 28, vitest 82 archivos 809/809, tsc 0, lint 0 errores.
Serie VALIDACION-PERFILES en PARCIAL (serie-scope verde). P1 dejó reseed
reproducible + estrategia GATED; P2 dejó lane `e2e/crud` verde. Series cerradas:
FRONTERA, BD-FUENTE-VERDAD, UI-MIGRACION-BD, PRODUCCION (+FASE2).
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
Verificación por ventana: `cd k0mp4ss_fe/apps/web` y `npx tsc --noEmit` + lint
(0 errores) + suites indicadas + `openspec validate` del change tocado.
`next build` puede fallar por red (Google Fonts): ignóralo salvo ventana de deploy.
Si tu contexto se agota: cierra la tarea en curso + commit + deja el estado exacto
en `openspec/SERIE-E2E-FULL-VERDE/00-plan.md`.

## Arranque: verificación de P2 (antes de tu alcance)

1. `git status` (tree limpio) y `git status -sb` (sin ahead: todo pusheado) y `git log --oneline -8`.
2. `openspec validate --all` → contrastá con el número que P2 declaró.
3. Lee `00-plan.md`: fila P2 HECHA → ejecutá receta reseed P1, corrí lane
   `e2e/crud` para confirmar que sigue verde, y marcá tu fila EN CURSO.
   HECHA pero algo falla → ARREGLA primero (change fix pequeño + test), anótalo en
   la Bitácora, y solo después empieza tu alcance. PARCIAL → completa ESE alcance
   antes del tuyo. Nunca marques EN CURSO si P2 no está cerrada.

## Alcance P3 — Rojos flujo/a11y/smoke (no retrabajar CRUD: es de P2)

Partí de reseed limpio P1. Fails pendientes (full run scope A 2026-09-27):
1. `e2e/flujo/poblamiento` ×2 (persona semilla del relato en MP, depto 999 en EF):
   el relato asume estado que el seed/QA-Lab cambian. Alineá relato vs seed o
   independizá el spec (datos propios TEST-*).
2. `e2e/flujo/personas` (crear persona desde directorio): mismo triage
   estado-dependencia vs bug real.
3. `e2e/a11y/axe` ×2 (reservas, bitácora): re-chequear tras null-guards P3 de
   VALIDACION-PERFILES; si quedan violaciones críticas/serias reales, fix
   mínimo de a11y en el componente.
4. `e2e/smoke/modulos-mobile` (bitácora 390×844): mismo re-chequeo post-fix.
Criterio de salida: lanes `e2e/flujo` + `e2e/a11y` + `e2e/smoke` en verde sobre
reseed limpio (una sola corrida por lane) + tsc/lint/validate OK.

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado (HECHA/PARCIAL + motivo). 2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes archivados. 4. Números: STORE_VERSION,
unit X/Y, e2e X/Y, tsc/eslint OK. 5. Desviaciones vs el prompt.
6. Pendientes heredados a P4.
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`.
