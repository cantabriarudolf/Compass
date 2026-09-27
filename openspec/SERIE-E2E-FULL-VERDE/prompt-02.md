> **Este archivo ES tu prompt.** Ventana P2 de la serie E2E-FULL-VERDE.
> Léelo completo (incluido `00-plan.md` de la serie) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie E2E-FULL-VERDE)

Estado previo: STORE_VERSION 28, vitest 82 archivos 809/809, tsc 0, lint 0 errores.
Serie VALIDACION-PERFILES en PARCIAL (serie-scope verde: lane auth 19/19, 5 specs
P2, bitácora, multas). E2e full 70 pass / 23 fail / 2 skip sobre 95 tests.
P1 de esta serie dejó receta reseed 100% reproducible (restore + 2 seeds, scope A
sin pasos manuales) + estrategia GATED. Series cerradas: FRONTERA,
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
Verificación por ventana: `cd k0mp4ss_fe/apps/web` y `npx tsc --noEmit` + lint
(0 errores) + suites indicadas + `openspec validate` del change tocado.
`next build` puede fallar por red (Google Fonts): ignóralo salvo ventana de deploy.
Si tu contexto se agota: cierra la tarea en curso + commit + deja el estado exacto
en `openspec/SERIE-E2E-FULL-VERDE/00-plan.md`.

## Arranque: verificación de P1 (antes de tu alcance)

1. `git status` (tree limpio) y `git status -sb` (sin ahead: todo pusheado) y `git log --oneline -8`.
2. `openspec validate --all` → contrastá con el número que P1 declaró (nuevos
   drafts propios son esperables; drafts viejos heredados no te pertenecen).
3. Lee `00-plan.md`: fila P1 HECHA y receta reseed funcionando → ejecutá la receta
   (restore + seeds) y marcá tu fila EN CURSO.
   HECHA pero algo falla → ARREGLA primero (change fix pequeño + test), anótalo en
   la Bitácora, y solo después empieza tu alcance. PARCIAL → completa ESE alcance
   antes del tuyo. Nunca marques EN CURSO si P1 no está cerrada.

## Alcance P2 — Rojos CRUD (no tocar flujo/a11y/smoke: son de P3)

Partí de reseed limpio P1. Por cada spec rojo, triage (causa P3 sugerida entre
paréntesis, verificar no asumir) + fix pequeño con test + delta en tu change:
1. admin-configuracion: el form muestra default del mock en vez del valor BD y no
   persiste (ver `data/admin/configuracion.ts` vs API scope A).
2. permisos: selector de comunidad (opción /Los Aromos/ vs nombre BD real) +
   conteo 6 membresías (ya actualizado en P3, verificar en verde).
3. tipos, personal, proyectos, reservas: dialogs que no cierran (mirar error de
   validación/FK contra datos del seed).
4. gestion, logs, reporteria, punto-cero (saldo CC=0 sensible a movimientos
   extra), roles-journeys (flaky timing de combos).
5. GATED con tu estrategia P1: certificados, pagos, portal, remuneraciones.
Criterio de salida: lane `e2e/crud` completa en verde sobre reseed limpio (una
sola corrida) + tsc/lint/validate OK. Si un rojo resulta bug grande de módulo,
NO lo agrandes: dejalo PARCIAL con nombre y apellido para P4/owner y seguí con
el resto.

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado (HECHA/PARCIAL + motivo). 2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes archivados. 4. Números: STORE_VERSION,
unit X/Y, e2e X/Y, tsc/eslint OK. 5. Desviaciones vs el prompt.
6. Pendientes heredados a P3.
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`.
