> **Este archivo ES tu prompt.** Ventana P4 de la serie noche-2.
> Leélo completo (incluido `openspec/SERIE-NOCHE-2/00-plan.md`) y ejecutá sus bloques en orden.
> Modo noche: **no pidas confirmaciones al owner**. Si un gate falla dos veces, marcá la ventana
> BLOQUEADO en la tabla del plan con la evidencia y seguí.

## Contexto común (válido para TODA la serie noche-2)
Proyecto Compass: Next 16 + TypeScript estricto + Prisma en el monorepo `k0mp4ss_fe/` (app en
`k0mp4ss_fe/apps/web`, UI en `packages/ui`). Tests: Vitest (`test/`, 967 verdes con pisos de
cobertura por área) + Playwright (`e2e/`). Estado de partida: CI verde completo en el run
`38330292787` (HEAD `ba40be2`); changes `qlab-poblamiento-api-rest` y `ci-verde-ratchet-cobertura`
archivados; deuda viva en `openspec/BACKLOG-100.md` y en el avance
`Data/NSGC/docs/avances/avance - 2026-10-12 14-15.md`.
Node: `.nvmrc` = 24, `engines.node` = `>=24`, local 24.21.0 →
`export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"`.
Reglas permanentes del proyecto: toda feature/fix → change openspec (propose → apply → archive);
terminología RG §4 (el término oficial es **comunidad**, "condominio" no se usa nunca); commits
convencionales en español, automáticos al cerrar cada trabajo, commiteando solo los archivos del
cambio; skill `nsgc-prepush` obligatoria antes de cualquier push; nunca tocar
`prisma/dev.db` ni `Data/NSGC/backups/`; nunca secretos en código ni docs.
Verificación por ventana: `cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm test` +
`openspec validate --all` + `node openspec/scripts/check-delta-coverage.mjs`.
Regla de la lane e2e: base fresca y **nunca** correr el spec de rate-limit antes de la lane.
**Antes de archivar cualquier change**: leer `openspec/CONVENCION-DELTAS.md` y correr
`node openspec/scripts/check-delta-coverage.mjs <change>` (el `validate`, incluso `--strict`, NO
detecta los errores que rompen el archive).

## Arranque (verificación de la ventana anterior)
1. `git status` (tree limpio), `git status -sb` (sin "ahead") y `git log --oneline -8`.
2. `openspec validate --all` → sin fallos.
3. `cd k0mp4ss_fe/apps/web && npm test` → suite verde.
4. Contrastá con `00-plan.md`: si P3 quedó PARCIAL o BLOQUEADO, completala antes (derivá de
   `prompt-03.md`, autocontenido). Nunca marques EN CURSO si lo anterior no está cerrado.

## Alcance de P4 — triage de los changes activos viejos (sin código de producto)
Hoy quedan 6 changes activos que nadie está trabajando. Esta ventana decide, con evidencia, el
estado de cada uno:

| Change | Qué se espera decidir |
|---|---|
| `a11y-p3-reservas-recursos` | ¿Está implementado (commits + specs aplicadas)? → archivar o dejar activo con motivo |
| `au-google-sso` | ¿Bloqueado por credenciales del owner? → dejar activo con estado explícito |
| `e2e-higiene-determinismo` | ¿Implementado? → archivar o dejar activo con motivo |
| `e2e-rojos-flujo-a11y-smoke` | ¿Implementado? → archivar o dejar activo con motivo |
| `fix-vercel-data-ignore` | ¿Implementado (verificar `.vercelignore`)? → archivar o dejar activo con motivo |
| `st-split-fase2` | ¿Parcial? → dejar activo con el alcance que falta escrito |

**Método por change** (no inventes estados):
1. Leer `proposal.md`, `tasks.md` y (si existe) `design.md` + `.openspec.yaml`.
2. Buscar la implementación en el repo: `git log --oneline --all | grep -i <slug>` y los archivos
   que el change declara; grep en `openspec/specs/` por los requirements que el delta agrega
   (si ya están en la spec main, el change ya se aplicó y quedó sin archivar).
3. Decidir **una** de tres:
   - **Archivar** (implementado y sin deltas pendientes): `check-delta-coverage <change>` ok →
     `openspec archive <change> --yes` → commit `docs(openspec): archiva <change> (<motivo>)`.
   - **Dejar activo con estado explícito**: agregar al final de su `tasks.md` una línea
     `> Estado 2026-10-13 (NOCHE-2 P4): <qué falta, por qué sigue activo>` y una fila en
     `openspec/BACKLOG-100.md`. No lo archives ni lo borres.
   - **Descartar** (ya no aplica): documentar el motivo en la Bitácora y en BACKLOG (sin borrar
     archivos del change).
4. Ningún change se archiva si `check-delta-coverage` reporta que rompería el archive: en ese caso
   queda activo con la nota del punto anterior y el problema anotado con el output exacto.

**Gate de la ventana**:
- `openspec validate --all` sin fallos y `node openspec/scripts/check-delta-coverage.mjs` global
  sin "romperían el archive".
- `cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm test` verde (esta ventana no toca código:
  el gate queda por higiene de la rama).

## Cierre de la ventana
- `nsgc-prepush`: avance de la serie con la **tabla de decisión** (change → estado → evidencia)
  + nota en `Data/NSGC/docs/manuales/03 - Mapa de Desarrollo y Trazabilidad.md` solo si un estado
  de módulo cambia.
- Commits por change archivado (o uno solo si son varios del mismo tipo) y push de la rama.
- Actualizar la fila P4 del plan a `HECHA` + Bitácora, y commitear ese cambio.

## Reporte final estandarizado (OBLIGATORIO)
1. Ventana y estado. 2. Commits (hash + subject) y push sí/no. 3. Tabla: change → decisión →
   evidencia (commits/archivos/líneas de spec) → archivado sí/no. 4. Números: changes activos
   antes/después, `validate` 41/41 o el número real, tests X/Y. 5. Desviaciones vs este prompt.
6. Pendientes heredados. 7. Última línea exacta:
`BITACORA_ENTRY: <resumen 2-3 líneas>`
