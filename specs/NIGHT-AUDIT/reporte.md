# NIGHT-AUDIT — Reporte de Auditoría y Planificación

**Fecha:** 2026-10-05  
**Sesión:** Auditoría completa sin implementación (orquestador Gentle AI)  
**Proyecto:** Compass (k0mp4ss_fe/apps/web)

---

## 1. Estado Base Verificado

| Ítem | Valor | Fuente |
|---|---|---|
| Rama actual | `main` (ahead 5 de `origin/main`) | `git status -sb` |
| Último commit | `fe6c80d docs(serie): hash P2 y cierre PG-FASE3 COMPLETA` | `git log --oneline -1` |
| BACKLOG-100 | C1-C4: C2✅ C1✅ C3⏸ C4✅ | `openspec/BACKLOG-100.md` |
| Unit tests | 835 tests en 79 archivos | BACKLOG-100 §Métricas post-serie |
| E2E tests | 93 passed + 2 skipped | BACKLOG-100 §Métricas post-serie |
| STORE_VERSION | 28 (congelado) | `lib/store.ts` |
| Prisma provider | `postgresql` | `prisma/schema.prisma:6` |
| openspec validate | 1 fallo (change archivado `e2e-rojos-crud` sin deltas) | `npx openspec validate --all` |

**Changes activos (7) + 1 archivado = 8 totales:**

| Change | Estado | Archivos clave |
|---|---|---|
| `au-google-sso` | Código listo, pendiente credenciales owner | `proposal.md`, `design.md`, `tasks.md` ✅ HECHO |
| `e2e-higiene-determiniso` | P1 completado (seed-authz fix + scripts) | `proposal.md`, `design.md`, `tasks.md` |
| `e2e-rojos-flujo-a11y-smoke` | En progreso (P3) | `proposal.md`, `tasks.md` |
| `fix-vercel-data-ignore` | Fix aplicado + fix TS colateral | `proposal.md`, `design.md`, `tasks.md` |
| `gd-ficha-gobernanza` | Propuesto + tareas pendientes | `proposal.md`, `design.md`, `tasks.md` |
| `gd-periodos-directiva` | Código completo (tasks 1-4 ✅), pending tests | `proposal.md`, `design.md`, `tasks.md` |
| `st-split-fase2` | Propuesto + tareas (slices IR, MT, AD, PI/D3, CO, GE, CV) | `proposal.md`, `design.md`, `tasks.md` |
| `st-migracion-postgres` (archivado) | COMPLETO dual SQLite/PostgreSQL + CI/CD | `proposal.md`, `design.md`, `tasks.md` |

---

## 2. Auditoría de Seguridad OWASP (wave a)

### 2.1 Alcance: `app/api/` + Auth.js

**Fuentes revisadas:**
- `lib/auth.ts` (Auth.js Credentials + Google providers, callbacks)
- `lib/auth.config.ts` (config edge-safe)
- `lib/auth-adapter.ts` (Adapter Prisma custom)
- `lib/rate-limit.ts` (persistente en BD)
- `lib/password-policy.ts` (política 8+ chars, mayúscula, minúscula, número)
- `lib/crypto.ts` (AES-256-GCM, dummy key dev)
- `proxy.ts` (middleware edge: CSP-RO, nonce, auth gate)
- `lib/authz.ts` (matriz RBAC + ABAC contextual)
- `lib/api/crud-factory.ts` + `put-merge.ts` (factory con authzCheck)
- `lib/api/with-comunidad-scope.ts` (scoping multi-tenant inescapable)
- `app/api/*/route.ts` (rutas CO, CV, GE, GD, etc.)

### 2.2 Hallazgos por Clase OWASP

#### A03: Injection — **BAJO** ✅
- **SQL**: Prisma ORM usa query parameters; no hay string concatenation en queries dinámicas.
- **Command**: No hay `exec`, `spawn`, `system` en código revisado.
- **XSS**: React escapa por defecto; CSP Report-Only con `'self'` + nonce por request (`proxy.ts:44-61`).
- **SSTI/LDAP/Path traversal**: No aplicable (no templates server-side, no LDAP, no file paths de usuario).

