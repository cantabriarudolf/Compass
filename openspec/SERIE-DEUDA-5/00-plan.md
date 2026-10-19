# Serie Deuda 5 — Integrar noche-2 y dejar el repositorio limpio

> Toda ventana DEBE leer este archivo al iniciar, marcar su fila **EN CURSO** y actualizarla antes de
> cerrar. **Modo**: delegado con workers desde el chat orquestador. El orquestador pushea, mergea,
> observa el CI y hace la limpieza final.

| Ventana | Alcance | Estado | Commit final |
|---|---|---|---|
| G1 | `noche-2-conflictos` — traer `main` a `noche/serie-noche-2` y resolver los conflictos preservando ambos lados | HECHA | `2561e2f` (merge) |
| G2 | `higiene-final` — auditar el change activo del owner (`au-google-sso`; tras G1 queda **1**, no 4) y cerrar la serie | HECHA | `a280c1f` (runbook) + `este commit de cierre` (cierre) |

**MÁXIMO: 2 ventanas.** Lo que no entre se declara como deuda post-serie en G2.

## Prerrequisito de base

- **Dos líneas de trabajo**:
  - **`main`** = `e15d7bd`: cuatro series de deuda cerradas (27 ventanas), CI verde observado.
  - **`noche/serie-noche-2`** = `733a911` (local y remoto): **46 commits** de trabajo **no integrado**,
    con PR #1 abierto y hoy **`CONFLICTING`** (4 conflictos) porque `main` avanzó.
- **Fingerprint de `main`**: pisos global **93/84/92/93** · `lib/**` **98/93/98/98** · `app/api/**`
  **87/74/88/87** · 7 slices · `STORE_VERSION = 28` · suite **1309** (129 archivos) · `eslint` **0
  problemas** en `apps/web` y en `packages/ui`.
- **El conflicto es de intención**, no de texto: `main` tiene las políticas ya decididas (base
  descartable en `ci.yml`, purga de 120 s en `poblado-idempotente`, prosa de specs sin las 28
  acciones podadas) y noche-2 tiene su funcionalidad propia (purga bulk QA-Lab, higiene e2e,
  `prisma generate`, `au-google-provider-disabled`). La resolución debe conservar **las dos**.

## Reglas duras

1. **G1 trabaja en la rama `noche/serie-noche-2`**; G2 y el cierre, en la rama que corresponda.
   Prohibido pushear a `main` desde un worker: el merge lo hace el orquestador con autorización del
   owner.
2. **Un commit por work-unit**, en español, commiteando solo los archivos del cambio.
3. **Método openspec** + `check-delta-coverage` en 0 para cada change tocado.
4. **`nsgc-prepush`** antes de cada push (avance en `Data/NSGC/docs/avances/`).
5. **El orquestador pushea, mergea, observa el CI y limpia.** Los workers **nunca** corren `git push`
   ni `gh` que escriba.
6. **`STORE_VERSION = 28` congelado**; **nunca** tocar `prisma/dev.db` ni `Data/NSGC/backups/`.
7. **Nunca secretos**; el término oficial es **comunidad** (RG §4).
8. **Gate por ventana**: `tsc` 0 · `lint` 0 problemas (app y `packages/ui`) · `npm test` verde con los
   pisos · `openspec validate --all` sin fallos · `check-delta-coverage` ok.
9. **Gate falla dos veces** → BLOQUEADO con evidencia exacta, commit de lo sano (o `git merge --abort`
   si es un merge a medias) y seguir.
10. **Nunca el spec de rate-limit antes de la lane e2e** (bloquea la IP 15 min).

## Base de hechos (lo que queda por saldar)

