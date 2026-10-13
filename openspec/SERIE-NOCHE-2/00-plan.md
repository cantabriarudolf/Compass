# Serie NOCHE-2 — Plan y Estado Canónico

> Toda ventana DEBE leer este archivo al iniciar (bloque ARRANQUE), marcar su fila EN CURSO
> y actualizarla antes del push final. La Bitácora es el registro durable de la serie.
> **Esta serie corre de noche sin el owner**: en modo delegado, el chat orquestador lanza una
> ventana a la vez ("corré la serie noche-2") y nadie participa hasta la mañana.

| Ventana | Alcance | Estado | Commit final |
|---|---|---|---|
| P1 | `qlab-purga-bulk`: endpoint bulk de purga TEST + re-endurecer las 2 limpiezas de cola | HECHA | d080434 |
| P2 | Helper compartido `e2e/helpers/form-dialog.ts` + migrar el patrón re-submit de los CRUD specs | HECHA | 77fadd5 |
| P3 | Higiene chica: `tsc` en `unit-pg`, npm local vs CI, script `e2e:fresh` documentado | HECHA | 60bf48d |
| P4 | Triage de los 6 changes activos viejos (cerrar/archivar o estado explícito) | HECHA | 83842d6 |
| P5 | Cierre de la serie: gates completos, push, CI de la rama, bitácora y deuda restante | HECHA | 0f10d47 |

MÁXIMO: 5 ventanas. **Post-serie (otra noche)**: `SERIE-NOCHE-3` = cobertura real
(`lib/store.ts` 1.202 statements + `app/api/**` 2.114 statements sin cubrir).

## Reglas duras de la serie (válidas en TODAS las ventanas)
1. **Rama de trabajo `noche/serie-noche-2`** creada desde `main` en la P1. **Prohibido pushear
   a `main`**, prohibido mergear: el owner revisa y mergea a la mañana.
2. **Un commit por work-unit**, estilo convencional en español, sin pedir confirmación.
3. **`nsgc-prepush` obligatorio antes de cada push** (avance en `Data/NSGC/docs/avances/`,
   manual de módulo si cambia comportamiento, Trazabilidad si cambia un estado).
4. **Nunca tocar `k0mp4ss_fe/apps/web/prisma/dev.db`** ni `Data/NSGC/backups/`. Para e2e se usan
   bases descartables (`prisma/perf*.db`, ya cubiertas por `*.db` en `.gitignore`).
5. **Nunca secretos** en código, docs ni commits.
6. **Gate por ventana**: `cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm test` (967 tests,
   pisos por área), `openspec validate --all`, `node openspec/scripts/check-delta-coverage.mjs`
   y la e2e dirigida de esa ventana con paridad CI.
7. **Si un gate falla dos veces**: marcar la ventana **BLOQUEADO** en la tabla + Bitácora con la
   evidencia exacta, `git commit` de lo que quede sano (o revertir lo roto) y SEGUIR con la
   próxima ventana. Nunca quedarse reintentando ni pedir intervención: se documenta y se sigue.
8. **Si el contexto se agota**: cerrar la tarea en curso, commitear, actualizar esta Bitácora
   con el estado exacto y avisar en una línea.

## Base de hechos (arranque de la serie)
- CI verde completo en el run `38330292787` (HEAD `ba40be2`): unit, unit-pg, e2e, e2e-rate-limit
  y deploy. 967/967 tests con pisos por área (global 82/72/87/82 · `lib/**` 86/78/94/86 ·
  `app/api/**` 78/63/82/78).
- Node: `.nvmrc` = `24`, `engines.node` = `>=24`, local **24.21.0** (npm 11.19.0).
  Para comandos: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"`.
- Deuda viva: `openspec/BACKLOG-100.md` (sección "CI verde + deuda de cobertura" y
  "Deuda e2e destapada al reactivar la lane") + avance
  `Data/NSGC/docs/avances/avance - 2026-10-12 14-15.md` + memoria Engram (obs. 150).
- Regla operativa de la lane e2e: base fresca
  (`npx prisma migrate deploy --schema=prisma/schema.sqlite.prisma` + `npm run e2e:reseed-base`)
  y **nunca** correr `E2E_RATE_LIMIT=1 … rate-limit.spec.ts` antes de la lane: bloquea la clave
  IP 15 minutos y aborta `auth.setup`.
- Comando e2e con paridad CI (ejemplo real usado en la sesión anterior):
  `CI=1 DATABASE_URL=file:./perfN.db AUTH_SECRET=ci-e2e-secret-no-produccion NEXT_PUBLIC_APP_ENV=development GOOGLE_CLIENT_ID=ci-dummy GOOGLE_CLIENT_SECRET=ci-dummy npx playwright test <specs> --reporter=list`