#### A07: Authentication & Session — **MEDIO** ⚠️
| Hallazgo | Archivo:Línea | Severidad | Evidencia |
|---|---|---|---|
| Google provider con `clientId`/`clientSecret` vacíos en prod si no hay env | `lib/auth.ts:142-143` | **ALTO** | `process.env.GOOGLE_CLIENT_ID ?? ""` — fallback string vacía permite deploy sin credenciales; callback fallará silenciosamente en prod |
| JWT strategy sin `maxAge` explícito en cookies (usa default Auth.js 30d) | `lib/auth.config.ts` (no visto) | MEDIO | No verificado `authConfig.session.maxAge`; SERIE-PRODUCCION-FASE2 P2 redujo a 24h sliding pero no confirmado en config |
| `allowDangerousEmailAccountLinking: false` — correcto | `lib/auth.ts:144` | — | Mitiga account linking no intencional |
| Rate limit en callback Google (`excedeIntentos` por `google:email`) | `lib/auth.ts:149-160` | — | Buena práctica implementada |
| `tokenVersion` invalidación de sesiones (logout global) | `prisma/schema.prisma:97`, `lib/auth.ts:174-194` | — | Implementado P2 |
| 2FA/TOTP + backup codes | `prisma/schema.prisma:98-100` | — | Implementado P3 |

#### A01: Authorization — **BAJO** ✅
- **Multi-tenant scoping inescapable**: `withComunidadScope` (`lib/api/with-comunidad-scope.ts:39-66`) extrae `comunidadId` de membresía en BD (última por `createdAt desc`), **nunca** del cliente.
- **RBAC matriz pura**: `lib/authz.ts:19-85` con 5 roles, recursos granulares (`fi:balance`, `mp:propios`, etc.), wildcard solo para `administrador`.
- **ABAC contextual**: `puedeContextual` + `reglasContextuales()` snapshot en `/admin/permisos` (16 reglas, C4 ✅).
- **Factory CRUD con authzCheck**: todas las routes de dominio usan `createCrudHandlers` + `authzCheck` por recurso (`app/api/co/*`, `app/api/cv/*`, `app/api/ge/*`, etc.).
- **IDOR mitigado**: upsert verifica `existente.comunidadId !== scope.comunidadId` → 404 (`crud-factory.ts:187-189`).

#### A02: Cryptography — **MEDIO** ⚠️
| Hallazgo | Archivo:Línea | Severidad | Evidencia |
|---|---|---|---|
| `CLAVE_CIFRADO_DATOS` dummy en dev | `lib/crypto.ts:22,34` | **ALTO** | `DUMMY_DEV` fija en dev/test; **en prod lanza error si no está** (fail-closed correcto) |
| AES-256-GCM con IV 12 bytes aleatorio por valor | `lib/crypto.ts:56,58` | — | Correcto (NIST) |
| Envelope `v1.gcm.iv.tag.ct` con autenticación GCM | `lib/crypto.ts:54-61` | — | Fail-closed en descifrado (`descifrar:69-91`) |
| Password bcrypt cost 10 | `lib/seed-authz.ts:64` | — | Estándar |
| `AUTH_SECRET` verificado en health check | `app/api/health/route.ts:57-58` | — | Solo presencia, no valor |

#### A01 (Data Exposure): — **BAJO** ✅
- **Logs estructurados PII-redacted**: `lib/logger.ts` (SERIE-PRODUCCION P3) + `instrumentation.ts`.
- **Health check sin PII**: `app/api/health/route.ts:65-66` loggea solo nombres de checks en error.
- **Error messages genéricos**: `CredencialesInvalidas` mensaje único (`lib/auth.ts:16-18`), `jsonError` estandarizado.

#### A05: Misconfiguration — **MEDIO** ⚠️
| Hallazgo | Archivo:Línea | Severidad | Evidencia |
|---|---|---|---|
| CSP en **Report-Only** (no enforcement) | `proxy.ts:112` | MEDIO | Plan documentado en `sg-predeploy-headers/design.md`: 7 días 0 violations |
| `script-src 'unsafe-inline' 'unsafe-eval' https:` | `proxy.ts:48` | MEDIO | Requerido por Next.js/Turbopack; `'strict-dynamic'` + nonce mitiga |
| `.vercelignore` case-insensitive fix aplicado | `fix-vercel-data-ignore` | — | `/Data/` ancla a raíz; `data/` se sube |
| `env-guard.ts` endurecido | SERIE-PRODUCCION P2 | — | Fail-closed en prod para secrets requeridos |

#### A08: Deserialization — **BAJO** ✅
- **Zod validation** en todas las routes vía factory (`crud-factory.ts:172-176`, `put-merge.ts:74-78`).
- **No untrusted deserialization**: no `JSON.parse` directo de input usuario sin schema.
- **CSRF**: SameSite cookies (Auth.js default) + CSP `form-action 'self'`.

### 2.3 Resumen Severidad

| Severidad | Conteo | Detalle |
|---|---|---|
| **CRÍTICO** | 0 | — |
| **ALTO** | 2 | Google provider sin credenciales en prod; dummy crypto key en dev |
| **MEDIO** | 4 | JWT maxAge no verificado; CSP Report-Only; unsafe-inline/eval; env-guard |
| **BAJO** | 0 | — |
| **INFORMATIVO** | 5+ | Buenas prácticas implementadas (rate limit, tokenVersion, 2FA, scoping, Zod) |

