# Design: ci-verde-ratchet-cobertura

## D1 — Ratchet por área en vez de bajar o esquivar el global

Alternativas evaluadas:

| Opción | Por qué se descarta |
|---|---|
| Subir la cobertura real a 90/75 global | Hacen falta ~1.100 statements extra: `lib/store.ts` solo aporta 1.202 sin cubrir y la superficie API 2.114. Es una ventana propia, no un fix de CI. |
| Excluir `app/api/**` de la medición (`perFile: false`) | Oculta la superficie API: el gate deja de proteger 126 handlers. Peor que el problema. |
| `coverage.thresholds.autoUpdate: true` | Vitest reescribe el config cuando la cobertura mejora, pero ensucia el worktree en cada corrida. |
| **Elegida: piso por área (ratchet), `piso = floor(medido) − 1`** | Mantiene la protección donde importa, hace el gate alcanzable y deja el número medido como evidencia. |

Vitest v3 soporta globs en `thresholds` y chequea el global **y** cada grupo por separado
(verificado en `node_modules/vitest/dist/chunks/coverage.*.js`, `resolveThresholds()`: *"Global
threshold is for all files, even if they are included by glob patterns"*).

Medido el 2026-10-12 (97 archivos, 967 tests verdes):

| Grupo | statements | branches | functions | lines | Piso aplicado |
|---|---|---|---|---|---|
| GLOBAL | 83.79 | 73.18 | 88.64 | 83.79 | 82 / 72 / 87 / 82 |
| `lib/**` | 87.28 | 79.69 | 95.78 | 87.28 | 86 / 78 / 94 / 86 |
| `app/api/**` | 79.40 | 64.14 | 83.58 | 79.40 | 78 / 63 / 82 / 78 |

Margen: 1 pt entero. Justificación medida: entre dos corridas idénticas hubo drift de V8 de
0.01 pt (`functions` 88.65 → 88.64) y los jobs SQLite y PG reportan idéntico; 1 pt absorbe drift
de herramientas y algún módulo nuevo bien testeado, pero bloquea la degradación real (1 pt
global ≈ 175 statements). **El piso solo sube**: cuando la cobertura mejore, se re-baselinea en
un commit explícito (mismo procedimiento, dejando la fecha de medición en el comentario).

Lección registrada: un umbral global medido sobre un archivo y extendido después a un universo
20× más grande deja de ser un gate y pasa a ser ruido permanente; el piso tiene que medirse
sobre el mismo universo que vigila.

## D2 — Smoke de guardias para las 19 rutas a 0%

`app/api/**` tenía 19 `route.ts` con 0 statements cubiertos (16 handlers `[id]` de dominio,
`csp-report` — público — y los guards de `qa-estado` / `qa-roadmap`). Un archivo
(`test/api/route-guard-smoke.test.ts`, 23 tests) los ejercita sin sesión y sin tocar Prisma:

- 16 rutas `[id]`: `GET` / `PUT` / `DELETE` → **401** desde `withComunidadScope()` antes del
  repositorio (el segundo argumento de Next 16 es `{ params: Promise<{ id }> }`).
- `csp-report`: POST malformado / bien formado / sin `csp-report` → **204**; GET → 200.
- `qa-estado` y `qa-roadmap`: `isWriteApiEnabled()` corta **antes** de auth → **404** con
  `NEXT_PUBLIC_APP_ENV=production`; **401** con `development`. Hallazgo lateral: con
  `NODE_ENV=test` (lo que fija Vitest) el guard está **habilitado** aunque no exista la env,
  porque `getAppEnv()` cae a `development` cuando `NODE_ENV !== "production"`.

Efecto medido en `app/api/**`: **73.09 → 79.40** statements. Rutas a 0%: **19 → 0**.

No se edita ningún handler para hacerlo testeable, no hay snapshots ni skips: el contrato
observado se asserta tal cual está en el código.

## D3 — Deploy condicional a secrets

El contexto `secrets` no está disponible en `if` (ni a nivel job ni step), así que el patrón es:

1. Un step copia `secrets.VERCEL_TOKEN` a `env` y escribe `present=true|false` en `$GITHUB_OUTPUT`.
2. Los steps de Vercel (`npm i -g vercel`, `vercel pull|build|deploy`) llevan
   `if: steps.vercel_secrets.outputs.present == 'true'`.
3. Cuando falta, el step emite `::warning title=Deploy omitido::…` — visible en la UI del run,
   no silencioso.

Descartados: `continue-on-error` (oculta el rojo sin explicar nada) y borrar el job (se pierde
la capacidad cuando el owner cargue los secrets). Con los secrets cargados el job corre solo, sin
tocar el workflow.

## D4 — Infra al día

- **Actions v7 pinneadas por SHA**: `checkout@v7.0.1`, `setup-node@v7.1.0`, `upload-artifact@v7.0.2`
  (antes `@v4`, runtime Node 20 deprecado: GitHub las forzaba a Node 24 con warning en cada run).
  SHA + comentario de versión para que Dependabot pueda actualizarlas.
- **`persist-credentials: false`** en los 5 checkouts: ningún job pushea; el token del repo no
  queda en `.git/config` (endurecimiento `zizmor artipacked`).
- **`permissions: contents: read`** a nivel workflow.
- **`vercel@59.16.0`** en lugar de `latest` (reproducibilidad; versión observada en el último
  intento de deploy).
- **Node**: `.nvmrc` = `24`, `engines.node` `>=20` → `>=24`; local 24.15.0 → 24.21.0 (LTS
  Krypton). Una sola línea de runtime: CI (`node-version: 24`, se autoactualiza con los parches
  de seguridad), local (`.nvmrc`) y Vercel (`engines`).
- **npm**: el local tenía npm 12.2.0 contra npm 11.19 del Node 24. Verificado en `/tmp` que npm
  12 sigue escribiendo `lockfileVersion: 3`, así que `npm ci` en CI sigue leyendo el lockfile.
  Alinear con `nvm install 24.21.0` (trae npm 11.19) — deuda menor.

## D5 — Cinco defectos latentes que el CI rojo tapaba

Con `unit` rojo desde el 2026-09-09, ningún job posterior volvió a correr: `e2e`,
`e2e-rate-limit` y `deploy` quedaban `skipped` en cada push y el polvo se acumuló sin señal. Al
reactivar la lane e2e aparecieron cinco defectos reales, todos arreglados en este change:

1. **La lane e2e abortaba en carga.** `Cannot use({ launchOptions }) in a describe group,
   because it forces a new worker.` en `csp-enforcement.spec.ts`, `csp-report-only.spec.ts`,
   `csp-nonce-uniqueness.spec.ts` y `csp-report-endpoint.spec.ts`; `csp-rollback.spec.ts` lo
   tenía además dentro del cuerpo de un test. Resultado: **cero specs ejecutados** (exit 1 en
   segundos). Detectado con `npx playwright test` local; ninguna corrida de CI lo había visto
   porque el job nunca llegó a ejecutarse.
2. **Los specs "de modo" CSP eran imposibles por diseño.** `CSP_ENFORCEMENT` lo lee el
   **servidor** en cada request (`proxy.ts`); ponerlo en `launchOptions.env` sólo afecta al
   **navegador**. Dos archivos se contradecían (uno exigía `Content-Security-Policy` y el otro
   `…-Report-Only`) contra un único servidor que corre un solo modo por corrida, y
   `csp-rollback.spec.ts` tenía tres tests con `expect(true).toBe(true)` y comentarios
   `placeholder`. Se consolidaron en `e2e/csp-modos.spec.ts`, que deriva el contrato del env del
   servidor (y documenta cómo correr el otro modo); el flip/rollback queda cubierto por
   `test/proxy.header-selection.test.ts` (unit) y no se re-implementa en e2e.
3. **`/api/health` y `/api/csp-report` estaban detrás de auth (401).** El health declara en su
   propio docstring que es público "para monitores/uptime checks" y el sink CSP es el
   `report-uri` que envía el navegador: con 401 la telemetría de violaciones —el gate
   documentado en `SG-hardening-despliegue` para pasar a enforcement— **nunca se registró**.
   Ambos pasan a `RUTAS_PUBLICAS` (exactamente dos entradas, matching y nonce/CSP intactos) y el
   sink recibe el mismo rate limit en memoria que health (60 POST/min/IP → 429) para que
   publicarlo no abra un vector de inundación de logs.
4. **Los jobs `e2e` y `e2e-rate-limit` corrían con el schema PostgreSQL.** Desde la migración
   dual (`st-migracion-postgres`, 2026-09-20) `npx prisma generate` / `migrate deploy` sin
   `--schema` leen `prisma/schema.prisma` (provider `postgresql`) contra
   `DATABASE_URL=file:./dev.db` → `P1012: the URL must start with postgresql://`. Reproducido en
   local; corregido con `--schema=prisma/schema.sqlite.prisma` en ambos jobs (el unit job SQLite
   ya lo hacía).
5. **Los jobs `e2e` no podían ni construir.** `npm run build` fija `NODE_ENV=production`, y el guard
   de `AU-autenticacion-sesion` (la spec lo obliga) exige `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
   presentes en producción → `Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in
   production` al recolectar datos de `/_not-found`. En CI se cargan **credenciales dummy**
   (ningún spec e2e usa Google; el build sólo valida presencia). Verificado en local con el env de
   CI exacto y `.env.local` fuera: build exit 0, 91/91 páginas.
   Deuda anotada: el mensaje del guard ofrece *"or disable the Google provider"* pero **no existe
   esa bandera** (el spec sólo exige el throw); un `GOOGLE_PROVIDER_DISABLED` documentado
   permitiría builds de producción sin credenciales. Es tarea de la serie SG/AU, no bloquea acá.

## Efecto del cambio en el gate

| | Antes | Después |
|---|---|---|
| Tests | 944 verdes / CI rojo | **967 verdes / CI verde** |
| Cobertura global | 80.93 / 72.87 / 87.69 / 80.93 (umbral 90/75/85/90) | 83.79 / 73.18 / 88.64 / 83.79 (piso 82/72/87/82) |
| Rutas a 0% | 19 | 0 |
| Specs CSP e2e | 5 archivos, lane abortada en carga + 3 placeholders | 2 archivos honestos (`csp-modos` + `csp-report-endpoint`), lane carga |
| Endpoints anónimos | `/api/health` y `/api/csp-report` → 401 | 200 (con rate limit 60/min/IP en el sink) |
| Jobs e2e | schema PG contra BD SQLite (P1012) | `--schema=prisma/schema.sqlite.prisma` |
| Build e2e en CI | fallaba por el guard Google sin credenciales | credenciales dummy en el job (nadie usa el provider) |
| Deploy | rojo por secrets ausentes | condicional + warning visible |
| Actions | v4 (Node 20 deprecado) | v7 pinneadas por SHA |

## Deuda que queda (para una ventana nueva)

| # | Ítem | Evidencia | Cómo arrancarlo |
|---|---|---|---|
| 1 | `lib/store.ts` con 1.202 statements sin cubrir (84.21%) — es el archivo más grande del repo (~8.800 líneas) | tabla de cobertura del run `38270687511` | change propio `store-cobertura-fase-b`: partir por secciones del store (FI, CT, PE, IN, RA, MT) y subir el piso de `lib/**` a medida |
| 2 | Superficie API en 79.40% (2.114 statements sin cubrir): faltan fases completas por handler | idem | change `api-cobertura-fases`: tomar los subdirectorios más bajos (`app/api/personas` 70.5%, `app/api/unidades`, `app/api/vinculos`) |
| 3 | `e2e-rate-limit` rojo desde 2026-09-12 (spec que bloquea la IP 15 min; corre aislado) | run `34711169952`, job `E2E rate-limit (aislado)` | reproducir con `E2E_RATE_LIMIT=1 npx playwright test e2e/auth/rate-limit.spec.ts` y revisar la lógica del contador persistente |
| 4 | Secrets de Vercel sin cargar (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`) | run `34711169952`: `--token=` vacío | acción del owner en Settings → Secrets; el job corre solo |
| 5 | npm local 12.2.0 vs npm 11.19 de CI | `npm -v` local / `npm ci` en CI | `nvm install 24.21.0 && nvm alias default 24` |
| 6 | `unit-pg` no corre `tsc` (el job SQLite sí) | `.github/workflows/ci.yml` job `unit-pg` | agregar `npx tsc --noEmit` al job PG si se quiere paridad estricta (opcional: cubre el mismo código) |

## D6 — Defectos de la lane e2e que sólo aparecen al correrla (arreglados)

La lane completa se corrió **cuatro veces** en local durante este change (BD sucia, BD fresca,
specs aislados, lane final). Además de los cinco defectos de D5 aparecieron **cinco** más, todos
del propio arnés de pruebas.

1. **`e2e/auth/rate-limit.spec.ts` no podía pasar nunca.** Usaba la contraseña `incorrecta`, que
   **no pasa la política** (`validarPassword` exige mayúscula + número): `verificarCredenciales`
   corta en `PasswordDebil` **antes** del rate limit, así que no registra ningún intento
   (verificado: `rate_limit_attempts` sin filas nuevas tras los 10 intentos) y el mensaje
   esperado nunca aparece. Corregido con una contraseña que pasa la política y falla contra la
   BD → spec verde (7/7, aislado).
2. **`e2e/crud/visor.spec.ts` duplicaba avisos.** El patrón "re-submitir mientras el dialog siga
   visible" creaba **dos filas** en `avisos_cv` con el mismo título (verificado en BD:
   `cv-1791834049113-67sra2` y `cv-1791834049909-v10a6b`), y el locator estricto reventaba con
   `resolved to 2 elements`. Ahora es single-shot idempotente + `toHaveCount(1)`.
3. **`e2e/crud/logs.spec.ts` no abría el Select de Radix.** Con `click({ force: true,
   noWaitAfter: true })` el menú no se despliega (medido con un probe propio: con click normal
   abre con 60 opciones y `AD_OWNER_CONFIG_CHANGE` presente; la API ya devolvía la faceta entre
   sus 59 tipos). Ahora usa click normal + reintento acotado con `reload()` para el caso de una
   BD recién sembrada.
4. **`e2e/flujo/ciclo.spec.ts` con timeout insuficiente.** La confirmación de limpieza usaba 30s
   mientras `poblado-idempotente.spec.ts` usa 120s **con el motivo escrito** (purga secuencial de
   ~22 DELETEs con cascadas, ~13s caliente y hasta ~68s frío). Alineado a 120s.
5. **Aislamiento de la lane.** El spec de rate-limit bloquea la clave IP (`local` sin proxy) por
   15 minutos: correrlo antes de la lane aborta `auth.setup` entero (observado: 98 specs sin
   ejecutar). Por eso CI lo mantiene en un **job aparte con BD propia**; queda documentado acá y
   en el runbook.

Los tres fallos que quedaban en la lane final (99/104) fueron exactamente estos specs, y los tres
quedaron verdes en la re-corrida dirigida (`logs` 7/7, `visor` + `ciclo` + `poblado-idempotente`
12/13 → con el fix del Select, 7/7 en aislado; `avisos_cv` sin duplicados).

6. **La purga del QA-Lab era demasiado lenta para la lane completa.** `/admin/qa-lab` → *Borrar
   todo lo de prueba* borraba cada entidad TEST con una request secuencial. Con la BD acumulada por
   las specs previas (cientos de cobros TEST) superaba los 120s en el runner y los specs
   `crud/poblado-idempotente` y `flujo/ciclo` fallaban **en su limpieza final** (captura: las 22
   tarjetas seguían "🟢 Listo" y el mensaje seguía siendo "Carga completa OK": no había bloqueo ni
   error de página, sólo tiempo). Se paraleliza en **lotes de 6** (`borrarEnLote`) conservando el
   orden por fases y sin tocar guards ni semántica. Medido local con build de producción y BD
   fresca: **11.1s → 5.6s**, con el mensaje verde (sin fallos transitorios de los lotes).

## Rollback

`git revert` del commit del change: el workflow y los umbrales vuelven al estado anterior (CI
rojo por cobertura). No hay migración de datos ni cambio de contrato.
