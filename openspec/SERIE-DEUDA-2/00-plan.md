# Serie Deuda 2 — Saldar la deuda viva post-deuda-1

> Toda ventana DEBE leer este archivo al iniciar (bloque ARRANQUE), marcar su fila **EN CURSO** y
> actualizarla antes de cerrar. La Bitácora es el registro durable de la serie.
> **Modo de ejecución**: delegado con workers desde el chat orquestador (`serie-executor`), una
> ventana a la vez, con auditoría contra el repo al volver cada una. El orquestador hace los pushes,
> los archives y la observación del CI.

| Ventana | Alcance | Estado | Commit final |
|---|---|---|---|
| D1 | `test-db-descartable` — la suite deja de escribir `prisma/dev.db` (base descartable + guarda dura) | pendiente | — |
| D2 | `am-emisores-1` — emisores server-side de `CF_UPDATE_PARAM`, `FI_INGRESO_REGISTRADO` y `GD_PERIODO_REGISTRADO` | pendiente | — |
| D3 | `am-emisores-2` — emisores de `IR_ASSET_REPAIR`, `CO_DOC_DOWNLOAD` y `PE_CIERRE_EDITADO` | pendiente | — |
| D4 | `store-cobertura-fase-d` — las 6 acciones más descubiertas de `lib/store.ts` (~57 statements) | pendiente | — |
| D5 | `store-cobertura-fase-e` — remanente del store + ratchet final de `lib/**` y global | pendiente | — |
| D6 | `lint-higiene` — bajar los ~6.700 warnings de ESLint (zona generada, producto y tests) | pendiente | — |
| D7 | Cierre de la serie: auditoría integral, e2e final, PR y deuda post-serie | pendiente | — |

**MÁXIMO: 7 ventanas.** Prohibido abrir ventanas fuera del cap: lo que no entre se declara como
deuda post-serie en el cierre (D7), no se improvisa.

## Prerrequisito de base

- **Tip de partida**: `afe142a`, el cierre de SERIE-DEUDA-1, que está **apilado** sobre
  `noche/serie-noche-3` (`1b23219`). Mientras el PR #2 (noche-3) siga sin mergear, el diff de esta
  rama contra `main` incluirá también aquellos commits (ruido de diff, no bloqueo).
- **Rama de trabajo: `serie/deuda-1`** — decisión del orquestador: esta serie **continúa la rama de
  deuda-1** en vez de abrir una cuarta capa apilada, así el **PR draft #3** sigue siendo el paraguas
  de todo el pago de deuda y el CI ya está cableado (el workflow `ci.yml` dispara en `pull_request`).
  El owner puede pedir una rama propia si prefiere separar los PRs.
- **Fingerprint** (lo verifica el ARRANQUE de cada ventana): pisos global **92/83/92/92** · `lib/**`
  **97/91/98/97** · `app/api/**` **87/74/88/87** en `vitest.config.ts`, **7 slices** en
  `lib/store/slices/`, `STORE_VERSION = 28` y suite **≥ 1208** tests (116 archivos).

## Reglas duras de la serie

1. **Rama `serie/deuda-1`**. Prohibido pushear a `main`; prohibido mergear (es decisión del owner).
2. **Un commit por work-unit**, estilo convencional en español, automático al cerrar cada trabajo,
   commiteando **solo** los archivos del cambio. **Commitear por unidad, no al final**: los
   ejecutores de la serie anterior murieron a los 12/30/51/82/90 turnos y solo sobrevivió el trabajo
   ya commiteado.
3. **Método openspec**: todo cambio va por `propose → apply → archive`. Para cada delta: leer
   `openspec/CONVENCION-DELTAS.md` y correr `node openspec/scripts/check-delta-coverage.mjs <change>`
   hasta que dé `0 que romperían el archive`.
4. **`nsgc-prepush` obligatorio antes de cada push** (avance en `Data/NSGC/docs/avances/`; manual de
   módulo si cambia comportamiento o estructura; Trazabilidad si cambia un estado).
5. **El orquestador pushea, archiva y observa el CI.** Los workers **nunca** corren `git push` ni
   `gh pr edit`: el harness les pide aprobación interactiva que no pueden contestar (así se colgaron
   30 minutos dos ejecutores de la serie anterior). Cierran con todo commiteado y reportan.
   **Nunca se archiva sin CI verde observada.**