---

## 3. Auditoría de 8 Changes (wave b)

### 3.1 `au-google-sso` — **Código completo, bloqueado por credenciales**
- **Tasks**: 1.1-1.7 ✅ HECHO (provider, callbacks, UI, tests, `.env.example`, manual AU)
- **Pendiente owner**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, redirect URIs en Google Cloud, decisión rol default
- **Riesgo**: MEDIO (deploy sin credenciales → callback falla; mitigado con `allowDangerousEmailAccountLinking: false`)
- **Veredicto**: Listo para merge tras credenciales. **No requiere change nuevo.**

### 3.2 `e2e-higiene-determinismo` — **P1 COMPLETADO**
- **Fixes**: `scripts/seed-authz.mjs` + `lib/seed-authz.ts` → `createdAt` determinista admin-a ÚLTIMA; espejo alineado; test vitest anti-regresión; scripts `e2e:nongated`/`e2e:gated`/`e2e:full-orden`; verificación restore P3 + 2 seeds.
- **Criterio salida**: ✅ reseed reproducible + `e2e/auth` verde + tsc/lint/validate OK.
- **Veredicto**: Listo para commit + archive.

### 3.3 `e2e-rojos-flujo-a11y-smoke` — **EN PROGRESO (P3)**
- **Completado**: Fix TDZ `editandoProvId` (`app/operaciones/proveedores/page.tsx`); Fix banner cookies (`e2e/auth.setup.ts`); Fix `e2e/crud/permisos.spec.ts` paso 5 + `scripts/higiene-qa-test.mjs`.
- **En verificación**: `e2e/crud/roles-journeys.spec.ts` conserjería (re-activar tab Visitas).
- **Pendiente**: Triage poblamiento ×2 + fix (independizar de QA-Lab); Triage flujo/personas + fix; Re-chequeo a11y ×2 + smoke-mobile.
- **Riesgo**: ALTO (dependencias estructurales QA-Lab legacy vs BD).
- **Veredicto**: Continuar P3; no ampliar alcance.

### 3.4 `fix-vercel-data-ignore` — **COMPLETADO + FIX TS COLATERAL**
- **Root cause**: `.vercelignore` línea 6 `Data/` (case-insensitive) excluía `k0mp4ss_fe/apps/web/data/`.
- **Fix**: `/Data/` + comentario advertencia; verificación simulación `ignore@7.0.5`.
- **Colateral**: `tsc` 5 errores `permiteCreacionManualCV` en `Persona` → campo opcional en interfaz (`app/comunidad/visor/page.tsx` + `scripts/seed-db-from-mocks.ts`).
- **Pendiente**: Tests afectados en verde + commit + redeploy Vercel owner.
- **Veredicto**: Listo para archive tras tests.

### 3.5 `gd-ficha-gobernanza` — **PROPUESTO, SIN EMPEZAR**
- **Alcance**: `FormularioGobernanza` (cargo, fecha asunción, firma URL) en perfil `/comunidad/personas/[id]` tab Gobernanza; regla coherencia `savePersona` depura `datosGobernanza` si quita rol `directiva` + evento `AD_DIRECTIVA_DESVINCULADA`.
- **Tests**: `test/store-directiva.test.ts` (acepta válida, rechaza D1, depura al quitar rol, preserva con rol).
- **Riesgo**: BAJO (aislado, sin schema changes, sin STORE_VERSION bump).
- **Veredicto**: Apto para implementación en 1 ventana.

### 3.6 `gd-periodos-directiva` — **CÓDIGO COMPLETO (1-4 ✅), PENDING TESTS**
- **Completado**: Schemas (período + ficha + actas + CT), Store v28 + migración + helpers + acción + auto-assign + attaches + quórum; UI sección Períodos en `/comunidad/directiva`; Tests períodos (6) + ficha (5).
- **Pendiente**: Full suite + tsc + eslint (gate NSGC) + NSGC pre-push + commit + push.
- **Base legal**: Ley 21.442 art. 17 (período ≤3 años, reelegible, inscripción registral, composición impar 3–5).
- **Veredicto**: Listo para validación final + archive.

