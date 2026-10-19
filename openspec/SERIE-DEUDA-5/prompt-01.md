> **Este archivo ES tu prompt.** Ventana G1 de la serie deuda-5.
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

## Alcance de G1 — `noche-2-conflictos`: integrar `main` en `noche/serie-noche-2`

Contexto: el PR #1 pasó a **`CONFLICTING`** porque `main` avanzó con las series de deuda y ambos lados
tocan los mismos archivos. Hay que **traer `main` a la rama** (`noche/serie-noche-2`) y resolver los
conflictos, no al revés.

**Procedimiento**:
1. `git switch noche/serie-noche-2` (existe local y remoto; partí de su tip `733a911`).
2. `git merge origin/main` (sin `--no-ff`: es la actualización de rama estándar) y listá los conflictos con `git status`.
3. Resolvé **cada conflicto preservando la intención de los dos lados**. Rubric obligatoria por archivo:
   - **`.github/workflows/ci.yml`**: de `main` conservá `DATABASE_URL: file:./perf-test.db` en los tres jobs (política de base descartable, E4); de noche-2 conservá sus pasos/ajustes propios. Resultado: los dos efectos juntos. **No** reintroduzcas `file:./dev.db`.
   - **`e2e/crud/poblado-idempotente.spec.ts`**: de `main` conservá la espera de purga de **120 s** (P1) y de noche-2 su higiene e2e; si noche-2 cambió el mismo timeout, el valor final debe ser **120 s o mayor**, nunca 30 s.
   - **`openspec/BACKLOG-100.md`**: **unión** de filas — las de main (incluidas las que retiran deuda ya pagada) más las que agrega noche-2. Sin duplicar y sin borrar filas ajenas.
   - **`openspec/specs/*/spec.md`** (`DEV-qa-lab`, `PE-personal-servicios`, `ST-capa-datos-persistente`, `AU-autenticacion-sesion`, `EF-estructura-fisica`, `LAB-mejoras` y las que aparezcan): **unión de contenido**, pero con una condición dura: **no puede reaparecer el nombre de ninguna de las 28 acciones podadas** que P6 limpió. Verificalo al final con:
     ```bash
     for a in archivarAvisoCV cambiarEstadoRecursoIR cancelarTrabajoMT comentarInfraccionIN confirmarLiquidacionPL editarCierreTurnoPE generarLiquidacionPL marcarNotificacionLeida registrarDescargaDocCO registrarIngresoFI removeAvisoCV removeCierreTurnoPE removeEgresoFI removeElementoRA removeFondoFI removeIngresoFI removeLiquidacionPL removeMantencionPE removePlantillaCV removeProveedorPE removeProyectoMT removeReporteRE saveConfiguracion saveLeadPortal savePeriodoDirectiva savePlantillaCV savePublicacionPortal toggleActivoTipoUnidad; do
       grep -rl "$a" openspec/specs/ 2>/dev/null && echo "REAPARECIÓ: $a"
     done
     ```
     Salida esperada: **nada**. Si algo reaparece, aplicale la misma corrección de prosa que P6 (describir la ruta REST actual, sin notas históricas en el cuerpo).
   - Cualquier otro archivo en conflicto: criterio general, **unión con ambos efectos**; si son incompatibles de verdad, elegí lo de `main` para lo que sea política ya decidida (base descartable, pisos, limpieza de prosa) y lo de noche-2 para su funcionalidad propia, y **declaralo** en el reporte.
4. Si un conflicto es semántico y no podés decidir con seguridad: **no inventes**. `git merge --abort`, dejá el árbol **limpio** y reportá BLOQUEADO con el detalle exacto (archivo + las dos versiones). Un árbol a medio mergear es peor que una ventana bloqueada.
5. Verificá los changes de noche-2: sus 7 changes propios deben quedar consistentes; corré
   `openspec validate --all` y `node openspec/scripts/check-delta-coverage.mjs` sobre los que sigan activos.
6. Gates: `cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint && npm test` (pisos vigentes:
   global 93/84/92/93 · `lib/**` 98/93/98/98 · `app/api/**` 87/74/88/87) · `npx eslint` de
   `packages/ui` en 0 · `openspec validate --all` sin fallos.
7. Escribí el avance NSGC (conflictos resueltos, criterio aplicado por archivo, evidencia de la
   verificación de acciones podadas) y marcá la fila **G1 HECHA** + Bitácora en
   `openspec/SERIE-DEUDA-5/00-plan.md`.
8. **Commit del merge** (el merge en sí) + commit documental. **NO pushees.**

**Gate**: merge completo sin marcadores (`grep -rn "^<<<<<<<" . --include="*.md" --include="*.ts" --include="*.yml"` → 0) · `tsc` 0 · `lint` 0 problemas (app y ui) · `npm test` verde con los pisos · `openspec validate --all` sin fallos · `check-delta-coverage` ok · verificación de acciones podadas en specs = 0 apariciones.

**Archivos que podés tocar**: los que el merge ponga en conflicto, `openspec/SERIE-DEUDA-5/00-plan.md`,
`Data/NSGC/docs/avances/**`.

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado (HECHA / PARCIAL / BLOQUEADO + motivo).
2. Commits (hash + subject) y confirmación de que **NO** pusheaste.
3. Cambios en specs/changes.
4. Números: tests X/Y, tsc/eslint, y las métricas propias.
5. Desviaciones y decisiones de criterio (especialmente en la resolución de conflictos).
6. Pendientes heredados.
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`