- **PR #1 (`noche/serie-noche-2`)**: 46 commits, 95 archivos (+3.572/−444), hoy `CONFLICTING`. Los
  archivos en conflicto son exactamente los puntos donde ambas líneas se tocan:
  `.github/workflows/ci.yml`, `e2e/crud/poblado-idempotente.spec.ts`, `openspec/BACKLOG-100.md`,
  `openspec/specs/DEV-qa-lab/spec.md`, `openspec/specs/PE-personal-servicios/spec.md`,
  `openspec/specs/ST-capa-datos-persistente/spec.md` y las specs de AU/EF/LAB.
- **4 changes activos del owner** (anteriores a esta serie): `a11y-p3-reservas-recursos`,
  `au-google-sso`, `e2e-higiene-determinismo`, `e2e-rojos-flujo-a11y-smoke`. Los dos de e2e **pueden
  haber quedado obsoletos** con lo que se arregló en las series de deuda; G2 los audita y recomienda,
  **sin tocarlos**.
- **Backups viejos de `dev.db`** en `prisma/` (7 archivos, ~38 MB, del 20-Sep y 5-Oct). **Ningún
  script los referencia** (verificado): son snapshots manuales. La limpieza la hace el orquestador.
- **Deuda que NO se paga (decisión de diseño)**: el techo de **99.95 %** de cobertura del store por
  API pública (`lib/store.ts:4323` y `:5131`), documentado en deuda-2 y deuda-3.

## Bitácora
(cada ventana agrega su entrada ANTES de que el orquestador pushee: `- [fecha] G<n> HECHA: resumen (commits)`)

- [2026-10-19] **G1 HECHA**: `origin/main` (`70004d8`, 145 commits) mergeado **en** `noche/serie-noche-2` con
  **8 conflictos resueltos** preservando ambos lados — `ci.yml` (base descartable `perf-test.db` en 3 jobs +
  pasos propios), `poblado-idempotente` (purga 120 s + higiene noche-2), `scripts/e2e-fresh.mjs` add/add
  (implementación de main + `prisma generate` SQLite de noche-2), `BACKLOG-100.md` (unión de filas y
  secciones), `DEV-qa-lab` (unión de requirements), `ST` (seed authz determinista), archives
  `fix-vercel-data-ignore` (gana el canónico de main `2026-10-19`) y `st-split-fase2/tasks.md` (aceptado el
  borrado: ya archivado y ejecutado en main). Verificado: **0 marcadores** de conflicto y **0 apariciones**
  de las 28 acciones podadas en `openspec/specs/`. Gates: `tsc` 0 · `eslint` 0 problemas (app y ui) · suite
  verde **1330** casos en **134** archivos con global **94.31/85.82/93.61/94.31**, `lib/**` 99.63/94.08/99.44/99.63,
  `app/api/**` 88.57/76.06/89.86/88.57 · `validate --all` 35/35 · `check-delta-coverage` 0 a romper. Queda **1**
  change activo (`au-google-sso`) para G2. **Sin pushear.** Commits `2561e2f` (merge) + documental.
  Deuda menor declarada: el runbook de operaciones describe `e2e:fresh` con la base/flags de noche-2
  (`perf-fresh.db`) mientras la implementación integrada usa los de main (`perf-e2e.db`, `--db`); fuera del
  alcance cerrado de G1.

## Cierre de la serie deuda-5

**SERIE COMPLETA 2/2** (G1 + G2). Resultado: la rama `noche/serie-noche-2` queda con `main` integrado,
sin conflictos, con la suite y los gates verdes y **un solo** change activo del owner (heredado, ajeno a
la serie). Nada de esta serie creó changes nuevos: fueron merge, higiene y documentación.

### Estado por ventana

| Ventana | Alcance | Estado | Commits | Qué dejó |
|---|---|---|---|---|
| G1 | `noche-2-conflictos` — traer `main` a `noche/serie-noche-2` | **HECHA** | `2561e2f` (merge) · `332d5e3` (avance + bitácora) | `origin/main` (`70004d8`, 145 commits) integrado con **8 conflictos** resueltos preservando ambos lados; 0 marcadores; 0 reapariciones de las 28 acciones podadas |
| G2 | `higiene-final` — auditar el change activo y cerrar | **HECHA** | `a280c1f` (runbook) · `este commit de cierre` (cierre + avance) | Informe de `au-google-sso` (**VIVO**), runbook de `e2e:fresh` alineado al script integrado, gates finales y este cierre |