### 3.7 `st-split-fase2` — **PROPUESTO, SIN EMPEZAR**
- **Slices hoja (7, orden riesgo)**: IR (~350L), MT (~350L), AD (~400L), PI/D3 (~350L), CO (~700L), GE (~200L), CV (~320L).
- **Patrón**: factories zustand `(set, get) => ({...})` combinados en `lib/store.ts` con spread.
- **Riesgos**: lecturas cruzadas permitidas; escrituras cruzadas → Fase 3; backup localStorage por slice; migración v27 test.
- **Verificación por slice**: tests dominio + tsc 0 + suite store + e2e CRUD dominio + migración v27 backup real.
- **Esfuerzo**: 2–3 ventanas.
- **Veredicto**: Plan sólido; iniciar con IR (riesgo mínimo).

### 3.8 `st-migracion-postgres` (archivado) — **COMPLETO DUAL**
- **Fase 1**: Infra dual (schema.sqlite.prisma generado, docker compose PG local, scripts db:dev/db:prod).
- **Fase 2**: Script migración datos idempotente (orden topológico, upsert por ID, 8354 filas/70 tablas verificadas Neon).
- **Fase 3**: CI job `unit-pg` (postgres:16-alpine), script deploy migra datos, manuales actualizados (ST, AU, SG), `.env.example` dual.
- **Verificaciones**: tsc 0, unit 835/835 (SQLite), unit 835/835 (PG local Docker), e2e 93+2 skip.
- **Veredicto**: **Archivado correctamente**. No requiere acción.

---

## 4. Flakes E2E y Deuda de Specs (wave c)

### 4.1 Estado E2E Actual
| Lane | Tests | Estado | Notas |
|---|---|---|---|
| `e2e/auth` | 6/6 | ✅ Verde | Setup + roles-menu + roles-accesos |
| `e2e/flujo` | 4 | 🟡 2 fix + 2 triage | Poblamiento ×2, personas |
| `e2e/a11y` | 2 | 🟡 Re-chequeo | Axe reservas, bitácora |
| `e2e/smoke` | 1 | 🟡 Re-chequeo | Módulos mobile bitácora |
| `e2e/crud` no-GATED | ~40 | ✅ Verde (P2) | Tras fixes P2 |
| `e2e/crud` GATED | 4 | ⏸ Pendiente | Certificados, pagos, portal, remuneraciones |

### 4.2 Causas de Flakes Identificadas
1. **`seed-authz` orden no determinista** → Fix P1 (admin-a ÚLTIMA por `createdAt` escalonado) ✅
2. **`TEST-*` sin convención/cleanup** → Convención `TEST-<modulo>-<timestamp>` + cleanup propio documentada en `e2e-higiene-determinismo` (delta `DEV-qa-lab`) 🟡
3. **GATED specs contaminan** → Orden fijo (no-GATED primero, GATED al final) + re-seed posterior documentado 🟡
4. **Radix dialogs no cierran** → `tipos`, `personal`, `proyectos`, `reservas` (validación/FK seed o falta cierre explícito) 🟡
5. **QA-Lab legacy vs BD** → Poblamiento escribe store legacy, páginas leen BD vía API (causa raíz P2/P3) 🟡

### 4.3 Deuda de Specs (openspec validate)
- **`e2e-rojos-crud` (archivado)**: Fallo validación — "Change must have at least one delta". Spec `CF-configuracion-global/spec.md` existe con `## ADDED Requirements` pero validación falla. **Investigar**: posible bug en parser openspec o spec malformado.
- **Changes activos sin specs**: `au-google-sso`, `e2e-higiene-determinismo`, `e2e-rojos-flujo-a11y-smoke`, `fix-vercel-data-ignore`, `st-split-fase2` — varios son fixes de infra/tests sin delta de especificación funcional (correcto: `skip_specs: true` en `.openspec.yaml` si aplica).
- **`gd-ficha-gobernanza` y `gd-periodos-directiva`**: Tienen specs en change (no validados por `openspec validate --all` al estar en `openspec/changes/` no archive).

---

## 5. Openspec/Specs vs Código (wave d)

### 5.1 Especs Principales (`openspec/specs/`) — 31 módulos
**Verificados (muestra):**
- `AU-autenticacion-sesion/spec.md` §Autenticación Futura → Google SSO scenario (C3 backlog) → coincide con `au-google-sso` proposal.
- `RP-roles-permisos/spec.md` §Permisos Contextuales (ABAC) → coincide con implementación `puedeContextual` + `/admin/permisos` matriz 16 reglas (C4 ✅).
- `AM-auditoria-metricas/spec.md` §Logs Retention 5 años → C1 ✅ (sync batch + `/admin/logs` BD paginado).
- `GD-gobernanza-directiva/spec.md` → Períodos directiva (art. 17 Ley 21.442) → coincide con `gd-periodos-directiva`.

