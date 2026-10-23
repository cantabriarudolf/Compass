# BACKLOG-100 — Frontera "futuro" (decisión del owner 2026-08-31 · actualizado 2026-09-01 cierre SERIE-FRONTERA)

> Contexto durable para continuar en CUALQUIER chat futuro. El owner definió que el 100%
> del spec vigente se cierra con la `SERIE-MENU-100` (A+B, COMPLETA 6/6). La frontera
> C1-C4 se ejecuta en la **`SERIE-FRONTERA`** (C2 + C1 + C4; C3 EN PAUSA por credenciales
> Google). Estado vivo: ver `openspec/SERIE-FRONTERA/00-plan.md` §Roadmap/Bitácora.
> **SERIE-FRONTERA COMPLETA 6/6** — C1/C2/C4 HECHOS, C3 EN PAUSA pendiente de credenciales.

## Estado de ejecución (2026-09-01 — CIERRE)

| Ítem | Estado | Dónde |
|---|---|---|
| C2 Idempotencia poblado | ✅ HECHO — SERIE-FRONTERA P1 `0c9fb6a` — guard → confirmación "Limpiar y poblar de una vez" (`limpiar()`+`runFase todo`), e2e `poblado-idempotente` 2/2 | SERIE-FRONTERA P1 (00-plan.md + avance 2026-09-01 06-30) |
| C1 Retención logs 5 años | ✅ HECHO — SERIE-FRONTERA P2 `1882e98` + P3 `a9cd1b7` — sync batch debounce 2s → `POST /api/auditoria/sync` upsert idempotente + `GET /api/auditoria` paginado + `/admin/logs` lee BD con paginación server-side y export CSV | SERIE-FRONTERA P2-P3 (avances 2026-09-01 07-15/08-15) |
| C3 Google SSO | ⏸ **EN PAUSA** — requiere del owner (ver §C3 checklist) — provider en `lib/auth.ts` (runtime Node), solo usuarios activados, credentials fallback | Este archivo §C3 — pendiente |
| C4 ABAC contextual | ✅ HECHO — SERIE-FRONTERA P4 `913489b` + P5 `d336cd6` — `puedeContextual(rol,accion,recurso,ctx)` puro + `reglasContextuales()` snapshot + matriz contextual read-only en `/admin/permisos` (16 reglas, motor/check local) | SERIE-FRONTERA P4-P5 (avances 2026-09-01 09-30/10-30) |

## C1 — Retención de logs de auditoría (5 años) — ✅ HECHO P2-P3 (1882e98/a9cd1b7)

- **Spec:** `openspec/specs/AM-auditoria-metricas/spec.md` §Logs de Auditoría (Scenario
  Retention: "MUST be retained for a minimum of 5 years") + `AM:80` inmutabilidad.
- **Estado hoy:** la vista `/admin/logs` (change `am-logs-visor`) lee `store.eventos`
  (localStorage) con tope `MAX_EVENTOS = 500`. La retención real requiere capa de datos ST.
- **Qué implica:** persistir eventos en Prisma/SQLite (modelo `EventoAuditoria`), API de
  ingesta o sync, y que `/admin/logs` consulte BD (server component o API) con la misma UX
  (filtros/export). Ponderar volumen (500 visibles vs histórico completo) y el coste de
  consultas. Toca `lib/store.ts` (fuente) o un writer paralelo en el repositorio ST.
- **Esfuerzo:** change grande (2-3 ventanas). **Dependencias:** ST (capa persistente).
- **Sugerencia:** change `am-retencion-logs`: tabla `EventoAuditoria` + writer en
  `registrarEvento` (o batch) + `/admin/logs` leyendo BD con paginación server-side.

## C2 — Idempotencia del poblado QA Lab — ✅ HECHO P1 (0c9fb6a)

- **Spec/contexto:** Serie QA-LAB (`openspec/SERIE-QA-LAB/`, COMPLETA 3/3) dejó el guard
  clean-first ("Existen datos TEST-*: ejecuta primero «Borrar todo lo de prueba»"). La
  idempotencia = que "Poblar todo de una vez" sobre datos TEST existentes no bloquee ni
  duplique (upsert por IDs TEST).
- **Estado hoy:** segunda corrida BLOQUEADA por diseño. El fallback de `e2e/crud/pagos.spec.ts`
  existe porque CT paga los cobros TEST.
- **Qué implica:** semántica upsert en acciones del store (FI/PL/CV/CT), riesgo de romper
  las 425 pruebas unitarias y las 24 e2e que hoy asumen estado determinista. Requiere
  decisión de diseño: ¿re-poblar = upsert, o limpiar+poblar automático?
- **Esfuerzo:** medio-grande. **Dependencias:** ninguna externa, pero tocar `lib/store.ts`
  (STORE_VERSION bump probable).
- **Sugerencia:** change `qa-lab-poblado-idempotente` con spike primero (qué colecciones
  colisionan: FI cobros, PL liquidaciones, CV avisos, CT certificados).

## C3 — Google SSO — ⏸ EN PAUSA (pendiente de credenciales del owner)

> **Actualización NOCHE-2 P4 (2026-10-13):** el código del change `au-google-sso` ya está
> en main (provider + fail-fast + UI + tests + credenciales dummy en CI); sigue **ACTIVO**
> por las env vars reales de Vercel y las decisiones de owner de este checklist.
> Fila detallada en §Changes activos (final del archivo).

- **Spec:** `openspec/specs/AU-autenticacion-sesion/spec.md` §Autenticación Futura (Scenario
  Google SSO). El proyecto hoy: Auth.js credentials + JWT + rate limit persistente (Serie
  Plataforma P5/P4, ver `project.md`).
- **Estado hoy (2026-09-01 cierre):** SERIE-FRONTERA no ejecuta C3. Infraestructura Auth.js ya existe (adapter Prisma propio) — añadir provider Google es natural, PERO bloqueado hasta que el owner provea credenciales. SERIE COMPLETA 6/6 sin C3.
- **Checklist pendiente del owner (obligatorio para desbloquear `au-google-sso`):**
  - [ ] `GOOGLE_CLIENT_ID` — Client ID de Google Cloud Console (OAuth 2.0 Client)
  - [ ] `GOOGLE_CLIENT_SECRET` — Client Secret correspondiente (secreto, no commitear)
  - [ ] `redirect URI` autorizada — `http://localhost:3000/api/auth/callback/google` (dev) + URL de producción (ej. `https://<dominio>/api/auth/callback/google`) registrada en Google Cloud → Authorized redirect URIs
  - [ ] Decisión owner: vinculación solo para usuarios ya activados (`RP/MP Activación de Cuentas`), credentials queda como fallback; rol/membresía por defecto al primer login Google y tratamiento del rate limit por email
- **Esfuerzo:** change grande. **Dependencias:** cuenta Google Cloud del owner + secretos (bloqueante).
- **Sugerencia:** change `au-google-sso` — provider opcional, solo para usuarios ya activados (Activación de Cuentas RP/MP), manteniendo credentials como fallback. Al desbloquear, crear change openspec `au-google-sso` con `lib/auth.ts` (runtime Node) + env + tests.
- **Serie:** SERIE-FRONTERA P6 cierra con C3 documentado EN PAUSA en `openspec/SERIE-FRONTERA/00-plan.md` Bitácora "SERIE COMPLETA" + este §C3.

## C4 — ABAC contextual completo — ✅ HECHO P4-P5 (913489b/d336cd6)

- **Spec:** `openspec/specs/RP-roles-permisos/spec.md` §Permisos Contextuales (ABAC) +
  atributos ya presentes: `mp:propios`, `pl:propia`, `ct:propio`, `residenteVeMorosidad`
  (controles de privacidad `/admin/gestion`), `fi` filtrado por unidad.
