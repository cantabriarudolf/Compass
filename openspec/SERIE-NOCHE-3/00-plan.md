# Serie NOCHE-3 — Deuda del store: limpieza, split y cobertura

> Toda ventana DEBE leer este archivo al iniciar (bloque ARRANQUE), marcar su fila **EN CURSO**
> y actualizarla antes del push final. La Bitácora es el registro durable de la serie.
> **Esta serie corre sin el owner**: en modo delegado el chat orquestador lanza una ventana a la
> vez (subagente `serie-executor`, o un chat nuevo por ventana en modo manual) y nadie participa
> hasta que termine. Ninguna ventana le pregunta nada al owner: si un gate falla dos veces, se
> marca **BLOQUEADO** con la evidencia exacta y se sigue con la próxima ventana.

| Ventana | Alcance | Estado | Commit final |
|---|---|---|---|
| P1 | `store-cleanup` — censo fino por miembro (incluye uso intra-store) + borrado de lo muerto/solo-test + tests | pendiente | — |
| P2 | `st-split-fase2` slices **IR + MT** | pendiente | — |
| P3 | `st-split-fase2` slices **AD + PI/D3** | pendiente | — |
| P4 | `st-split-fase2` slice **CO** | pendiente | — |
| P5 | `st-split-fase2` slices **GE + CV** (+ cierre de tasks del change: manual de arquitectura + avance) | pendiente | — |
| P6 | `api-cobertura-fases` fase 1 — rutas API más bajas + subir el piso `app/api/**` | pendiente | — |
| P7 | `api-cobertura-fases` fase 2 — resto de rutas bajas + subir el piso otra vez | pendiente | — |
| P8 | `store-cobertura-fase-b` — cobertura de `lib/store/**` (slices) + subir los pisos `lib/**` y global | pendiente | — |
| P9 | Cierre de la serie: cobertura pendiente, gates completos, auditoría integral, PR draft, deuda restante | pendiente | — |

**MÁXIMO: 9 ventanas.** Prohibido abrir ventanas fuera del cap: si algo no cabe, se declara como
deuda post-serie en P9 (replanteo con el owner), no se improvisa.

## Cómo se corre y cómo se reanuda
- **Modo manual** (chat nuevo por ventana): `Corré el archivo openspec/SERIE-NOCHE-3/prompt-01.md`
  y luego 02 → 09 en orden estricto.
- **Modo delegado (sin owner)**: en un chat orquestador, decir *"corré la serie noche-3"*: el
  orquestador lanza **una ventana a la vez** (nunca en paralelo) con el subagente
  `serie-executor`, audita cada retorno contra el repo y sigue con la siguiente.
- **Reanudación**: basta con decir "ya terminó prompt N". El estado se lee del repo
  (`00-plan.md` + `git log`), nunca de texto pegado de otro chat.

## Reglas duras de la serie (válidas en TODAS las ventanas)
1. **Rama de trabajo `noche/serie-noche-3`**, creada desde `main` (`846e3e4`) por el orquestador
   al materializar la serie. **Prohibido pushear a `main`; prohibido mergear.** El PR #1
   (`noche/serie-noche-2`, draft, CI verde) es del ciclo anterior: **no se toca**.
2. **Un commit por work-unit**, estilo convencional en español, automático al cerrar cada trabajo,
   commiteando **solo** los archivos del cambio (la suciedad ajena queda fuera).
3. **Método openspec**: todo cambio de código/spec va por `propose → apply → archive`.
   Para cada delta: leer `openspec/CONVENCION-DELTAS.md` y correr
   `node openspec/scripts/check-delta-coverage.mjs <change>` hasta que dé `0 que romperían el archive`.
4. **`nsgc-prepush` obligatorio antes de cada push** (avance en `Data/NSGC/docs/avances/`, manual
   de módulo si cambia comportamiento o estructura, Trazabilidad si cambia un estado).
5. **CI antes de archive (política de la serie)**: cada ventana pushea y **no espera** el CI; la
   ventana siguiente (bloque ARRANQUE) verifica el run anterior y, con CI verde **observada**,
   archiva lo que quedó completo. **Nunca se archiva sin CI verde observada.** El cierre (P9)
   audita todo y archiva lo pendiente con evidencia.
6. **`STORE_VERSION = 28` congelado**: ni el split ni la limpieza ni la cobertura cambian el shape
   persistido. Si algo lo exigiera, se marca **BLOQUEADO** en la tabla y se sigue (es decisión del
   owner, no se improvisa).
7. **Nunca** tocar `k0mp4ss_fe/apps/web/prisma/dev.db` ni `Data/NSGC/backups/`: las corridas e2e
   usan bases descartables `prisma/perf*.db` (cubiertas por `*.db` en `.gitignore`).
8. **Nunca secretos** en código, docs ni commits.
9. **Gate por ventana**: `cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm test` (pisos por área),
   `openspec validate --all` sin fallos, `check-delta-coverage` del change tocado y la e2e dirigida
   de la ventana con paridad CI (si el alcance toca comportamiento o estructura del store).
10. **Si un gate falla dos veces**: marcar la ventana **BLOQUEADO** (tabla + Bitácora con la
    evidencia exacta), `git commit` de lo que quede sano (o revertir lo roto) y **seguir** con la
    próxima ventana. Nunca quedarse reintentando ni pedir intervención.
11. **Si el contexto se agota**: cerrar la tarea en curso, commitear, actualizar esta Bitácora con
    el estado exacto y avisar en una línea.
12. **Alcance cerrado**: cada ventana toca solo los archivos que declara su prompt.

## Base de hechos (arranque de la serie)
- Suite **993 verdes** (último conteo conocido) con pisos por área en `vitest.config.ts`:
  global **82/72/87/82** · `lib/**` **86/78/94/86** · `app/api/**` **78/63/82/78**.
  Regla del ratchet: piso = **medido − 1 punto**, y **nunca se baja** un piso existente.
- `lib/store.ts`: 8.889 líneas, `@deprecated` pero **vivo** (no muerto). Censo 2026-10-14 de los
  **182 miembros** de `CompassStore`: **107** usados por la app · **4** solo por el QA-Lab ·
  **21** solo por tests · **1 muerto** (`toggleActivoTipoUnidad`). Fuente: Engram obs. 205 y
  `openspec/BACKLOG-100.md`.
- `lib/store/` hoy solo tiene `helpers.ts` (Fase 1 del split, `eff32c3`). Los 7 slices hoja y su
  orden de riesgo creciente están en `openspec/changes/st-split-fase2/proposal.md`.
- Deuda de cobertura: `lib/store.ts` **1.202 statements** sin cubrir (84.21%) y superficie API
  **2.114 statements** (79.40%; las más bajas: `app/api/personas` 70.54%, `app/api/unidades`,
  `app/api/vinculos`). Fuente: `openspec/changes/archive/2026-10-12-ci-verde-ratchet-cobertura/design.md` (§Deuda).
- Node: `.nvmrc` = 24 · `engines.node` = `>=24` · local 24.21.0 →
  `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"`.
- Lane e2e: `npm run e2e:fresh` crea la base descartable, siembra e imprime el comando Playwright
  exacto con paridad CI. **Nunca** correr el spec de rate-limit antes de la lane (bloquea la IP
  15 min y aborta `auth.setup`).

## Bitácora
(cada ventana agrega su entrada ANTES del push final: `- [fecha] P<n> HECHA: resumen (commits)`)