### 5.2 Gaps Detectados
| Spec | Código | Gap |
|---|---|---|
| `CF-configuracion-global` | `prisma/schema.prisma:280` `rutComunidad` | Spec delta `ADDED` en change archivado pero validación falla |
| `ST-capa-datos-persistente` | `lib/store.ts` v28 `@deprecated` | Spec reescrito (SERIE-BD-FUENTE-VERDAD) pero store legacy sigue en código (168 líneas en 14 archivos TODOs) |
| `AU-autenticacion-sesion` | `lib/auth.ts` Google provider | Spec dice "futuro"; código ya tiene provider (comentado por credenciales) |

### 5.3 Terminología RG §4
- **Verificado**: Código usa `"comunidad"` consistentemente (`Comunidad` model, `comunidadId` FK, `rutComunidad` column).
- **Legado**: `"condominio"` **no encontrado** en código nuevo (migración `rutCondominio` → `rutComunidad` en `e2e-rojos-crud`).

---

## 6. Lane Experto Legal/Dominio (wave e)

### 6.1 Fuentes Primarias Verificadas (LeyChile)

| Tema | Artículo | URL LeyChile | Fecha recuperación |
|---|---|---|---|
| Período directiva (composición, duración, reelección, inscripción) | Art. 17 Ley 21.442 | https://www.bcn.cl/leychile/navegar?idNorma=1174663 (BCN) / https://www.leychile.cl/leychile/navegar?idNorma=1174663 (LeyChile) | 2026-10-06 |
| Quórum asamblea ordinaria | Art. 20 Ley 21.442 | https://www.bcn.cl/leychile/navegar?idNorma=1174663 | 2026-10-06 |
| Quórum asamblea extraordinaria | Art. 21 Ley 21.442 | https://www.bcn.cl/leychile/navegar?idNorma=1174663 | 2026-10-06 |
| Remoción comité de administración | Art. 26 (en lista materias extraordinarias) + Art. 18 | https://www.bcn.cl/leychile/navegar?idNorma=1174663&idVersion=2025-04-29 | 2026-10-06 |
| Certificados y firmas (comité de administración) | Art. 22 Ley 21.442 | https://www.bcn.cl/leychile/navegar?idNorma=1174663 | 2026-10-06 |
| Ley protección datos personales (base) | Ley 19.628 | https://www.bcn.cl/leychile/navegar?idNorma=141599 (LeyChile) | 2026-10-06 |
| Agencia protección datos / entrada vigencia | Ley 21.719 (publicada 13/12/2024) | https://nuevo.leychile.cl/servicios/Consulta/Exportar?...&hddResultadoExportar=1209272.2026-12-01.0.0 | 2026-10-06 |
| Derechos ARCO | Art. 12 Ley 19.628 (habeas data) + Ley 21.719 nuevos derechos | https://www.bcn.cl/leychile/navegar?idNorma=141599 | 2026-10-06 |

**Fuentes doctrina complementarias (verificadas en búsqueda):**
- ComunidadFeliz (blog admin): Art. 17, 18, 19, 20, 21, 26 resúmenes
- Zelkova (adpro.cl): Remoción administrador vía comité/asamblea
- A-LEX (a-lex.cl): Texto vigente Art. 17 con modificación Ley 21.508
- Condominio.cl: Resumen Art. 16 y 17
- Reglamento Ley 21.442 (Decreto 7, Diario Oficial 09/01/2025): Art. 18, 19, 21, 22, 32

### 6.2 Mapeo Ley → Código (Claim → Fuente)