### Números finales de la serie

| Métrica | Valor medido (G2, corrida única) | Piso requerido |
|---|---|---|
| Suite completa (`npm test`, `vitest run --coverage`) | **1327 casos en 131 archivos**, `exit 0` | ≥ 1309 casos · 129 archivos |
| Cobertura global | **94.31 / 85.82 / 93.61 / 94.31** | 93 / 84 / 92 / 93 |
| Cobertura `lib/**` | **99.63 / 94.08 / 99.44 / 99.63** | 98 / 93 / 98 / 98 |
| Cobertura `app/api/**` | **88.57 / 76.05 / 89.86 / 88.57** | 87 / 74 / 88 / 87 |
| `npx tsc --noEmit` | **0 errores** | 0 |
| `npm run lint` (`apps/web`) | **0 errores** · 2 warnings preexistentes `turbo/no-undeclared-env-vars` | 0 problemas |
| `npm run lint` (`packages/ui`) | **0 problemas** | 0 |
| `openspec validate --all` | **35 passed / 0 failed** | 0 fallos |
| `check-delta-coverage au-google-sso` | **3 ok · 0 info · 0 que romperían el archive** | 0 a romper |
| `STORE_VERSION` | **28** (congelado, sin cambios en toda la serie) | 28 |
| `prisma/dev.db` / `Data/NSGC/backups/` | **intactos** (la suite usa `prisma/perf-test.db`) | intactos |

Nota de medición: G1 declaró **1330 casos en 134 archivos**; el árbol solo tiene **131** archivos de test
(`git ls-files test lib | grep -c '\.test\.tsx\?$'` → 131) y esta corrida midió **1327**. La cobertura por
área es **idéntica** a la de G1 (global y `lib/**` al dígito), no se borró ni se modificó ningún test
(`git diff main...HEAD -- test lib` sin entradas `D`/`R`), así que la diferencia es de conteo/reporting en
la bitácora de G1, no una regresión.

### Informe del change activo: `au-google-sso` — **VIVO**

Único change activo que queda (`ls openspec/changes` → `archive/` + `au-google-sso`). Es **del owner**:
no se archivó ni se modificó. Clasificación y evidencia:

**VIVO** (código 100 % implementado; bloqueo **operativo del owner**, no de código). Nada de lo hecho por
las series de deuda lo dejó obsoleto: el problema que resuelve (login Google opcional para usuarios ya
activados) sigue vigente y su implementación está en el árbol.

| Requisito del change | Evidencia en el código actual |
|---|---|
| Provider `Google` en Auth.js (opcional) | `k0mp4ss_fe/apps/web/lib/auth.ts:4` (import) y `:167-177` (registro condicional `googleProviderDisabled ? [] : [Google({...})]`) |
| Solo usuarios activados, sin alta automática | `lib/auth.ts:180-190` (`signIn`: `findUnique` por email + `usuario.activo`, `allowDangerousEmailAccountLinking: false` en `:174`) |
| Rate limit por email también en Google | `lib/auth.ts:183-189` (`excedeIntentos` / `registrarFallo` / `limpiarIntentos` con clave `google:<email>`) |
| JWT `sub` = `Usuario.id` de BD | `lib/auth.ts:196-207` (callback `jwt`, mapea `sub` y `tokenVersion`) |
| UI "Continuar con Google" | `k0mp4ss_fe/apps/web/app/ingresar/page.tsx:415` (`signInNextAuth("google", ...)`) y `:436` (texto del botón) |
| Env vars documentadas | `k0mp4ss_fe/apps/web/.env.example:56-57` (`GOOGLE_CLIENT_ID=`, `GOOGLE_CLIENT_SECRET=`) |
| Tests de integración | `test/auth/google-sso.test.tsx` y `test/auth/google-sso-callbacks.test.ts` (ambos en la suite: 1327 verdes) |
| Opt-out de CI sin credenciales | `lib/auth.ts:17-38` (`GOOGLE_PROVIDER_DISABLED=1`, change `au-google-provider-disabled` de noche-2) |
| Deltas de spec válidos | `check-delta-coverage au-google-sso` → 3 requirements MODIFIED cubren los 13 escenarios, 0 a romper |