6. **`STORE_VERSION = 28` congelado**: ningún cambio de la serie toca el shape persistido. Si algo lo
   exigiera, se marca BLOQUEADO en la tabla y se sigue.
7. **Nunca** tocar `k0mp4ss_fe/apps/web/prisma/dev.db` ni `Data/NSGC/backups/`. **D1 existe
   justamente porque hoy la suite sí escribe `dev.db`**: hasta que D1 cierre, correr `npm test` es
   un riesgo asumido y conocido.
8. **Nunca secretos** en código, docs ni commits. El término oficial es **comunidad** ("condominio"
   no se usa nunca, RG §4).
9. **Gate por ventana**: `cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint && npm test`
   (pisos por área), `openspec validate --all` sin fallos y `check-delta-coverage` del change tocado.
   La suite completa se corre **una sola vez**, como gate al final de la ventana.
10. **Si un gate falla dos veces**: marcar la ventana BLOQUEADO (tabla + Bitácora con la evidencia
    exacta), commitear lo que quede sano (o revertir lo roto) y **seguir**. Nunca quedarse
    reintentando ni pedir intervención al owner.
11. **Alcance cerrado**: cada ventana toca solo los archivos que declara su prompt.
12. **Nunca correr el spec de rate-limit antes de la lane e2e** (bloquea la IP 15 min y aborta
    `auth.setup`).

## Modo de ejecución (delegado con workers)

El orquestador lanza **una ventana a la vez** con el subagente `serie-executor`:
*"Ejecutá de principio a fin `openspec/SERIE-DEUDA-2/prompt-NN.md` y devolvé el Reporte Final
Estandarizado"*, con el ARRANQUE pre-resuelto (git, fingerprint, CI, archives) para que el worker no
gaste turnos ahí. Al volver cada ventana el orquestador **audita contra el repo** (no contra el
reporte): `git log`/`git status`, la fila y la Bitácora del plan, y los gates de la ventana. Si
falta algo menor, relanza la MISMA ventana con la corrección puntual; si el worker murió a mitad,
verifica el estado parcial y completa lo que falte.

## Base de hechos (deuda declarada al cerrar deuda-1)

- **Cobertura**: 111 statements sin cubrir en `lib/store.ts` (P5 cubrió 57 de 168). Reparto al
  cierre: `generarCertificadoCT` 15 · `distribuirReporteRE` 13 · `respaldarInfraccionIN` 8 ·
  `desestimarInfraccionIN` 8 · `saveElementoRA` 7 · `saveAdelantoPL` 6 · ramas de arranque de
  `migrate` (4940-4941, 5127) · ramas sueltas de 14 acciones más. Detalle en
  `Data/NSGC/docs/avances/avance - 2026-10-17 16-05.md` § "Remanente declarado".
- **Eventos AM sin emisor server-side**: `CF_UPDATE_PARAM` (la ruta existe y no emite) y cinco
  eventos con **0 referencias en el código** — `FI_INGRESO_REGISTRADO`, `IR_ASSET_REPAIR`,
  `CO_DOC_DOWNLOAD`, `GD_PERIODO_REGISTRADO`, `PE_CIERRE_EDITADO`. El proyecto **sí tiene el
  patrón**: 13 rutas crean `prisma.eventoAuditoria` a mano (ejemplo canónico:
  `app/api/fondos-fi/[id]/retirar/route.ts`). Decisión del owner: **implementar los 6**.
- **Riesgo de datos en tests**: `k0mp4ss_fe/apps/web/test/setup.ts` cae a `prisma/dev.db` cuando
  `DATABASE_URL` no está exportada, así que **la suite entera escribe la base de desarrollo**.
- **Lint**: ~6.700 warnings con `exit 0` (`@typescript-eslint/no-explicit-any` en tests y en
  artefactos generados). Decisión del owner: incluirlos como ventana propia (D6).
- **Fuera de alcance**: el merge de los PR (#3 deuda-1 y #2 noche-3) es decisión del owner; el "404
  de MT" de P2 quedó demostrado inexistente (el guard de scope es correcto y tiene red de seguridad
  en `test/api/put-merge-scope.test.ts`).

## Bitácora
(cada ventana agrega su entrada ANTES de que el orquestador pushee: `- [fecha] D<n> HECHA: resumen (commits)`)