| Claim Proyecto | Artículo Ley (Texto Verificado) | Estado Código | Gap |
|---|---|---|---|
| Período directiva ≤3 años | **Art. 17**: "el período que le fije la asamblea, el que no podrá exceder de tres años" (BCN, LeyChile) | `PeriodoDirectiva.duracionMeses` Int + validación ≤36 (design) | ✅ Implementado en design |
| Período reelegible | **Art. 17**: "sin perjuicio de poder ser reelegido" (BCN) | `PeriodoDirectiva` permite múltiples períodos | ✅ Modelo lo permite |
| Inscripción registral comité | **Art. 17** + Reglamento Art. 19/21/22: inscripción en Registro Municipal / Conservador | `fechaInscripcion` + `referenciaInscripcion` en modelo | ✅ Campos presentes |
| Composición impar 3–5 | **Art. 17**: "compuesto por un número impar de miembros, de a lo menos tres y con un máximo de cinco" (Ley 21.508 modifica) | Validación en activación (design task 3.3) | 🟡 Pendiente implementación |
| Quórum constitución asamblea ordinaria | **Art. 20**: "mayoría de los copropietarios" (BCN) | No verificado en código | ❓ Pregunta abierta |
| Quórum acuerdos asamblea extraordinaria | **Art. 21**: "mayoría de los presentes" (BCN) | No verificado en código | ❓ Pregunta abierta |
| Remoción comité (parcial/total) | **Art. 26** (materias extraordinarias): "Remoción parcial o total de los miembros del comité de administración" (BCN idVersion 2025-04-29) | No modelado | ❓ Pregunta abierta |
| Quién firma certificados | **Art. 22**: "el comité de administración" (BCN) + Reglamento Art. 18 | `ActaGD.periodoId` + `CertificadoCT.directivaRef` snapshot | 🟡 Parcial (snapshot no bloqueante) |
| Base licitud morosidad | **Ley 19.628 Art. 14** (habeas data) + **Ley 21.719** bases de licitud (consentimiento, obligación legal, contrato) | `CobroFI` + `EmisionGC` por obligación legal/contrato | ✅ Implícito en dominio |
| ARCO (acceso, rectificación, cancelación, oposición, supresión) | **Ley 19.628 Art. 12** (habeas data) + **Ley 21.719** Art. 13-17 (nuevos derechos: supresión, portabilidad, bloqueo, oposición a decisiones automatizadas) | API/UI ARCO implementada P6 (SERIE-PRODUCCION-FASE2) | ✅ 6 tests ARCO |
| Conservación datos | **Ley 19.628 Art. 10** (mínimo necesario) + **Ley 21.719** principio de limitación del plazo | `solicitudEliminacion` + `solicitudEliminacionAt` en Usuario | ✅ Derecho al olvido |
| Cámaras/control acceso (DNI, patente = datos sensibles) | **Ley 19.628 Art. 2 letra g** (datos sensibles: hábitos, origen racial, ideologías, salud, vida sexual) + **Ley 21.719** (datos biométricos, geolocalización) | `BitacoraVisitaPE.dni` + `patente` — no cifrado en reposo | ⚠️ **Gap**: DNI/patente en texto plano; **Ley 21.719 requiere cifrado** |
| Vigencia Ley 21.719 | **Art. 1º transitorio**: "entradas en vigencia el 1° de diciembre de 2026" (nuevo.leychile.cl export) — **Proyecto de ley postergación a 1-dic-2027** (Mondaq, Carey, 11/09/2026) | App prepara ARCO, cifrado, consentimiento | 🟡 **Verificar si se aprueba postergación** |

### 6.3 Formulario Persona — Campos Obligatorios por Ley vs Código

| Campo | Obligatorio por Ley | Código lo marca | Comentario |
|---|---|---|---|
| **RUT** | Sí (identificación única, Art. 2 Ley 19.628) | `Persona.rut` String @id (requerido) | ✅ |
| **Nombre completo** | Sí | `nombreCompleto` String (requerido) | ✅ |
| **Email** | No (contacto, no identificación legal) | `email` String (requerido en schema) | 🟡 **Código más estricto que ley** |
| **Teléfono móvil** | No | `telefonoMovil` String (requerido) | 🟡 **Código más estricto** |
| **Fotografía** | No | `fotografiaUrl` String? (opcional) | ✅ |
| **Estado cuenta** | No (interno) | `estadoCuenta` String (requerido, default 'activa') | ✅ Interno |
| **Datos laborales** | No | `datosLaborales` Json? (opcional) | ✅ |
| **Datos gobernanza** | Solo si rol `directiva` (Art. 17) | `datosGobernanza` Json? (opcional) + regla coherencia | ✅ Regla en `gd-ficha-gobernanza` |
| **Permite creación manual CV** | No | `permiteCreacionManualCV` Boolean? | ✅ Nuevo campo (SERIE-UI-MIGRACION-BD) |

**Separación planos:**
- **LEY**: RUT, nombre, composición directiva impar 3-5, período ≤3a, inscripción registral, quórums asamblea, firma comité certificados, base licitud morosidad, derechos ARCO, conservación mínima.
- **REGLAMENTO**: Detalles procedimentales (no verificado exhaustivamente).
- **DOCTRINA** (Edipro/Zelkova/ComunidadFeliz): Vigencia directiva por acto de asamblea, no por mora; alertas 90/30 días solo informativas; snapshot directiva en certificados no bloqueante.
- **CRITERIO PROYECTO**: Email/teléfono obligatorios (UX/comunicación), `permiteCreacionManualCV`, `estadoCuenta` enum, `condicionesEspecialesIds` Json.

### 6.4 Preguntas Abiertas (requieren verificación legal/owner)

