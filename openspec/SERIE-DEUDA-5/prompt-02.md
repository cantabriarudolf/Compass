> **Este archivo ES tu prompt.** Ventana G2 de la serie deuda-5.
> Léelo completo (incluido `openspec/SERIE-DEUDA-5/00-plan.md`) y ejecutá sus bloques en orden.

## Contexto común (válido para TODA la serie deuda-5)

Compass: Next 16 + TypeScript + Prisma, monorepo `k0mp4ss_fe/`. Dos líneas de trabajo conviven:

- **`main`** (`e15d7bd`): tiene las cuatro series de deuda cerradas (27 ventanas) — limpieza de prosa
  de specs (P6: se quitaron los nombres de las 28 acciones podadas), `ci.yml` con
  `DATABASE_URL: file:./perf-test.db` (E4), `poblado-idempotente.spec.ts` con espera de purga de
  **120 s** (P1), guarda absoluta contra `prisma/dev.db` (D1), cobertura y pisos al alza, lint en 0.
- **`noche/serie-noche-2`** (46 commits): trabajo **no integrado** de la serie noche-2 — purga bulk del
  QA-Lab, higiene e2e, `prisma generate` en `e2e:fresh`, `au-google-provider-disabled`, y 7 changes
  openspec propios (varios ya archivados en esa rama).

Node: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"`. La suite usa la base descartable
`prisma/perf-test.db`.

Método: change openspec cuando corresponda; `node openspec/scripts/check-delta-coverage.mjs <change>`
hasta `0 que romperían el archive`; commits convencionales en español, uno por work-unit; skill
`nsgc-prepush` antes de cada push. Reglas duras: `STORE_VERSION = 28` congelado; **nunca** tocar
`prisma/dev.db` ni `Data/NSGC/backups/`; nunca secretos; el término oficial es **comunidad**
("condominio" nunca, RG §4); no le pidas confirmaciones al owner (gate falla dos veces → BLOQUEADO con
evidencia exacta y seguir).

**NO corras `git push` ni `gh` que escriba**: el orquestador pushea, mergea y observa el CI. Commiteá
por unidad. Sé económico en turnos (corridas largas con `nohup … > /tmp/serie-deuda5-<n>-<nombre>.log
2>&1 &` + PID, esperando en bloques de 2-5 min; **nunca** bloquees un bash más de ~10 min). La suite
completa, una sola vez al final. **Nunca** corras el spec de rate-limit antes de la lane e2e.

## Arranque: verificación de la ventana anterior

1. `git status` limpio y `git status -sb` sin "ahead" en la rama actual + `git log --oneline -8`.
2. Fingerprint: pisos global 93/84/92/93 · `lib/**` 98/93/98/98 · `app/api/**` 87/74/88/87, 7 slices,
   `STORE_VERSION = 28`, suite ≥ 1309, `npx eslint` 0 problemas. Si falta, pará y reportá.
3. **CI, push y merge los maneja el orquestador**: no poll-ees `gh`, no pushees, no mergees.
4. `openspec validate --all` sin fallos.
5. Contrastá con `openspec/SERIE-DEUDA-5/00-plan.md`: fila anterior `HECHA` → marcá la tuya `EN CURSO`.

## Alcance de G2 — `higiene-final`: changes activos huérfanos y cierre

Contexto: quedan **4 changes openspec activos** que son del owner y anteriores a toda esta serie de
trabajo: `a11y-p3-reservas-recursos`, `au-google-sso`, `e2e-higiene-determinismo` y
`e2e-rojos-flujo-a11y-smoke`. Dos son de e2e y **pueden haber quedado obsoletos** por lo que se
arregló en las series de deuda (tooling `e2e:fresh`, timeouts de `poblado-idempotente` y `proyectos`,
guarda de base, alineación de `ci.yml`).

**Tareas**:
1. **Auditá cada uno de los 4**: leé su `proposal.md`/`tasks.md`, mirá su estado real contra el código
   actual, y clasificalo en una de tres:
   - **OBSOLETO**: su problema ya no existe (lo resolvió la serie de deuda). Candidato a archivar.
   - **VIVO**: sigue habiendo trabajo pendiente real. Se deja como está (es del owner).
   - **PARCIAL**: parte resuelta y parte pendiente. Se deja, documentando qué falta.
2. **No archives nada vos** y **no modifiques el alcance de esos changes** (son del owner): el
   resultado es un **informe** con la clasificación y la evidencia (archivo:línea o commit que lo
   demuestra).
3. Para los OBSOLETOS, dejá en el avance la **recomendación de archivarlos** con el fundamento y el
   comando exacto (`openspec archive <change> --yes`) para que el orquestador lo ejecute.
4. Gates finales de la serie: `tsc` 0 · `lint` 0 problemas (app y ui) · `npm test` verde con los
   pisos · `openspec validate --all` sin fallos.
5. **Cierre documental**: sección **"Cierre de la serie deuda-5"** en `openspec/SERIE-DEUDA-5/00-plan.md`
   (estado por ventana, números, y el **informe de los 4 changes**); avance NSGC de cierre;
   `mem_save` en Engram (tipo `decision`, `topic_key: compass/serie-deuda-5`). Fila **G2 HECHA**.

**Deuda post-serie a declarar**: el techo del **99.95 %** de cobertura del store por API pública
(2 ramas defensivas por diseño) — si sigue siendo lo único que queda, decilo explícitamente.

**Gate**: `tsc` 0 · `lint` 0 · `npm test` verde con los pisos · `openspec validate --all` sin fallos ·
el informe de los 4 changes con evidencia.

**Archivos que podés tocar**: `openspec/SERIE-DEUDA-5/00-plan.md`, `Data/NSGC/docs/avances/**`.
**No** toques los changes activos del owner ni `openspec/specs/**`.

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado (HECHA / PARCIAL / BLOQUEADO + motivo).
2. Commits (hash + subject) y confirmación de que **NO** pusheaste.
3. Cambios en specs/changes.
4. Números: tests X/Y, tsc/eslint, y las métricas propias.
5. Desviaciones y decisiones de criterio (especialmente en la resolución de conflictos).
6. Pendientes heredados.
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`