- **Estado hoy:** parcial — `puede()` es RBAC puro; los filtros ABAC están hardcodeados en
  páginas/repos (propios/propia). Falta el modelo contextual formal (recurso + contexto →
  decisión) y su matriz visible.
- **Qué implica:** extender `lib/authz.ts` con `puedeContextual(rol, accion, recurso,
  contexto)` + migrar los checks inline existentes + visible en `/admin/permisos`. Toca el
  motor que hoy es puro y testeado (authz.test.ts 16 tests).
- **Esfuerzo:** grande. **Dependencias:** nada externo; riesgo alto de regresión en guardas.
- **Sugerencia:** change `rp-abac-contextual` en 2 fases: (1) modelo + migración de checks
  existentes sin cambio de comportamiento (tests verde), (2) vista en /admin/permisos.

## Punto cero financiero (2026-09-02)

**HECHO** — la historia real 2023-2024 (INGvsEGR.xlsx) es la línea base del sistema: feature
"Ingreso manual a fondo" + `FondoFI.saldoInicial` (versátil: fiel al flujo o cuadrado) +
STORE_VERSION 27 con migración idempotente (fondo "Cuenta Corriente", 182 egresos FE-0001..0182,
44 ingresos). **FI→BD también HECHO (2026-09-03, change `fi-sync-bd`, commit `25f6aab`, CI 🟢)**: espejo Prisma/SQLite del
punto cero vía `POST /api/fi/sync` (batch idempotente, patrón C1 auditoría) + panel read-only
"Espejo BD (ST)" en `/finanzas` — `saldoInicial` en `FondoFI` + modelo `IngresoFI` en schema
(migración `20260903032006_fi_sync_bd`); store sigue siendo fuente de la UI, BD espejo de
retención. Fase 2 (UI leyendo BD) y espejo de `cobrosFI`/`emisionesGC` quedan como extensión
opcional del mismo patrón.

## Nota de proceso

- **HECHO (2026-09-03): change `qa-roadmap-visual`** — Modo QA Roadmap tipo búho (F1 etapas +
  chispas + notas + dashboard; F2 reporter en vivo test a test). Commits `00b1050`/`79fae4c`/
  `33c2ad1`, archivado `2026-09-03-qa-roadmap-visual`. Extensiones futuras posibles: chispas
  dinámicas por LLM, roadmap para lane unit, integración con `/qa` de ventanas nuevas.
- Cualquier chat puede retomar estos ítems: la fuente de verdad es este archivo + los specs
  citados. Al elegir uno, crear el change openspec correspondiente (no serie necesaria salvo
  C1/C4 que ameritan 2 ventanas).
- Cualquier chat puede retomar estos ítems: la fuente de verdad es este archivo + los specs
  citados. Al elegir uno, crear el change openspec correspondiente (no serie necesaria salvo
  C1/C4 que ameritan 2 ventanas).
- Orden sugerido si hay ganas: C2 (mejora QA diaria) → C1 (compliance AM) → C3 → C4.
- Estado al 2026-08-31: A+B se ejecutan en SERIE-MENU-100; C1-C4 sin empezar.

**Hallazgos documentales del dry-run @revisor-fin (2026-09-03, arnés)**: (F1) la apertura
17.082.694 es DERIVADA (egresos − ingresos) y no proviene del libro — el "saldo 0" es
tautológico por construcción; documentar en fixture/comentario + test que declare la
identidad. (F2) la serie mensual `saldoCC` del fixture sigue la cuenta bancaria del libro
y NO reconcilia mes a mes con la derivada (23/24 meses difieren) — está en el JSON pero no
se materializa; declarar su semántica o removerla para evitar doble verdad. Bajo: solo
aclaración documental, 0 errores de cálculo.

## Hallazgos de la Revisión 2026-09-08 (SERIE-REVISION P1-P5)

> Revisión nocturna con arnés gentle-ai. Commits: `8fada6d` (P1), `55ad834` (P2), `2114ede` (P3), `1185512` (P4).

- **Estabilidad**: suite unit 517/517 verde, e2e 86/88 verde (2 skipped). Lint: 12 warnings (0 errores).
- **Seguridad aplicada**: recurso `am` en authz, authz checks en APIs FI/Auditoría, auth en dev/QA endpoints, CSP report sanitizado.
- **Deuda técnica documentada**: store monolito (5007 líneas), 27+ repeticiones de patrón ID, 4 funciones `hoyISO*` duplicadas. Ver `openspec/changes/revision-arquitectura/` y `openspec/changes/revision-integraal/`.
- **Tareas derivadas**: ver `openspec/changes/revision-integraal/tasks.md` (priorizadas Critical/High/Medium/Low).

## Mejoras de infraestructura de producción (SERIE-PRODUCCION P1-P6) — ✅ COMPLETA 2026-09-09

> Serie de remediación ejecutada automáticamente mientras el owner dormía. Commits: `39f3cdc` (P1), `52c83a7` (P2), `125d86d` (P3), `5948e0e` (P4), `fb2c094` (P5), `0da618d` (P6).

| Ventana | Qué se hizo | Estado |
|---|---|---|
| P1 | Unificación `hoyISO*()` en `lib/date-utils.ts` + 27 repeticiones de ID reemplazadas por `generarId()` + tests | ✅ |
| P2 | `vercel.json` + `output: standalone` + `env-guard.ts` endurecido + bundle-analyzer | ✅ |
| P3 | `/api/health` con check BD + `pino` logger estructurado + `instrumentation.ts` + redacción PII en logs | ✅ |
| P4 | `husky` + `lint-staged` pre-commit hooks + coverage extendido a 8 archivos + auditoría dependencias | ✅ |
| P5 | Job `deploy` en GitHub Actions (Vercel) + script `deploy-vercel.mjs` manual | ✅ |
| P6 | `README-DEPLOY.md` + `runbook-operaciones.md` + `TROUBLESHOOTING.md` | ✅ |

**Métricas post-serie:**
- Tests: 552/552 unit verdes (subieron de 517)
- Lint: 13 warnings (0 errores) — heredados de proxy.ts/e2e/scripts
- tsc: 0 errores
- Coverage extendido: 8 archivos (store.ts, date-utils.ts, id-utils.ts, env-guard.ts, logger.ts, authz.ts, schemas.ts, api routes)

**Post-serie (requiere decisión del owner):**
- [ ] **Migración SQLite → PostgreSQL** — Elige proveedor: Vercel Postgres, Supabase, Neon, AWS RDS
- [ ] **Cifrado de datos sensibles en reposo** — Estrategia: AES-256 por campo vs TDE de BD
- [ ] **2FA/MFA** — Elige método: TOTP app (Google Authenticator), SMS, email
- [ ] **Sentry** — Crea cuenta en https://sentry.io e integra DSN
- [ ] **Política de privacidad y consentimiento** — Contenido legal para cumplir Ley 19.628 / 21.719
- [ ] **CSP enforcement** — Requiere dominio real + 7 días de telemetría Report-Only
- [ ] **Password policy** — Mínimo de complejidad, breach-list, rotación
- [ ] **Reducción de sesión JWT** — De 30 días a 24h con sliding refresh
- [ ] **Derechos ARCO** — UI/API para acceso, rectificación, cancelación de datos personales

## Seguridad y compliance de producción (SERIE-PRODUCCION-FASE2 P1-P6) — ✅ COMPLETA 2026-09-10

> Lleva Compass de "infraestructura mínima" a "producto seguro y compliant".
> Detalle por ventana: `openspec/SERIE-PRODUCCION-FASE2/00-plan.md`.