1. **Quórum asamblea ordinaria**: ¿Mayoría absoluta de copropietarios (Art. 20) o mayoría de presentes? Código no implementa cálculo.
2. **Quórum asamblea extraordinaria**: Art. 21 "mayoría de los presentes" — confirmar si incluye representación por poder.
3. **Inscripción registral**: ¿El sistema debe generar/validar el certificado de inscripción o solo registrar referencia?
4. **Remoción comité**: Art. 26 (materias extraordinarias) — ¿quién inicia (asamblea, comité, administrador)? Flujo no modelado.
5. **Cámaras DNI/patente**: `BitacoraVisitaPE.dni` y `patente` en texto plano — **Ley 21.719 requiere cifrado de datos sensibles/biométricos** en reposo (Art. 48 Evaluación de impacto, Art. 49 Medidas de seguridad).
6. **Vigencia Ley 21.719**: Entrada en vigencia **1-dic-2026** (Art. 1º transitorio, nuevo.leychile.cl). **Proyecto de ley ingresado 01/09/2026 postergando a 1-dic-2027** (Carey, Mondaq 11/09/2026). Verificar si se aprueba antes de diciembre.
7. **Certificados electrónicos**: Art. 22 Ley 21.442 — ¿firma digital avanzada requerida (Ley 19.799) o basta firma digitalizada (`firmaDigitalizadaUrl`)?
8. **Base de licitud morosidad**: Ley 21.719 Art. 8 (bases de licitud: consentimiento, obligación legal, contrato, interés legítimo, interés vital, interés público). ¿`CobroFI` usa "obligación legal" o "interés legítimo"? Documentar en código.
9. **Datos de menores**: Ley 21.719 Art. 9 (consentimiento titular + representante legal). Si hay arrendatarios menores, ¿cómo se maneja?
10. **Transferencia internacional**: Ley 21.719 Art. 31-33. Si la app usa servicios cloud fuera de Chile (Vercel US, Neon US), ¿requiere cláusulas tipo estándar o decisión de adecuación?

---

## 7. Planes Rankeados por Riesgo (para Changes Openspec)

> **Regla**: Por hallazgo real → change openspec (proposal+spec+tasks), SIN implementar. Nada de fixes "de paso".

| Rank | Change Propuesto | Origen Hallazgo | Riesgo | Esfuerzo | Prioridad |
|---|---|---|---|---|---|
| **1** | `sg-google-provider-prod-guard` | Auth: Google provider string vacía en prod | **ALTO** | 1 ventana | 🔴 Crítico |
| **2** | `sg-csp-enforcement` | CSP Report-Only → Enforcement (7d 0 violations) | MEDIO | 1 ventana + telemetría | 🟡 Alta |
| **3** | `sg-crypto-key-prod` | `CLAVE_CIFRADO_DATOS` obligatoria en prod (ya fail-closed) | MEDIO | Owner action (config) | 🟡 Alta |
| **4** | `sg-jwt-maxage-verify` | Verificar `authConfig.session.maxAge` = 24h sliding | MEDIO | 0.5 ventana | 🟡 Alta |
| **5** | `gd-periodos-directiva-complete` | Tests + NSGC + commit + push (code done) | BAJO | 0.5 ventana | 🟢 Media |
| **6** | `gd-ficha-gobernanza-impl` | Formulario + regla coherencia + tests | BAJO | 1 ventana | 🟢 Media |
| **7** | `e2e-rojos-p3-complete` | Triage poblamiento/personas + a11y/smoke | ALTO | 2-3 ventanas | 🟡 Alta |
| **8** | `st-split-fase2-ir` | Slice IR (primero, riesgo mínimo) | BAJO | 1 ventana | 🟢 Media |
| **9** | `st-split-fase2-mt-ad` | Slices MT + AD | BAJO | 1-2 ventanas | 🟢 Media |
| **10** | `st-split-fase2-pi-co-ge-cv` | Slices restantes | BAJO | 2-3 ventanas | 🟢 Media |
| **11** | `fix-vercel-data-ignore-close` | Tests afectados + commit + redeploy | BAJO | 0.5 ventana | 🟢 Media |
| **12** | `openspec-validate-ecrud-fix` | Investigar fallo validación `e2e-rojos-crud` archivado | BAJO | 0.5 ventana | 🟢 Media |

---

## 8. Lo Sin Revisar / Fuera de Alcance