**Qué falta** (todo del owner, ningún agente puede cerrarlo):

1. `tasks.md` 3.1: cargar `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` **reales** en Vercel (Environment
   Variables) y verificar el login Google en producción.
2. Las 2 decisiones de owner: rol por defecto al vincular (sugerencia `residente`) y si se migran usuarios
   existentes o solo nuevos (ver `BACKLOG-100.md §C3` y la fila `au-google-sso` del triage).

**No archivar todavía.** El comando queda listo para cuando el owner cierre esos 3 puntos **y** los deltas
ya estén mergeados en `openspec/specs/`:

```bash
openspec archive au-google-sso --yes
```

(Tras el archive: `node openspec/scripts/check-delta-coverage.mjs` no aplica — el change deja de existir — y
`openspec validate --all` debe seguir en 0 fallos. Hacerlo **después** del merge de la rama a `main`, nunca
antes.)

### Deuda menor saldada en G2

- **Runbook de operaciones** (`k0mp4ss_fe/apps/web/docs/runbook-operaciones.md`, commit `a280c1f`): el
  escenario "Lane e2e local (base fresca)" describía la base `prisma/perf-fresh.db` y la forma
  `npm run e2e:fresh -- <nombre>.db`, heredadas de noche-2, mientras el script integrado
  (`scripts/e2e-fresh.mjs`, implementación de `main`) usa **`perf-e2e.db`** por defecto y el flag
  **`--db <archivo>`**. Se corrigieron las **2 ocurrencias** (comando por defecto y ejemplo de nombre
  propio) y se agregó el bloque de flags propios (`--db` / `--keep-db` / `--no-build` / `--help`, siempre
  antes del separador `--`). **El script no se tocó.**

### Deuda post-serie declarada (no se paga, decisión de diseño)

1. **Techo del 99.95 % de cobertura de `lib/store.ts`** por API pública: quedan **2 statements
   inalcanzables por diseño** (`lib/store.ts:4323` y `lib/store.ts:5131`), declarados en deuda-2 (D4) y
   deuda-3 (D5) y visibles en el reporte de cobertura. No se fuerza cobertura con tests artificiales.
2. **Falso positivo de análisis estático en `app/comunidad/comunicacion/page.tsx:292`**: el
   `window.open(url, "_blank", "noopener,noreferrer")` está guardado por `esUrlSegura(url)`
   (`page.tsx:277`, solo `http`/`https`). Código **preexistente e idéntico en `main`**; tocarlo es decisión
   de producto (allowlist de dominios) y queda **fuera de alcance**. No se modificó.
3. **2 warnings de `turbo/no-undeclared-env-vars`** (`lib/auth.ts:24` → `GOOGLE_PROVIDER_DISABLED`,
   `lib/env-guard.ts:43` → `E2E_ALLOW_WRITE_APIS`): las dos banderas las introdujo noche-2 y no están
   declaradas en `k0mp4ss_fe/turbo.json:3` (`globalEnv`). Declararlas es deuda de higiene de 5 minutos,
   fuera del alcance cerrado de esta ventana; el gate de lint es **0 errores**.
4. **`au-google-sso`** sigue activo por bloqueo operativo del owner (ver informe arriba): es la única
   deuda abierta que la serie no puede saldar por diseño.
5. **CI / push / merge / archive** de esta serie los ejecuta el orquestador (los workers nunca pushean).