| Ventana | Qué se hizo | Commit |
|---|---|---|
| P1 | Infra Neon PostgreSQL (parcial intencional): `lib/prisma.ts` con `datasourceUrl`, `.env.example`, migraciones respaldadas, Accelerate | `7fe4b9c` |
| P2 | Password policy + JWT 24h (sliding 1h) + invalidación de sesiones (`tokenVersion`) | `e45bcb2` |
| P3 | 2FA/TOTP + backup codes: 6 rutas API, desafío JWE 5min, sesión Auth.js real | `6a9d205` |
| P4 | Cifrado AES-256-GCM en reposo: `lib/crypto`, extensión Prisma opt-in, script migración idempotente | `5efa23b` |
| P5 | Sentry code-complete (pendiente DSN) + CSP en enforcement con report-uri | `7a5bf36` |
| P6 | Privacidad/términos + API y UI de derechos ARCO + banner consentimiento + cierre | `c85ca2e` |

**Métricas post-serie:**
- Tests: 606/606 unit verdes (subieron de 552; incl. 22 de 2FA, 15 de cifrado, 4 de Sentry, 6 de ARCO)
- tsc: 0 errores · Lint: 13 warnings (0 errores) · openspec validate: 37/37
- STORE_VERSION: 27 (sin cambios en la serie)

**Post-serie (requiere decisión/acción del owner):**
- [ ] **Push a origin + NSGC pre-push** — la serie va ~21 commits ahead de `origin/main`
- [ ] **Sentry**: pegar `SENTRY_DSN` real (y `SENTRY_AUTH_TOKEN` para source maps) — código listo
- [ ] **Revisar privacidad/términos con abogado** — scaffolds funcionales, no texto legal definitivo
- [ ] **Correr `npm run cifrar:datos`** en producción tras desplegar (con `CLAVE_CIFRADO_DATOS` real)
- [ ] **Rollout cifrado por módulo + blind index HMAC** para búsqueda por rut/email cifrados
- [x] **UI login 2FA** (form 6 dígitos en `/ingresar`; API completa) — HECHO `bb96ef7` 2026-09-19
- [ ] **Pen-test dinámico** + auditoría de seguridad externa (recomendado)
- [ ] **Registro como encargado de datos (Ley 21.719)**
- [ ] **Migración de datos SQLite → PostgreSQL** (pendiente: script de migración, backup/restore, CI, cambio de provider)
- [ ] **Configurar `DATABASE_URL` en Vercel dashboard** cuando exista el proyecto
- [x] **Mantenimiento skill `pruebas`** — SUPERSEDED 2026-09-23: arnés opencode retirado del repo (`.opencode/` eliminado); el handoff de ejecución queda pendiente de redefinir en el harness activo
- [ ] **Store split Fase 1** — HECHO `eff32c3` 2026-09-19 (9 helpers a `lib/store/helpers.ts`, tsc 0, 32/32 tests). Fase 2 pendiente calendarización.
- [ ] **Open redirect fix** — HECHO `1c23f5d` 2026-09-19 (HIGH, `esDestinoSeguro` en `/ingresar`).
- [ ] **NextAuth tipado sin any** — HECHO `e3b7861` 2026-09-19 (TS2742-safe exports).

## Migración fuente de verdad localStorage → Base de Datos (SERIE-BD-FUENTE-VERDAD Fase 0–5B) — ✅ COMPLETA 2026-09-25

> Cambia la fuente de verdad de la aplicación de `localStorage` (zustand persist) a Prisma/SQLite(dev) → PostgreSQL/Neon(prod).
> Detalle por fase: `openspec/SERIE-BD-FUENTE-VERDAD/00-plan.md`.

| Fase | Qué se hizo | Commit |
|---|---|---|
| 0 | Infra: factory API + hook cliente + `PeriodoDirectiva` en Prisma | `bbfba14` |
| 1 | MP + Maestros: personas, vínculos, maestros admin | (varios) |
| 2 | GD + AD: actas, períodos, controles de propiedad | (varios) |
| 3 | FI + EF: fondos, egresos, ingresos, estructura física | (varios) |
| 4 | Operativos: PE, RA, CV, CO, GE, IR, IN, MT | `cae733f` |
| 5A | APIs RE/CF/CT/Notif + Store-UI + Deprecación inicial store | `2a1a9f2` |
| 5B | Specs NSGC + tests finales + script verificación | `0164873` |

**Métricas post-serie:**
- API routes: 30+ endpoints REST (GET/POST/PUT/DELETE) con scoping `comunidadId`
- Hooks cliente: 20+ hooks `use-*.ts` basados en SWR
- `lib/store-ui.ts`: estado de UI puro (modales, filtros, vistas, sidebar, toasts), `UI_STORE_VERSION=1`
- `lib/store.ts`: `STORE_VERSION=28` congelado, acciones de dominio `@deprecated`
- Specs NSGC: `ST - Capa de Datos Persistente.md` reescrito + 21 specs de módulo con bloque "🔌 Datos" actualizado
- Script: `scripts/verificar-persistencia-db.ts` — verifica fuente de verdad Prisma
- Tests: 795 passed + 14 skipped, tsc 0 errores

**Follow-up: SERIE-UI-MIGRACION-BD (P1-P6, cerrada 2026-09-25)**
- 22/28 páginas migradas de `useCompassStore` a hooks SWR/BD (commits `d4f8d13` a `9450c14`).
- 6 páginas quedan como excepciones/TODO por falta de hooks/API: `admin/qa-lab`, `admin/mantenimiento`, `admin/dev-dashboard`, `admin/reporteria`, `finanzas/remuneraciones` (liquidacionesPL/adelantosPL sin hooks), y acciones complejas sueltas en `multas`, `recursos`, `proyectos`, `personal`, `gastos-comunes`, `visor-mensajes`.
- Usos restantes del store legacy: 168 líneas en 14 archivos (todos documentados como TODO o excepción).
- Tests: 151/151 API pass, tsc 0 errores nuevos.
- `lib/store.ts` permanece como legacy `@deprecated` (STORE_VERSION=28 congelado); las acciones que ya nadie usa se eliminaron en `store-cleanup` (P1 de la Serie NOCHE-3).

## CI verde + deuda de cobertura (2026-10-12) — change `ci-verde-ratchet-cobertura`

> El CI de `main` estuvo rojo un mes **sin un solo test roto**: los jobs de Vitest corrían
> 944/944 (hoy 967/967) verdes y morían por el umbral de cobertura. Detalle y evidencia:
> `openspec/changes/ci-verde-ratchet-cobertura/{proposal,design,tasks}.md`.