## Bitácora
- [2026-10-13] P1 HECHA: `qlab-purga-bulk` — endpoint `POST /api/qa-lab/purga-test` (guard 404/401/403, solo TEST + procedencia, idempotente) y `limpiar()` con el bucle como fallback; limpiezas de cola de `poblado-idempotente` y `ciclo` estrictas otra vez (120 s). Gates: tsc 0 · 981/981 · validate 41/0 · delta coverage ok · e2e paridad CI 14/14 sin flaky sobre `perf-noche.db` (commits aa4fd3b, f2a7179, d080434).
- [2026-10-13] P1 (detalle): medición ad-hoc sobre poblamiento completo (44 filas/25 colecciones): antes ≈63 requests de purga y 59.011 ms (dev) / >120 s CI → después 1 request y 3.917 ms wall (916 ms server-side). PUSH de la rama NO realizado en esta ventana: instrucción de proyecto vigente "NO hacer push (el orquestador lo decide)". Pendiente P5: en build de producción `isWriteApiEnabled()` es falso (NODE_ENV=production) y el cliente cae al fallback (3.1 s local) — verificar en el runner de GitHub que las limpiezas estrictas caben en 120 s.
- [2026-10-13] P2 HECHA: helper `e2e/helpers/form-dialog.ts` con contrato single-shot idempotente (1 click + máx. 1 `requestSubmit()` solo si la fila todavía no existe; con `fila` afirma `toHaveCount(1)`) y migración de 11 specs CRUD del más chico al más grande: maestros-datos, estructura, gestión, tipos, directiva, comunicación, portal, visor (homogeneizado con su arreglo manual), multas, gastos-comunes y personas-gobernanza. Unicidad explícita en maestros-datos, tipos, visor y egresos de gastos-comunes. Fuera de alcance documentado: logs (endpoint de ingesta), reservas (diálogo sin `<form>`: su fallback es re-click), admin-maestros (ya single-shot), flujo/personas, certificados, remuneraciones y roles-journeys (envíos únicos vía página). Gates: tsc 0 · 981/981 · validate 41/0 · delta coverage ok · e2e paridad CI 17/17 sin reintentos sobre `perf-noche.db` fresco (además 10/10, 9/9 y 10/10 en corridas por grupo). Duplicados tras la lane: `avisos_cv.titulo` 0 y cero valores QA/TEST duplicados en el barrido de columnas de nombre de todas las tablas (los 43 grupos repetidos son datos del seed). Commits dbe3d25, c812c47, 9f74927, 3b46940, aee5864, 77fadd5.
- [2026-10-13] P3 HECHA: higiene chica — `npx tsc --noEmit` agregado al job `unit-pg` (paridad con el job SQLite, YAML validado); `engines.npm: ">=11"` en `k0mp4ss_fe/package.json` + regla npm local vs CI documentada en `README-DEPLOY.md` (lockfile v3 compatible con npm 11 y 12, lockfile no se regenera, `packageManager: npm@10.8.2` es pin histórico inerte); `npm run e2e:fresh` (`scripts/e2e-fresh.mjs`) recrea base descartable `prisma/perf*.db` desde `migrate deploy --schema=prisma/schema.sqlite.prisma`, siembra con `e2e:reseed-base`, imprime en grande las 2 advertencias (base fresca por corrida; nunca rate-limit primero) y el comando Playwright con paridad CI, con guard anti-`dev.db` (nombre + `DATABASE_URL` fijo que pisa al `.env`, verificado con `node --env-file-if-exists` y `vite-node`). Documentado en `runbook-operaciones.md`. Gates: tsc 0 · 981/981 (pisos cumplidos) · validate 41/0 · delta coverage ok · `e2e:fresh` exit 0 ×2 corridas (base 1.085.440 bytes, siembra usuarios=6/membresias=7/Comunidad=2/unidades=166/personas=55, `dev.db` intacto) · e2e dirigida smoke paridad CI 22/22 en 1.2 min sobre `perf-fresh.db`. Commits ffb6dec, c20d59c, 0a5073d, 60bf48d (avance). Nota: `next-env.d.ts` lo regeneró `npm run build` (ref `.next/types` en vez de `.next/dev/types`) y se restauró al contenido commiteado; no forma parte del cambio.
- [2026-10-13] P4 HECHA: triage de los 6 changes activos viejos **por evidencia**, sin tocar código de producto. Archivados: `a11y-p3-reservas-recursos` (commit 6093381; fix en main desde 1f41ca3 — `opacity-70` fuera + badge "vencida" + `bg-sky-700` en reservas, `aria-label` y badges 700 en recursos; `skip_specs: true`), `fix-vercel-data-ignore` (7510059; `.vercelignore:11` = `/Data/` anclado + comentario desde 52b26b9, ancestro del CI verde 38330292787; al owner el redeploy en Vercel) y `e2e-rojos-flujo-a11y-smoke` (17fd892; lanes flujo/a11y/smoke 37/37 en d9a8ad7 + fixes verificados en código: `editandoProvId` antes que `rutProvDuplicado`, banner cookies con reintento, tabs controlados de bitácora, `e2e:higiene` y helper `datos-test`; coverage ok → +4 requirements y ~2 modificados aplicados en 5 specs: DEV-qa-lab, EF, MP, OP-bitacora-nullguards, PE). Activos con estado explícito en su `tasks.md` + fila en BACKLOG (commit 62d062c): `e2e-higiene-determinismo` (seed determinista implementado y testeado 6/6, pero el delta DEV-qa-lab "Specs GATED al final / e2e:full-orden" quedó obsoleto tras b7e88a8 —>tag GATED y scripts eliminados— y el delta ST no está en la spec viva; refrescar deltas antes de archivar), `au-google-sso` (código + tests en main; bloqueo owner: env vars reales en Vercel + decisiones de rol/migración; §C3 actualizado) y `st-split-fase2` (0/19 tasks, sin `lib/store/slices/`, monolito 8.889 líneas; alcance = 7 slices hoja escrito en su tasks.md). Ninguno descartado; `qlab-purga-bulk` fuera de alcance (archive en P5 tras CI). Gates: tsc 0 · 981/981 · `validate --all` 38/38 (41 −3 archives) · coverage global y por change 0 conflictos · RG §4 sin términos obsoletos. Commits 6093381, 7510059, 17fd892, 62d062c, 83842d6 (avance).