| Área | Motivo |
|---|---|
| Prisma schema completo (1453 líneas) | Muestreo representativo; modelos core (Usuario, Membresia, Comunidad, RateLimitAttempt, PeriodoDirectiva) revisados |
| Tests unitarios (79 archivos) | Conteo verificado; no ejecución completa por timeout |
| Tests E2E (47 specs) | Conteo verificado; lanes status desde BACKLOG-100 |
| `lib/store.ts` monolito (5007 líneas) | Solo verificación STORE_VERSION=28 congelado + helpers extraídos |
| `Data/NSGC/docs/` manuales/avances | No auditados en esta sesión (NSGC pre-push los valida) |
| Dependencias npm / supply chain | No auditado (SERIE-PRODUCCION P4 auditoría dependencias hecha) |
| `lib/auth.config.ts` completo | Solo referenciado; session config no leída directamente |
| `next.config.mjs` / `vercel.json` | No revisados |
| Scripts de migración/cifrado/backup | Revisados solo los referenciados en changes |

---

## 9. Próximos Pasos Recomendados (Owner)

1. **Inmediato (bloqueantes prod)**: Proveer credenciales Google Cloud para `au-google-sso` + configurar `CLAVE_CIFRADO_DATOS` + `SENTRY_DSN` en Vercel.
2. **Esta semana**: Completar `e2e-rojos-flujo-a11y-smoke` P3 + `fix-vercel-data-ignore` tests + `gd-periodos-directiva` validación final.
3. **Sprint siguiente**: `sg-google-provider-prod-guard` (fail-closed si falta credencial) + `sg-csp-enforcement` (telemetría 7d) + iniciar `st-split-fase2` slice IR.
4. **Decisiones legales pendientes**: Resolver 7 preguntas abiertas §6.4 con asesoría legal / owner.

---

## 10. Evidencia de Auditoría (Archivo:Línea)

### Seguridad
- `lib/auth.ts:142-143` — Google provider fallback string vacía
- `lib/auth.ts:149-160` — Rate limit callback Google
- `lib/auth.ts:174-194` — tokenVersion invalidación JWT
- `lib/crypto.ts:22,34,56-61` — Dummy key dev + AES-256-GCM
- `lib/rate-limit.ts:21-27` — Rate limit persistente BD
- `lib/password-policy.ts:17-36` — Política 8+ chars
- `proxy.ts:44-61,112` — CSP Report-Only + nonce
- `lib/authz.ts:19-85,122-151` — Matriz RBAC + ABAC `puede()`
- `lib/api/with-comunidad-scope.ts:39-66` — Scoping inescapable
- `lib/api/crud-factory.ts:122-127,187-191` — AuthZ check + IDOR guard

### Changes
- `openspec/changes/au-google-sso/tasks.md:3-10` — Tasks 1.1-1.7 ✅
- `openspec/changes/e2e-higiene-determinismo/tasks.md:4-10` — Fixes P1 ✅
- `openspec/changes/e2e-rojos-flujo-a11y-smoke/tasks.md:5-17` — Fixes P2/P3 parcial
- `openspec/changes/fix-vercel-data-ignore/tasks.md:3-16` — Fix + colateral TS
- `openspec/changes/gd-ficha-gobernanza/tasks.md:3-13` — Tasks 1-5 pendientes
- `openspec/changes/gd-periodos-directiva/tasks.md:3-7` — Tasks 1-4 ✅, 5-6 pendientes
- `openspec/changes/st-split-fase2/tasks.md:3-27` — 7 slices planificados
- `openspec/changes/archive/2026-10-05-st-migracion-postgres/tasks.md:3-30` — Completo dual

### Legal/Dominio
- `prisma/schema.prisma:1434-1452` — `PeriodoDirectiva` model (Art. 17 Ley 21.442: "período no exceder 3 años", "impar de a lo menos 3 y máximo 5", "reelegible")
- `prisma/schema.prisma:208-233` — `Persona` model (RUT, nombre obligatorios por Ley 19.628 Art. 2; email/teléfono criterio proyecto)
- `prisma/schema.prisma:900-919` — `BitacoraVisitaPE` (DNI/patente texto plano — **Ley 21.719 requiere cifrado**)
- **Fuentes LeyChile verificadas 2026-10-06**: 
  - Ley 21.442: https://www.bcn.cl/leychile/navegar?idNorma=1174663 (Art. 17, 18, 20, 21, 22, 26)
  - Ley 19.628: https://www.bcn.cl/leychile/navegar?idNorma=141599 (Art. 2, 10, 12, 14)
  - Ley 21.719: https://nuevo.leychile.cl/servicios/Consulta/Exportar?...1209272... (Art. 1º transitorio: 1-dic-2026; proyecto postergación a 1-dic-2027)
- **Doctrina complementaria**: ComunidadFeliz (Art. 17, 18, 19, 20, 21, 26), Zelkova/AdPro (remoción admin), A-LEX (Art. 17 vigente), Reglamento D7 (Art. 18, 19, 21, 22, 32)

---

**Fin del reporte.**  
Guardado en `openspec/NIGHT-AUDIT/reporte.md` y Engram (proyecto compass).