| Ítem | Estado | Dónde |
|---|---|---|
| Gate de cobertura por área (ratchet `medido − 1 pt`: global 82/72/87/82 · `lib/**` 86/78/94/86 · `app/api/**` 78/63/82/78) | ✅ HECHO — medido 83.79/73.18/88.64/83.79 con 967 tests | `k0mp4ss_fe/apps/web/vitest.config.ts` |
| Smoke de guardias de las 19 rutas a 0% (401/404/204, sin tocar Prisma) | ✅ HECHO — `app/api/**` 73.09 → 79.40; rutas a 0% = 0 | `k0mp4ss_fe/apps/web/test/api/route-guard-smoke.test.ts` |
| Deploy condicional a secrets + `::warning` visible | ✅ HECHO — cuando el owner cargue los 3 secrets corre solo | `.github/workflows/ci.yml` |
| Actions v7 pinneadas por SHA (runtime Node 24) + `persist-credentials: false` + `permissions: contents: read` | ✅ HECHO | `.github/workflows/ci.yml` |
| Una sola línea de Node: `.nvmrc` = 24, `engines.node` = `>=24`, CI `node-version: 24`, local 24.21.0 (LTS Krypton) | ✅ HECHO | `.nvmrc`, `k0mp4ss_fe/package.json` |
| `lib/store.ts`: 1.202 statements sin cubrir (84.21%, archivo de ~8.800 líneas) | ⏳ PENDIENTE — change `store-cobertura-fase-b` | §Deuda en `design.md` |
| Superficie API: 2.114 statements sin cubrir (79.40%); los más bajos: `app/api/personas` 70.54%, `app/api/unidades`, `app/api/vinculos` | ⏳ PENDIENTE — change `api-cobertura-fases` | §Deuda en `design.md` |
| `e2e-rate-limit` rojo desde el 2026-09-12 (spec aislada que bloquea la IP 15 min) | ✅ HECHO — 7/7 local y job CI verde en el run `38396862941` (2m16s), SERIE-NOCHE-2 P5 | run `38396862941` |
| Secrets de Vercel (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`) | ⏳ ACCIÓN DEL OWNER — al cargarlos el job `deploy` corre solo | Settings → Secrets del repo |
| npm local 12.2.0 vs 11.19 de CI (lockfile v3 compatible, verificado) | ✅ RESUELTO — `engines.npm: ">=11"` en `k0mp4ss_fe/package.json` + regla documentada en `README-DEPLOY.md` (SERIE-NOCHE-2 P3, `c20d59c`); lockfile v3 compatible | `k0mp4ss_fe/package.json`, `README-DEPLOY.md` |

### Deuda e2e destapada al reactivar la lane (2026-10-12, mismo change)

| Ítem | Estado | Dónde |
|---|---|---|
| Lane e2e abortaba en carga (4 specs con `test.use({launchOptions})` en `describe` + `csp-rollback` con `expect(true)`) | ✅ HECHO — consolidada en `e2e/csp-modos.spec.ts` + `csp-report-endpoint.spec.ts` | `design.md § D5` |
| `/api/health` y `/api/csp-report` detrás de auth (401): uptime y telemetría CSP inútiles | ✅ HECHO — públicos + rate limit 60/min/IP en el sink, con tests | `proxy.ts`, `app/api/csp-report/route.ts` |
| Jobs `e2e`/`e2e-rate-limit` con schema PostgreSQL contra `file:./dev.db` (`P1012`) | ✅ HECHO — `--schema=prisma/schema.sqlite.prisma` | `.github/workflows/ci.yml` |
| `auth/rate-limit.spec.ts` no podía pasar (contraseña no válida por política → no registraba intentos) | ✅ HECHO — contraseña que pasa la política y falla contra BD (7/7) | `e2e/auth/rate-limit.spec.ts` |
| `crud/visor.spec.ts` duplicaba avisos en BD por re-submit (2 filas mismo título) | ✅ HECHO — single-shot + `toHaveCount(1)` | `e2e/crud/visor.spec.ts` |
| `crud/logs.spec.ts` no abría el Select de Radix con `force:true` | ✅ HECHO — click normal + reintento acotado | `e2e/crud/logs.spec.ts` |
| `flujo/ciclo.spec.ts` limpieza con timeout 30s (purga secuencial tarda más) | ✅ HECHO — alineado a 120s | `e2e/flujo/ciclo.spec.ts` |
| Barrido del patrón "re-submit hasta que cierre el dialog" en el resto de los CRUD specs | ✅ HECHO — helper `e2e/helpers/form-dialog.ts` (single-shot idempotente) + 11 CRUD specs migrados y verdes en paridad CI (SERIE-NOCHE-2 P2) | `tasks.md §5.0` |
| Correr la lane e2e local requiere BD fresca (`e2e:reseed-base`) y **no** correr antes el spec de rate-limit (bloquea la IP 15 min y aborta `auth.setup`) | 📌 REGLA OPERATIVA | `runbook-operaciones.md`, `design.md § D6` |
| El guard de Google (`AU-autenticacion-sesion`) exige credenciales en producción y su mensaje ofrece "disable the Google provider", pero **esa bandera no existe**: en CI se usan credenciales dummy para poder construir | ✅ HECHA — `GOOGLE_PROVIDER_DISABLED=1`: (a) salta el fail-fast de producción y (b) no registra el provider Google (solo Credentials); mensaje que nombra la bandera, tests TDD 6/6, `.env.example` + runbook, change `au-google-provider-disabled` (S3 saneamiento, `9fba97d`) | `lib/auth.ts`, `design.md § D5.5` |
| Purga QA-Lab secuencial (1 request por entidad) tardaba >120s en CI con la BD acumulada y hacía fallar `poblado-idempotente`/`flujo/ciclo` en su limpieza final | ✅ HECHO — lotes de 6 (`borrarEnLote`) manteniendo el orden por fases; medido 11.1s → 5.6s local | `app/admin/qa-lab/page.tsx` |
| `crud/logs.spec.ts` dependía del switch de privacidad de `/admin/gestion` (con BD fresca hay 0 switches → 0 eventos → sin faceta): falso verde con BD acumulada y rojo real en CI | ✅ HECHO — siembra 2 eventos por `POST /api/auditoria/sync` y asserta la faceta directo | `e2e/crud/logs.spec.ts` |
| `crud/roles-journeys.spec.ts` con el timeout de CI por defecto (30s) para un journey con varios waits | ✅ HECHO — `test.setTimeout(120_000)` | `e2e/crud/roles-journeys.spec.ts` |
| Purga QA-Lab sin endpoint bulk: borra una entidad TEST por request, así que tras un poblamiento completo excede los 120s en el runner de CI (5-11s local) | ✅ HECHA — `qlab-purga-bulk` (SERIE-NOCHE-2 P1): `POST /api/qa-lab/purga-test` bulk + fallback en `limpiar()`; 63 requests → 1 (916 ms server-side) | `app/admin/qa-lab/page.tsx`, `design.md § D6` |

## Changes activos — triage SERIE-NOCHE-2 P4 (2026-10-13)

Ventana P4 decidió **por evidencia** el destino de los 6 changes activos viejos: 3
archivados (coverage ok + implementación verificada en repo + CI verde run `38330292787`)
y 3 dejados activos con estado explícito. Descartados por "ya no aplica": **ninguno**.
`qlab-purga-bulk` queda fuera de alcance (es el change de la P1 de esta serie; su archive
va en P5, tras CI verde de la rama).

| Change | Decisión 2026-10-13 | Evidencia / qué falta |
|---|---|---|
| `a11y-p3-reservas-recursos` | ✅ ARCHIVADO (`6093381`) | fix en main desde `1f41ca3`: `opacity-70` fuera + badge "vencida" + `bg-sky-700` en reservas; `aria-label` del selector de estado y badges 700 en recursos; `skip_specs: true`, coverage ok |
| `fix-vercel-data-ignore` | ✅ ARCHIVADO (`7510059`) | `.vercelignore:11` = `/Data/` anclado + comentario desde `52b26b9`; `skip_specs: true`, coverage ok. Al owner: redeploy en Vercel |
| `e2e-rojos-flujo-a11y-smoke` | ✅ ARCHIVADO (`17fd892`) | lanes `e2e/flujo`+`e2e/a11y`+`e2e/smoke` 37/37 (Bitácora SERIE-E2E-FULL-VERDE P3, commit `d9a8ad7`); TDZ proveedores, banner cookies, tab controlado de bitácora y `e2e:higiene` verificados en código; deltas aplicados: +4 requirements y ~2 modificados en 5 specs |
| `e2e-higiene-determinismo` | ✅ ARCHIVADO (`2026-10-13-e2e-higiene-determinismo`) | Saneamiento S4: delta `DEV-qa-lab` refrescado al diseño actual (corrida única `npx playwright test` sin tag GATED, specs autónomos vía `e2e/helpers/datos-test.ts`, receta `e2e:reseed-base` + `e2e:higiene --apply`) en vez de la estrategia muerta de `b7e88a8`; delta ST (seed determinista) aplicado a la spec viva; `check-delta-coverage` 0 → archive → `validate --all` 39/39 |
| `au-google-sso` | ⏸ ACTIVO (owner) | código y tests en main; falta 3.1 env vars reales en Vercel + login Google en producción + 2 decisiones de rol/migración. Ver §C3 |
| `st-split-fase2` | ⏳ ACTIVO | 0/19 tasks; no existe `lib/store/slices/` y `lib/store.ts` sigue monolito (8.889 líneas); alcance pendiente = 7 slices hoja (IR, MT, AD, PI/D3, CO, GE, CV) en el orden del proposal |

## Saneamiento pre-pruebas (2026-10-13)

Unidad de trabajo fuera de serie (rama `noche/serie-noche-2`) para saldar deuda
accionable antes de las pruebas manuales del owner. **Cerrada**: push realizado, CI del
PR #1 verde (run `38444800307`) y `qlab-purga-bulk` archivado.

| Unidad | Qué quedó hecho | Evidencia |
|---|---|---|
| S1 | Opt-in `E2E_ALLOW_WRITE_APIS=1` en `isWriteApiEnabled()` con doble candado (solo lane e2e del CI) + tests TDD + delta `SG-hardening-despliegue` + runbook | `7d0d6e3`, `c781182`, `e13297f`, `a889384` · change `e2e-guard-optin-ci` **ARCHIVADO 2026-10-14** (`280d37f`) |
| S2 ✅ | **CI verde + archive**: push de la rama (docs pre-push `53b777b`), run `38444800307` verde (unit ✅ · unit-pg ✅ · e2e build producción con `E2E_ALLOW_WRITE_APIS=1` ✅ · rate-limit aislado ✅ · deploy skipped), `qlab-purga-bulk` **archivado** (`0f10d47`, delta `LAB-mejoras` +1, validate 38/38), fila P5 → HECHA | run `38444800307`, `0f10d47` |
| S3 | Bandera `GOOGLE_PROVIDER_DISABLED=1`: (a) no corre el fail-fast de producción y (b) no registra el provider Google (queda solo Credentials); mensaje de error que nombra la bandera; tests TDD 6/6; `.env.example` + `docs/runbook-operaciones.md`; change `au-google-provider-disabled` (propose → apply → **ARCHIVADO 2026-10-14**, `b5a9f42`) | `9fba97d` |
| S4 | `e2e-higiene-determinismo` **archivado**: delta `DEV-qa-lab` refrescado al diseño actual (corrida única `npx playwright test` sin tag GATED, specs autónomos, `e2e:higiene`) y delta ST (seed determinista) aplicado a la spec viva | `04eb1cf` |
| S5 | Este archivo al día (filas `e2e-rate-limit`, npm local/CI, `GOOGLE_PROVIDER_DISABLED`, rojos de UI) + Bitácora de `SERIE-VALIDACION-PERFILES` | (commit de S5) |

- **Rojos de UI de la validación (SERIE-VALIDACION-PERFILES P3)**: el selector
  "Los Aromos" de `permisos` y la persistencia de `admin-config` quedaron **cubiertos**
  por `e2e/crud/permisos.spec.ts` y `e2e/crud/admin-configuracion.spec.ts` (lane verde);
  dejan de ser rojos abiertos.
- **Cierre (S2, hecho)**: CI verde del PR #1 en el run `38444800307` + archive de
  `qlab-purga-bulk` (`0f10d47`); el saneamiento quedó **cerrado** con P5 → HECHA en
  `openspec/SERIE-NOCHE-2/00-plan.md`.
- **Archives 2026-10-14 (punto 4, administrativo)**: los dos changes que quedaban aplicados
  sin archivar quedaron archivados — `e2e-guard-optin-ci` (`280d37f`) y
  `au-google-provider-disabled` (`b5a9f42`); gate de deltas 1 ok · 0 a romper en cada uno y
  `openspec validate --all` **36/36**. Deltas verificados tras aplicar: AU scaffold con 13
  escenarios + cláusula de la bandera; SG D-iii con los 3 escenarios del opt-in.

## SERIE-NOCHE-3 — deuda del store (materializada 2026-10-14) — rama `noche/serie-noche-3`

El owner pidió saldar la deuda viva ("punto 4") en modo autónomo y sobre una rama nueva desde
`main`. Queda materializada como serie de ventanas en `openspec/SERIE-NOCHE-3/`
(`00-plan.md` + `prompt-01.md`…`prompt-09.md`, cap duro **9 ventanas**):

| Deuda | Cómo se salda |
|---|---|
| `store-cleanup` (no existía como change) | **P1 HECHA (2026-10-14)** — censo fino por miembro (incluye uso intra-store) + poda de 28 acciones sin consumidor. Censo v2: 180 miembros → 79 app · 71 QA-Lab · 26 solo-test · 2 muerto · 2 intra-store. `lib/store.ts` 8.890 → 7.621 líneas; `STORE_VERSION` 28 intacto. Evidencia: `openspec/changes/store-cleanup/design.md` y `Data/NSGC/docs/avances/avance - 2026-10-14 20-00.md` |
| `st-split-fase2` (0/19) | **P2–P5** — los 7 slices hoja en `lib/store/slices/**`: IR+MT, AD+PI/D3, CO, GE+CV (movimiento puro, `STORE_VERSION` intacto) |
| `api-cobertura-fases` (2.114 statements API sin cubrir) | **P6–P7** — las rutas más bajas + ratchet de `app/api/**` (regla medido − 1 pt) |
| `store-cobertura-fase-b` (1.202 statements del store sin cubrir) | **P8** — tests comportamentales sobre `lib/store/**` + ratchet de `lib/**` |
| Cierre y auditoría | **P9** — gates completos de la serie, archives, PR draft y deuda post-serie declarada |

Estado: **COMPLETA 9/9** — P2–P9 cerradas; PR **#2 mergeado** el 2026-10-15. Detalle por ventana en `openspec/SERIE-NOCHE-3/00-plan.md` (Bitácora).

### Deuda descubierta por `store-cleanup` (2026-10-14)

| Deuda | Detalle |
|---|---|
| **Deriva de prosa en 11 specs vivas** | `FI-finanzas-morosidad`, `CV-visor-mensajes`, `PI-portal-inmobiliario`, `GD-gestion-directiva`, `PL-liquidaciones-remuneraciones`, `CF-configuracion-global`, `PE-personal-servicios`, `MT-mantenimiento-proyectos`, `IR-inventario-recursos`, `IN-infracciones-multas`, `CO-comunicacion-vecinos` y `RA-reservas-amenities` nombran en prosa normativa acciones que P1 podó. El delta de P1 cubre las 3 requirements afectadas de `ST-capa-datos-persistente`; cerrar el resto exige deltas en esas 11 capabilities (fuera del alcance declarado de P1). Inventario exacto: `openspec/changes/store-cleanup/design.md` §Deriva de prosa |
| **`CF_UPDATE_PARAM` sin emisor** | El evento no tiene emisor en el código: su único emisor era `saveConfiguracion` (poda de P1), que la app ya no llamaba, y `app/api/configuracion/route.ts` no lo emite. Gap **preexistente** de la migración CF→API. Requiere decisión del owner: re-implementar la auditoría server-side o retirar el requirement |
| **Deriva en docs NSGC** | `manuales/28 - MK - Catálogo de Mocks.md` (24 acciones), `manuales/33 - ST - Capa de Datos Persistente.md`, `manuales/36 - MK - Data Dump Comunicación y Solicitudes.md` y `manuales/40 - MK - Data Dump Remuneraciones, Certificados y Reportería.md` nombran acciones podadas por P1. P1 solo puede tocar `Data/NSGC/docs/avances/**` (alcance declarado); sincronizar esos manuales requiere una ventana con alcance NSGC. Los avances y auditorías históricos no se corrigen |
| **e2e `poblado-idempotente.spec.ts:96` (caso "cancelar")** | Espera **30 s** el mensaje de purga, pero una purga completa suma **38,7 s** de DELETEs secuenciales medidos en el log del dev server (el test hermano `:29` usa 120 s para la misma espera y documenta la purga como lenta). Falla en este entorno con y sin el cambio de P1 (el flujo es API REST + Prisma, no depende del store). Acción: subir esa espera a 120 s |

> **Cierre verificado 2026-10-21**: las 4 deudas de esta tabla están saldadas. Deriva de prosa y deriva NSGC → 0 menciones de las acciones podadas en `openspec/specs/**` y `Data/NSGC/docs/manuales/**`; `CF_UPDATE_PARAM` → emisor server-side (DEUDA-2 D2); e2e `:96` → espera a 120 s (DEUDA-1 P1). Ver §Deuda viva verificada (2026-10-21) al final del archivo.

## Deuda viva verificada (2026-10-21)

Auditoría contra el árbol de trabajo (no contra las filas históricas de este archivo), después del
merge de DEUDA-5. Series cerradas: NOCHE-3 → PR **#2** merged (2026-10-15) · DEUDA-1 → PR **#3**
merged (2026-10-16) · DEUDA-2/3/4/5 → en `main`.

| Frente | Estado | Desbloquea |
|---|---|---|
| Store legacy en la UI (`useCompassStore`) | **SALDADO** — Fase 1 (SERIE-DEUDA-6, 2026-10-21): 13 archivos / 147 usos → 9 / 131. **Fase 2 (SERIE-FASE2, rama `fase2/inventario-insumos`, 2026-10-22): 9 archivos / 131 usos → 4 / 106, de los cuales 1 es un comentario → uso real 3 archivos / 105 usos = las 3 excepciones justificadas** (QA-Lab, dev-dashboard, mantenimiento). Delta fase 2: −6 archivos / −25 usos (ver §Store legacy: cierre de la fase 2) | Nadie: solo queda retirar el módulo QA/dev antes de producción |
| `au-google-sso` | ⏸ Bloqueado (código 100 % listo) | Owner: `GOOGLE_CLIENT_ID`/`SECRET` en Vercel + 2 decisiones de rol/migración |
| Decisiones de producción (Sentry DSN, pen-test, Ley 21.719, proveedor Postgres, privacidad/abogado, CSP con dominio real, secrets Vercel) | ⏸ Pendientes | Owner |
| Falso positivo `window.open` (`app/comunidad/comunicacion/page.tsx:292`) | Decisión de producto | Owner (allowlist de dominios) |
| Techo 99.95 % de `lib/store.ts` (2 statements inalcanzables) | Aceptado (deuda-2 D4 / deuda-3 D5) | Nadie: por diseño |
| Deriva de prosa (12 specs + 4 manuales NSGC), 2 warnings turbo, `CF_UPDATE_PARAM`, e2e `poblado-idempotente:96` | ✅ Saldado y verificado | — |

**Gates de la verificación (2026-10-21)**: `tsc --noEmit` 0 errores · `eslint` exit 0 ·
`openspec validate --all` 35 passed / 0 failed · 0 menciones de las 20 acciones podadas en
`openspec/specs/**` y `Data/NSGC/docs/manuales/**`.

### Store legacy: mapa de migración (auditoría read-only 2026-10-21)

Casos por archivo (clases: **a** lectura con hook SWR existente · **b** acción con endpoint ya
existente falta cablear hook · **c** acción sin endpoint):

| Archivo | Usos | Clases | Veredicto |
|---|---|---|---|
| `app/comunidad/certificados/page.tsx` | 4 | a (`useLiquidaciones`, `useCobrosFI`) | **MIGRABLE YA** (solo lectura) |
| `app/visor-mensajes/page.tsx` | 2 | c (`caducarAvisosCV` en `setInterval`) | MIGRABLE CON ENDPOINT (o reusar `PUT /api/cv/avisos/[id]`) |
| `app/comunidad/visor/page.tsx` | 2 | c (`publicarActaEnCV`) | MIGRABLE CON ENDPOINT |
| `app/finanzas/gastos-comunes/page.tsx` | 2 | c (`enviarCobranzaFI`) | MIGRABLE CON ENDPOINT |
| `app/inventario/proyectos/page.tsx` | 3 | b (`actualizarPagoTrabajoMT`, `verificarGarantiasMT`: rutas ya existen) | MIGRABLE (cablear hooks) |
| `app/inventario/recursos/page.tsx` | 5 | b/c (entregar solicitud, resolver comodín) | MIGRABLE CON ENDPOINT |
| `app/personas/personal/page.tsx` | 7 | b/c (5 transiciones PE + auditoría) | MIGRABLE CON ENDPOINT |
| `app/admin/reporteria/page.tsx` | 9 | b (generar/distribuir/vista dashboard) | MIGRABLE CON ENDPOINT |
| `app/finanzas/multas/page.tsx` | 7 | b (aplicar/desestimar/apelar IN: rutas ya existen, faltan en `use-in.ts`) | MIGRABLE (cablear hooks) |
| `app/finanzas/remuneraciones/page.tsx` | 4 | a (`useLiquidaciones`) + c (`adelantosPL`) | MIGRABLE CON ENDPOINT |
| `app/admin/qa-lab/page.tsx` | ~100+ | semillas/test/`STORE_VERSION` | **EXCEPCIÓN — NO MIGRAR** |
| `app/admin/dev-dashboard/page.tsx` | ≥2 | diagnóstico sobre `getState()` | **EXCEPCIÓN — NO MIGRAR** |
| `app/admin/mantenimiento/page.tsx` | 4 | backup/seed de localStorage | **EXCEPCIÓN — NO MIGRAR** |

**Endpoints faltantes (8)**: adelantos PL · cobranza FI · caducar avisos CV · publicar acta en CV ·
5 transiciones PE · entregar/resolver solicitud IR (+comodín) · reportes RE generar/distribuir/vista ·
(auditoría PE y eventos). Rutas que **ya existen** y solo requieren hook: IN aplicar/desestimar/apelar,
MT verificar garantías y actualizar pago de trabajo.

**Lotes (riesgo creciente)**: **L1** lectura pura (`certificados`, `visor-mensajes`) → **L2** escritura
no-dinero (`comunidad/visor`, `personal`, `inventario/*`, `reporteria`) → **L3** dinero
(`remuneraciones`, `multas` → cargo FI, `gastos-comunes` → cobranza).

### Store legacy: cierre de la fase 1 (SERIE-DEUDA-6, 2026-10-21)

La serie se ejecutó en **6 ventanas** sobre la rama `noche/deuda-6` (sin push, sin merge, change
`ui-legacy-store-fase1` **aplicado y validado, no archivado**). Censo final medido con
`grep -rno "useCompassStore" app/ | wc -l` en el árbol de la rama: **9 archivos / 131 usos** (base:
`main` en `e8d74d5` → 13 archivos / 147 usos). **Delta real: −4 archivos y −16 usos.**

| Archivo | Usos en `main` | Usos ahora | Ventana | Qué se hizo |
|---|---|---|---|---|
| `app/comunidad/certificados/page.tsx` | 4 | **0** | V1 | Lecturas pasan a `useLiquidaciones()` + `useCobrosFI()` |
| `app/visor-mensajes/page.tsx` | 2 | **0** | V2 | Caducidad por `useAvisosCV().update` + helper puro `avisosVencidos()`; **no hizo falta endpoint nuevo** (reusa `PUT /api/cv/avisos/[id]`) |
| `app/finanzas/multas/page.tsx` | 7 | **0** | V3 | `useInfraccionesIN()` cableado con `aplicar`/`desestimar`/`apelar` (rutas ya existentes) + `useMensajesBuzonCO()` |
| `app/inventario/proyectos/page.tsx` | 3 | **0** | V4 | `verificarGarantiasMT()` nuevo en `lib/api/use-mt.ts` + `update(id, { estadoPago })` de `useTrabajosMT` |
| `app/admin/qa-lab/page.tsx` | 99 | 99 | — | **Excepción justificada** (semillas, `STORE_VERSION`, laboratorio sobre `localStorage`) |
| `app/personas/personal/page.tsx` | 7 | 7 | — | Pendiente fase 2 (5 transiciones PE + auditoría) |
| `app/admin/reporteria/page.tsx` | 6 | 6 | — | Pendiente fase 2 (reportes RE). *La auditoría anotó 9 usos; el conteo real en `main` es 6* |
| `app/inventario/recursos/page.tsx` | 5 | 5 | — | Pendiente fase 2 (entregar/resolver solicitud IR) |
| `app/finanzas/remuneraciones/page.tsx` | 4 | 4 | — | Pendiente fase 2 (adelantos PL) |
| `app/admin/mantenimiento/page.tsx` | 4 | 4 | — | **Excepción justificada** (backup/seed de `localStorage`) |
| `app/finanzas/gastos-comunes/page.tsx` | 2 | 2 | — | Pendiente fase 2 (cobranza FI) |
| `app/comunidad/visor/page.tsx` | 2 | 2 | — | Pendiente fase 2 (publicar acta en CV) |
| `app/admin/dev-dashboard/page.tsx` | 2 | 2 | — | **Excepción justificada** (diagnóstico sobre `getState()`) |

**Deuda fase 2 declarada (26 usos en 6 archivos)** — todos exigen **endpoint nuevo con contrato de
negocio**, por eso no entraron en la fase 1 (que solo cableó rutas ya existentes):

| Frente | Archivo | Qué falta |
|---|---|---|
| Transiciones PE (5) + auditoría PE | `app/personas/personal/page.tsx` | Rutas de transición de estado del personal y su ledger de auditoría |
| Entregar / resolver solicitud IR (+ comodín) | `app/inventario/recursos/page.tsx` | Endpoint de entrega/resolución con descarga de stock transaccional |
| Reportes RE (generar / distribuir / vista dashboard) | `app/admin/reporteria/page.tsx` | Generación y distribución server-side; hoy el listado CRUD ya es API |
| Adelantos PL | `app/finanzas/remuneraciones/page.tsx` | Contrato de adelanto sobre liquidación (impacto en haberes) |
| Cobranza FI | `app/finanzas/gastos-comunes/page.tsx` | Emisión de cobranza con cargo FI (dinero: requiere contrato y authz propios) |
| Publicar acta en CV | `app/comunidad/visor/page.tsx` | Publicación de acta en el visor (genera aviso y evento) |

Deudas menores arrastradas, también fase 2: (1) `useCrudCollection` pagina con `pageSize=100`
(`lib/api/use-crud-collection.ts:98`), límite preexistente compartido con `finanzas/pagos`,
`finanzas/gastos-comunes` y `admin/reporteria`; (2) `Notificacion` no tiene `unidadId`, así que una
difusión al rol la ve toda la comunidad con ese rol; (3) decidir si el residente puede **marcar como
leída** su propia notificación (hoy `PUT /api/notificaciones/[id]` exige `editar`, solo admin).

**Gates del cierre (2026-10-21)**: `npx tsc --noEmit` 0 errores · `npm run lint` 0 problemas ·
suite completa **1388 tests / 136 archivos** con cobertura **94.39 / 85.84 / 93.85** (`lib/**` 99.63,
`lib/store.ts` 99.95) · `openspec validate --all` **36 passed / 0 failed** ·
`check-delta-coverage ui-legacy-store-fase1` **0 que romperían el archive** · `STORE_VERSION = 28`
sin tocar · `prisma/dev.db` y `Data/NSGC/backups/` intactos.

### Store legacy: cierre de la fase 2 (SERIE-FASE2, 2026-10-22)

La fase 2 se ejecutó en **7 ventanas** sobre la rama `fase2/inventario-insumos` (sin push, sin PR, sin
merge; el change `ui-legacy-store-fase1` sigue **aplicado y validado, no archivado**). Ceró la deuda
que la fase 1 declaró: los **6 frentes / 26 usos** que exigían **endpoint nuevo con contrato de
negocio**. Resultado: **9 archivos / 131 usos → 4 archivos / 106 usos**, de los cuales **1 es un
comentario** (`app/finanzas/remuneraciones/page.tsx:5`), es decir **3 archivos / 105 usos = las 3
excepciones justificadas**. **Delta real: −6 archivos / −25 usos** (−26 usos migrados, +1 comentario).

| Archivo | `main` | Ahora | Ventana | Qué se hizo |
|---|---|---|---|---|
| `app/inventario/recursos/page.tsx` | 5 | **0** | V1 (IR) | `POST …/solicitudes-insumo/[id]/entregar` y `…/resolver-comodin`, con descuento de stock en la misma `$transaction`, folio `IR-A-####` server-side e idempotencia por update condicional |
| `app/personas/personal/page.tsx` | 7 | **0** | V2 (PE) | 5 transiciones por API (turno, horas extra, evaluación inmutable, tarea de monitoreo, proyección como aviso sin `EgresoFI`); recursos `pe:cierre_turno` y `pe:evaluacion` |
| `app/admin/reporteria/page.tsx` | 6 | **0** | V3 (RE) | `generar` congela snapshot con número/autor/fecha, `distribuir` publica en el visor con email en outbox, `lectura` y `vistas`; métrica emitidos/distribuidos/leídos |
| `app/finanzas/remuneraciones/page.tsx` | 4 | **1** (comentario) | V4 (PL) | Adelantos con **dos naturalezas** (`anticipo_regular` 100 % sin tope vs `prestamo` 15 % / 45 % conjunto, DT ORD 2676/140), saldo arrastrado y deducción ligada a su liquidación; recurso `pl:adelantos` |
| `app/finanzas/gastos-comunes/page.tsx` | 2 | **0** | V5 (FI) | Cobranza multicanal (visor + email) con interruptor global y por residente, registro auditable por envío e idempotencia `claveEnvio`; recursos `fi:cobranza` y `fi:cobranza:propia` |
| `app/comunidad/visor/page.tsx` | 2 | **0** | V6 (CV) | Acta **por referencia** (`actaId` + visibilidad), despublicable y auditada, con documento enmascarado y texto informativo obligatorio |
| `app/admin/qa-lab/page.tsx` | 99 | 99 | — | **Excepción justificada** (semillas, `STORE_VERSION`, laboratorio sobre `localStorage`) |
| `app/admin/mantenimiento/page.tsx` | 4 | 4 | — | **Excepción justificada** (backup/seed de `localStorage`) |
| `app/admin/dev-dashboard/page.tsx` | 2 | 2 | — | **Excepción justificada** (diagnóstico sobre `getState()`) |

**Los 8 endpoints/contratos declarados faltantes quedaron cerrados**: adelantos PL · cobranza FI ·
publicar acta en CV · 5 transiciones PE (+ auditoría PE) · entregar/resolver solicitud IR (+ comodín) ·
reportes RE generar/distribuir/vista/lectura · y «caducar avisos CV», que la fase 1 ya había resuelto
reusando `PUT /api/cv/avisos/[id]`. Materializados en **19 rutas nuevas** (IR 2, PE 6, RE 4, PL 3,
FI 2, CV 2), 4 rutas existentes modificadas y **4 migraciones aditivas** (RE snapshot, PL adelantos,
FI cobranza multicanal, CV actas por referencia). 106 tests nuevos en 6 archivos.

**Deuda restante declarada al cierre de la fase 2**:

| Frente | Estado | Qué falta |
|---|---|---|
| **SMTP real** | **Decisión tomada**: SMTP propio del dominio | Faltan las **credenciales**. Hoy `CF` tiene los campos (`smtpHost`, `smtpPort`, `smtpUser`, `smtpSecurity`, `smtpFrom`, `smtpFromName`, `smtpBcc`) y **no existe emisor** (0 referencias a `nodemailer`/`sendMail` en `app/` y `lib/`). Todo correo queda en outbox `pendiente` (RE `envios[]`, FI `envios_cobranza_fi`) y **nunca** se reporta como enviado |
| `Notificacion` sin envío real | Abierto | El canal real es el visor interno; no hay push ni correo saliente |
| Módulo QA/dev a retirar antes de producción | Abierto | `admin/qa-lab`, `admin/dev-dashboard` y `admin/mantenimiento` operan sobre `localStorage`; se retiran antes de producción, no se migran |
| Paginación `useCrudCollection` | Arrastrada de fase 1 | `pageSize=100` fijo (`lib/api/use-crud-collection.ts:98`) |
| `Notificacion` sin `unidadId` | Arrastrada de fase 1 | Una difusión al rol la ve toda la comunidad con ese rol |
| Manuales NSGC IR/PE/RE | ✅ **Cerrado (2026-10-22, PR #6)** | `21 - IR`, `18 - PE`, `19 - PE` y `25 - RE` se sincronizaron antes del push; `18 - PE` se volvió a corregir en el PR #9 (escaneo QR). `03 - Trazabilidad` y `00-index` no requerían cambio: no se crearon manuales nuevos |

**Ninguna ventana se marcó BLOQUEADA**: no hubo gate fallido ni decisión faltante; el único fix del
orquestador fue `d10279c` (el cierre de turno se gobierna por `pe:cierre_turno`, no por `pe`).

**Gates del cierre de la fase 2 (2026-10-22, commit `d10279c`)**: `npx tsc --noEmit` **0** ·
`npm run lint` **0 problemas** · `openspec validate --all` **36 passed / 0 failed** · suite completa
observada por el orquestador **146 archivos / 1538 tests / `SUITE_EXIT=0` / 8m50s** ·
`STORE_VERSION = 28` sin tocar · `prisma/dev.db`, `.env*` y `Data/NSGC/backups/` intactos.

## Cierre del 2026-10-22: PRs #7–#9 (saneamiento, candado y escaneo de cédula)

Tres PRs más en `main`, todos con CI verde completo observado (unit, unit-PG, e2e build producción,
rate-limit y preview de Vercel).

| PR | Qué entró |
|---|---|
| **#7** | **Saneamiento de truncamientos**: `components/pe/aviso-truncamiento.tsx` (`LIMITE_SELECT = 100`) aplicado en visitas, contratistas, encomiendas, proveedores y reportería. `grep -rn "slice(0, 100)" app/ components/` → **0**. En proveedores el aviso usa el `total` del **servidor**, porque el recorte venía del `pageSize` de la API, no del cliente |
| **#8** | **Candado `npm run audit:desvios`** (5 reglas, corre en CI **antes** de la suite) + **folio `CT-####` asignado en el servidor** con índice único `(comunidadId, folio)`. En su primera corrida encontró 3 hallazgos reales (comentario de `/api/in/tipos` que declaraba un permiso ya otorgado, y dos truncamientos en gastos comunes) y se corrigieron en vez de silenciarse |
| **#9** | **Escaneo del QR de la cédula** en la bitácora de visitas: webcam (`BarcodeDetector` nativo + `@zxing/browser` MIT como fallback), extracción del RUN, **validación de dígito verificador (módulo 11)**, búsqueda en el padrón y **confirmación del conserje** antes de completar el formulario. Elimina `escaneoDNISimulado`, que inventaba nombre y RUT y los registraba como visita real |

### Candado `audit:desvios` (PR #8)

Corre en cada PR; si aparece el patrón, **el PR no mergea**.

| Regla | Qué caza |
|---|---|
| R1 | recurso de permisos usado en el código y no declarado en la MATRIZ |
| R2 | textos que postengan algo (`desvío`, `solo admin hasta`, `por simplicidad`, `ABAC en UI`) |
| R3 | tests apagados sin justificación (`.skip`, `.todo`, `expect(true)`) |
| R4 | listas recortadas sin aviso (`.slice(0, N)` sin `AvisoTruncamiento`) |
| R5 | `catch` que traga el error y aun así confirma éxito |

Allowlist con **6 excepciones declaradas y motivadas** (`admin:usuarios`, `backup`, `pi`,
`recurso_inexistente`, `notify:residente`, `qa-lab`). Ninguna silenciada.

### Lección del E2E del PR #8

El candado detecta patrones de texto, **no interacciones entre dos cambios correctos**. El folio
server-side (con índice único) y el QA-Lab (que mandaba el folio del store) eran válidos por separado:
juntos producían `409` → la fase 21 del poblamiento caía con «Certificado residencia ausente en BD» →
los 6 tests de poblamiento esperaban «Carga completa OK» y agotaban el tiempo (32-43 min de timeouts).
Fix: el QA-Lab manda folio y código **vacíos** y el servidor numera, igual que ya hacía mantenimiento.
**Diagnóstico**: el log del job viene truncado; lo resolvió el `error-context.md` del artefacto de
Playwright, que nombra la fase y el motivo.

### Deuda viva al cierre del 2026-10-22

**Cuatro construcciones decididas por el owner y aún no implementadas:**

| Frente | Decisión tomada | Estado |
|---|---|---|
| Variación tarifaria en métricas | **Calcularla de verdad** desde las emisiones; si no hay datos, no mostrar número (hoy `+7.2%` está hardcodeado) | ⏳ Pendiente |
| Lectura real de mensajes | Registrar la lectura **al abrir** el mensaje y retirar el botón «simular» (hoy persiste lecturas falsas en la BD) | 🟡 **Endpoint hecho** (`POST /api/co/envios/[id]/leer`) y simulador eliminado (PR #11). Falta decidir **dónde ve el residente sus comunicaciones**: el portal es la vitrina y el visor muestra avisos, así que hoy no hay pantalla donde abrir el mensaje |
| Avisos vencidos y garantías | **Resolver al leer**: el servidor archiva/alerta al servir la lista, sin depender de que alguien abra una pantalla o pulse un botón | ✅ **Hecho (PR #11)**: `GET /api/cv/avisos` archiva vencidos y `GET /api/mt/trabajos` verifica garantías, ambos best-effort y sin N+1 |
| Backup | **Descargar al navegador** con fecha; hoy escribe en el disco del servidor, que en producción es efímero | ⏳ Pendiente |

**Hallazgo corregido en el PR #11 — el «falso positivo» del `window.open` no lo era del todo**: se
validaba el esquema (`http`/`https`) pero **no el destino**, y validar el esquema no impide un redirect a
un sitio ajeno. Se agregó **allowlist de dominios** (origen propio + `supabase.co`/`supabase.in`),
documentada para ampliar cuando se sume otro proveedor de archivos. **Decisión del owner pendiente**: qué
dominios adicionales permitir.

**Deudas que dependen del owner (no de código):** SMTP con credenciales reales · retirar o aislar el
módulo QA/dev antes de producción · `Notificacion` sin `unidadId` (solo si se quiere segmentar por unidad).

**Fixes menores del 2026-10-22 (rama `deuda/fixes-menores`)**: CSV de logs exporta **el filtro completo**
con tope declarado (`LIMITE_EXPORTACION = 5000`) en vez de la página visible; el KPI «Cajas financieras
activas» filtra por `FondoFI.activo`; el visor declara «…y N más» cuando recorta las reservas.