- [2026-10-13] P5 resuelta (unidad S2 del saneamiento pre-pruebas, fuera de serie): push de los commits del saneamiento + docs pre-push (`53b777b`), CI del PR #1 **verde** en el run `38444800307` (unit ✅ · unit-pg ✅ · e2e build producción con `E2E_ALLOW_WRITE_APIS=1` ✅ · rate-limit aislado ✅ · deploy skipped), archive de `qlab-purga-bulk` (`0f10d47`, delta `LAB-mejoras` +1, validate 38/38). Fila P5 → HECHA.

## Cierre de la serie (auditoría del orquestador, 2026-10-13; resolución del bloqueo el mismo día, unidad S2 del saneamiento pre-pruebas)

**Estado: CERRADA, P5 HECHA.** P1–P4 HECHAS; P5 quedó BLOQUEADA en CI (ver nota histórica
abajo) y el bloqueo se resolvió con el saneamiento pre-pruebas (unidad fuera de serie): el
owner autorizó el **opt-in `E2E_ALLOW_WRITE_APIS=1`** en `isWriteApiEnabled()` con doble
candado (`NEXT_PUBLIC_APP_ENV=development` además del opt-in; cableado SOLO en el job `e2e`
de `.github/workflows/ci.yml`), commits `7d0d6e3` (guard + tests TDD), `c781182` (specs de
lane sincronizados con el camino bulk), `e13297f` (env del job CI) y `a889384` (runbook).
Producción/Vercel queda intacta (doble candado bloquea aunque el opt-in esté seteado).

**PR #1**: `https://github.com/cantabriarudolf/Compass/pull/1` (draft, OPEN, rama
`noche/serie-noche-2`). **No se mergeó y no se pusheó a `main`.**

| Job CI (run `38444800307`, el verde definitivo) | Resultado |
|---|---|
| Unit + integración (Vitest SQLite) | ✅ success |
| Unit + integración PostgreSQL | ✅ success |
| E2E Playwright (build producción, `E2E_ALLOW_WRITE_APIS=1`) | ✅ success (bulk real, sin caer al fallback O(n)) |
| E2E rate-limit (aislado) | ✅ success |
| Deploy a Vercel (producción) | ⏭️ skipped (draft PR, esperado) |

**Archive**: con CI verde corrió el pre-gate `node openspec/scripts/check-delta-coverage.mjs
qlab-purga-bulk` (1 ok · **0 que romperían el archive**) → `openspec archive
qlab-purga-bulk --yes` (delta `LAB-mejoras` aplicado: +1 requisito, el endpoint
`POST /api/qa-lab/purga-test`) → `openspec validate --all` **38/38**. Change archivado como
`openspec/changes/archive/2026-10-13-qlab-purga-bulk/` en el commit `0f10d47`.

**Nota histórica — por qué P5 estuvo BLOQUEADA**: el job `E2E Playwright (build producción)`
del run `38396862941` quedó rojo de forma determinista (3/3 intentos):
`e2e/crud/poblado-idempotente.spec.ts:84` no ve `TEST-* limpio correctamente` en 120 s
porque la lane sirve el build de producción (`NODE_ENV=production` → guard
`isWriteApiEnabled()` off) y `limpiar()` caía al fallback O(n), que en el runner supera los
120 s estrictos. La causa raíz es la decisión derivada al owner (habilitar el camino bulk en
la lane) y se resolvió con el opt-in de arriba; los runs intermedios previos al fix también
fueron rojos por esta misma causa.

**RDD (review nativo)**: pendiente con el owner — candidate = slice del PR #1; fuera del
alcance de la serie (regla: la serie no usa herramientas de review).

**Deuda viva**: `SERIE-NOCHE-3` (cobertura `lib/store.ts` + `app/api/**`), secrets de Vercel
del owner (checklist §C3), `au-google-provider-disabled` (propose→apply; archivar cuando el
CI de su change corra verde en su propia ventana) y `st-split-fase2` (0/19 tasks).
