# Serie Rojos-CRUD — Plan y Estado Canónico

> Toda ventana DEBE leer este archivo al iniciar (bloque ARRANQUE en P2),
> marcar su fila EN CURSO y actualizarla antes del push final. La Bitácora es
> el registro durable. La verdad es el repo, no los chats.

| Ventana | Alcance | Estado | Commit final |
| --- | --- | --- | --- |
| P1 | Revisar 5 deltas vs código y remapear carpetas: TU-tipos-unidad (exacta), CF-configuracion→CF-configuracion-global, RE-reporteria→RE-reporteria-dashboards, MT-proyectos→MT-mantenimiento-proyectos, PE-personal→PE-personal-servicios | pendiente | — |
| P2 | Revisar 3 deltas (AD-gestion→AD-gestion-administrativa, FI-espejo→FI-finanzas-morosidad, MP-personas→MP-maestro-personas) + eliminar delta muerto GATED-qa-lab + `openspec archive e2e-rojos-crud` + validar + commit | pendiente | — |

MÁXIMO: 2 ventanas. Post-serie (fuera): resto de changes abiertos (au-google-sso en pausa, e2e-higiene-determinismo, e2e-rojos-flujo-a11y-smoke, fix-vercel-data-ignore, gd-*, st-*), checklist §4 owner, super-admin global, SQLite→PostgreSQL, BACKLOG-100.

## Base de hechos (leer antes de cada ventana)

- Estado heredado E2E-SIN-GATED COMPLETA + cierres de GATED-API-BD/VALIDACION-PERFILES pusheados (`9e89617`, en sync): STORE_VERSION 28 · unit 85/835 · tsc 0 · lint 0 errores · e2e única 93+2 skip · validate 37/6 (6 sin-deltas pre-existentes de otras series).
- Change `e2e-rojos-crud` (12/12 tasks, serie E2E-FULL-VERDE P2): 9 carpetas de delta con nombres CORTOS que no matchean mains → `openspec archive` aborta. 8 son MODIFIED cuyos requirements NO existen en ningún main (verificado por grep 2026-10-05): el código shippeó pero los specs nunca se actualizaron.
- Mapeo diseñado (verificar cada delta contra el código antes de mover):
  TU-tipos-unidad→TU-tipos-unidad · CF-configuracion→CF-configuracion-global ·
  RE-reporteria→RE-reporteria-dashboards · MT-proyectos→MT-mantenimiento-proyectos ·
  PE-personal→PE-personal-servicios · AD-gestion→AD-gestion-administrativa ·
  FI-espejo→FI-finanzas-morosidad · MP-personas→MP-maestro-personas.
- Delta MUERTO: `GATED-qa-lab` ("los 4 specs GATED quedan PARCIAL") — el tag GATED ya no existe desde E2E-SIN-GATED P2. NO fusionar: eliminar la carpeta con razón documentada en el commit.
- Regla de conversión: si el requirement MODIFIED no existe en el main destino (verificar por grep), convertir el header a `## ADDED Requirements` documentando que el spec nunca lo tuvo; jamás duplicar un requirement existente (si existe, el delta se descarta por redundante con razón documentada).
- Changes abiertos al inicio (NO tocar, otras series): `au-google-sso`, `e2e-higiene-determinismo`, `e2e-rojos-flujo-a11y-smoke`, `fix-vercel-data-ignore`, `gd-ficha-gobernanza`, `gd-periodos-directiva`, `st-migracion-postgres`, `st-split-fase2` + `e2e-rojos-crud` (esta serie).
- Reglas permanentes: dato de dominio solo vía API REST con scope `comunidadId`; Terminología RG §4: "comunidad" (nunca "condominio"). Comandos con `workdir k0mp4ss_fe/apps/web`. Playwright gestiona el dev server.

## Bitácora

- [2026-10-05] Serie materializada por orquestador (2 ventanas, cap duro). Motivo: `openspec archive e2e-rojos-crud` aborta (dirs cortos + MODIFIEDs sin target + delta GATED muerto); owner eligió serie propia (opción B) en vez de remapeo ciego.
