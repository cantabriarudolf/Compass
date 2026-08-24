# Consolidado de Auditorías — 2026-08-24-b (post-sesiones 23–24)

**Supercede a** [consolidado - 2026-08-24.md](consolidado%20-%202026-08-24.md) (mismo día, previo a las sesiones de implementación).

**Fuentes:**

| Fecha | Tema | Informe (+ adenda 2026-08-24 incorporada en el propio archivo) |
|---|---|---|
| 2026-08-23 | Seguridad (OWASP Top 10 2021) | [auditoria - 2026-08-23 - seguridad.md](auditoria%20-%202026-08-23%20-%20seguridad.md) |
| 2026-08-23 | Validación (Zod) | [auditoria - 2026-08-23 - validacion.md](auditoria%20-%202026-08-23%20-%20validacion.md) |
| 2026-08-24 | Testing (Vitest) | [auditoria - 2026-08-24 - testing.md](auditoria%20-%202026-08-24%20-%20testing.md) |
| — | Specs contrastadas | `AU - Autenticacion y Sesion.md`, `SG - Hardening y Despliegue.md` |

Contexto: Fase 0 mock (`k0mp4ss_fe/apps/web`, Zustand + persist **v10** sobre localStorage). Desde el consolidado anterior se implementó la **Fase A completa** y **parte de B/C** (scaffold de auth propio, RUT módulo 11 + pasaporte con migración v10, secretos fuera de localStorage, umbrales de cobertura).

**Decisiones D1–D6: verificadas como tomadas y aplicadas.** D1 Prisma y D2 Auth.js constan como decisión en SG §Contexto y AU; D3 (`comunidadId`) recogido en AU §4 y SG §C1/C1b; D4 implementado (`lib/rut.ts`); D5 decidido (repetidos permitidos, aviso UI pendiente de implementar); D6 implementado (`lib/store.ts:454-456`). No se listan como pendientes.

---

## 1. Matriz única de hallazgos

21 IDs en 18 filas (VAL-006+TST-002 fusionados). Estados re-verificados contra el código el 2026-08-24 tras las sesiones 23–24.

| IDs | Severidad | Estado | Informe | Ubicación principal | Descripción / estado actual |
|---|---|---|---|---|---|
| SEC-001 | 🔴 Alta | ✅ | Seguridad | `app/api/backup/route.ts`; `app/api/dev-dashboard/route.ts` | APIs de filesystem desactivadas por defecto en producción vía `lib/env-guard.ts` → 404. Re-check manual queda en Fase D (D-iii). |
| SEC-002 | 🔴 Alta | ✅ | Seguridad | `lib/dev-dashboard.ts` (`toggleTask`) | Path traversal corregido con allowlist `/^[A-Za-z0-9][A-Za-z0-9._-]*$/` + check de directorio. Re-check en D-iii. |
| SEC-003 | 🟡 Media | ✅ | Seguridad | `POST /api/backup` | Tope 10 MB en dos capas → `413`. Re-check en D-iii. |
| SEC-004 | 🟡 Media | ✅ | Seguridad | `catch` de ambos route handlers | Mensajes genéricos al cliente; detalle solo en logs del servidor. |
| SEC-005 | 🟡 Media | 🟨 Parcial | Seguridad | `data/admin/configuracion.ts`; `lib/store.ts:646-650`; exports JSON | Secretos en claro en cliente. **Aplicado:** el `partialize` vacía `smtpPassword`/`claveEliminacionMaestro` antes de persistir; UI lo indica. **Pendiente C2-final (SG §1):** traslado a env del servidor y borrado de los campos del schema cliente. Norma vigente: tratar todo export JSON como sensible. |
| SEC-006 | 🟡 Media | 🟨 Parcial (scaffold) | Seguridad | `lib/auth.ts`; `proxy.ts`; `app/ingresar/page.tsx`; `app/api/auth/login|logout` | **Aplicado:** sesión propia sin dependencias (token HMAC-SHA256 + `timingSafeEqual`, cookie `compass_session` httpOnly/lax/secure-prod/30d, rate limit 10 fallos/15 min → 429), guardia `proxy.ts` sobre `/admin/*` y `/api/*` (401 JSON / redirect `/ingresar?next=`), rutas públicas `/ingresar` y `/api/auth`. **Pendiente:** roles/autorización B3 (AU §4, con BD), rate limiting persistente (SG D-v) y reemplazo por Auth.js (AU §3). |
| SEC-007 | 🟢 Baja | ✅ | Seguridad | `app/admin/configuracion/page.tsx` | Log de `CF_UPDATE_PARAM` redactado (`***`). |
| SEC-008 | 🟢 Baja | ✅ | Seguridad | `next.config.mjs` | Headers globales añadidos (`X-Frame-Options: DENY`, nosniff, Referrer-Policy, Permissions-Policy, HSTS). Revisar contra dominio definitivo (D-ii). |
| SEC-009 | ℹ️ Info | ✔️ | Seguridad | `lib/backup.ts`; `lib/dev-dashboard.ts` | Observación positiva (sanitización `fileName`, allowlist lectura). Sin acción. |
| SEC-010 | ℹ️ Info | ⏳ | Seguridad | `next.config.mjs` | Sin CSP estricta (verificado hoy: no hay `Content-Security-Policy`). Pendiente Fase D D-i (nonces/hashes, report-only primero). |
| VAL-001 | 🔴 Alta | ✅ | Validación | `lib/store.ts` (todas las `save*`) | Zod `safeParse` antes de mutar en todas las escrituras. |
| VAL-002 | 🟡 Media | ✅ | Validación | `lib/store.ts` / formularios | Todas las `save*` retornan `StoreResult` visible en UI. |
| VAL-003 | 🟡 Media | ✅ | Validación | `app/admin/qa-lab/page.tsx` | Fixtures normalizados a contratos válidos. |
| VAL-004 | 🟢 Baja | ✅ | Validación | `test/store-eliminaciones.test.ts` | Errores TS corregidos; typecheck OK hoy. |
| VAL-005 | ℹ️ Info | ✅ | Validación | `lib/rut.ts`; `lib/schemas.ts:115-122,248,251`; `lib/store.ts:292-300,737-741` | **Cerrado.** RUT módulo 11 (`calcularDigitoVerificador`) + pasaporte explícito (`esPasaporte`), integrado como `DocumentoIdentidadSchema` en `rut`, `rutCondominio` y `rutAdministrador`. Migración reparadora **v10** (`repararRut`: recalcula DV ficticio del seed histórico antes del saneo, preservando colección personas). Tests: `rut.test.ts` (16) + `rut-migracion.test.ts` (6). |
| VAL-006 + TST-002 | 🟡 Media (efectiva) | ✅ | Validación + Testing | `lib/store.ts:245-285,704-736,742-755` | **Cerrado.** (a) VAL-006: `sanitizarColecciones` aplica `safeParse` por colección (y por maestro) en `migrate` y en `onRehydrateStorage`; colección corrupta se re-siembra sin romper el resto. (b) TST-002: `migrarEstadoUnidades` se reaplica tras el `mergeById` de la rama `<8` (:717) y además rescata stores ya v8 dañados (:734-736). Regresión: `store-fase-a.test.ts` (persistidos v0, v7 semi-legacy y v8 dañado, directo y end-to-end). |
| VAL-007 | ℹ️ Info | 🟦 Cerrado por decisión D5 | Validación | `lib/store.ts` (`upsert`) | El owner decidió **repetidos permitidos con aviso UI**. La unicidad vía `superRefine` queda descartada; en BD será constraint compuesta opcional (SG §C3b). **Derivado pendiente:** el aviso UI de duplicados TU/EF/MP no está implementado (sin referencias en el código) → tarea de Fase C. |
| TST-001 | 🟡 Media | ✅ | Testing | `lib/store.ts:454-456` | **Cerrado con D6 (bloqueo duro):** `saveVinculo` rechaza cuentas `"bloqueada"` sin excepciones. Tests con p-10 y p-54 en `store-fase-a.test.ts`. |
| TST-003 | 🟢 Baja | 🟨 Parcial | Testing | `lib/store.ts`; `test/` | **Parte store ✅:** cobertura añadida en `store-fase-a.test.ts` — `saveMaestro` (agregar/upsert/rechazo esquema/clave desconocida), autosolapamiento mismo rol (rechazo + tramos consecutivos), ramas migrate `<2…<6` (5 tests), eventos `VU_NEW_TENANT` y `VU_DELETE` histórico. **Parte UI ⏳:** componentes/hooks sin RTL ni MSW (dependencias no instaladas) → B4. |
| TST-004 | ℹ️ Info | Observación | Testing | `vitest.config.ts` (provider v8) | Artefacto de atribución multi-archivo. Sigue activo: explica el delta entre la baseline anotada en config y la corrida actual (§2). Sin acción. |

**Resumen: 14 IDs resueltos · 3 parciales (SEC-005, SEC-006, TST-003) · 1 cerrado por decisión con derivado (VAL-007) · 1 abierto (SEC-010) · 2 observaciones (SEC-009, TST-004).**

---

## 2. Verificación cruzada código ↔ documentación

Contraste de lo declarado en AU/SG, adendas y consolidado anterior contra el código real. Verificación ejecutada esta sesión:

```
npm run test      → ✅ 7 archivos, 83/83 tests · cobertura store.ts: 95.51% stmts/líneas · 81.04% branches · 90.32% funcs
npm run typecheck → ✅ tsc --noEmit sin errores
npm run lint      → ✅ 0 errores (68 warnings, solo avisos)
```

| Declaración (fuente) | Evidencia en código | Resultado |
|---|---|---|
| Sesión HMAC-SHA256, `timingSafeEqual`, expiración 30 días (AU §1) | `lib/auth.ts:22-49,90-92` | ✓ |
| Cookie `compass_session` httpOnly, lax, secure en prod, path=/ (AU §1) | `lib/auth.ts:76-86` | ✓ |
| Rate limit 10 fallos/15 min → 429 (AU §1) | `lib/auth.ts:5-6,58-74`; `login/route.ts:21-24` | ✓ (clave: `x-forwarded-for` ?? `"local"`) |
| Fallback dev `admin@compass.local`/`compass-dev`; login siempre falla en prod sin vars; falta `AUTH_SECRET` → 503 (AU §1/§2) | `lib/auth.ts:51-56`; `login/route.ts:18-19,34-37` | ⚠️ **Discrepancia documental (resuelta):** el 503 solo aplica en producción; en dev existe además un fallback de secreto (`auth.ts:16-18`) que AU §2 no documentaba. AU §2 corregida en esta sesión. Comportamiento correcto (fail-closed en prod). |
| Matcher `/admin/:path*` + `/api/:path*`; públicas `/ingresar`, `/api/auth`; 401 JSON / redirect `?next=` (AU §1) | `proxy.ts` | ✓ |
| Logout invalida la cookie (AU §1) | `app/api/auth/logout/route.ts` | ✓ |
| `.env.example` con `AUTH_SECRET`/`ADMIN_EMAIL`/`ADMIN_PASSWORD`/`NEXT_PUBLIC_APP_ENV` (AU §2) | `.env.example` | ✓ |
| Secretos NO persistidos en localStorage (AU §5, SG §2, adenda seguridad) | `partialize` en `lib/store.ts:646-650` | ✓ |
| `lib/rut.ts` módulo 11 + pasaporte en `DocumentoIdentidadSchema`; migración v10 repara DVs históricos (SG §2, adenda validación) | `lib/rut.ts`; `schemas.ts`; `store.ts:292-300,737-741`; `test/rut*.test.ts` | ✓ |
| Umbrales cobertura stmts ≥90 / branches ≥75 / funcs ≥85 / lines ≥90 (SG §2, adenda validación C5) | `vitest.config.ts:22` | ✓ (corrida actual por encima de los cuatro) |
| `NEXT_PUBLIC_APP_ENV`/`APP_ENV` declarados en turbo.json (A5 del consolidado anterior) | `k0mp4ss_fe/turbo.json` (`globalEnv`) | ✓ (A5 hecho) |
| Scaffold propio, Auth.js solo cuando haya BD (AU intro) | `package.json` sin `next-auth` | ✓ |
| Baseline "96.57/83.26/89.65/96.57" comentada en `vitest.config.ts:21` | Corrida 2026-08-24: 95.51/81.04/90.32/95.51 | ⚠️ Informativo: delta explicado por TST-004 (atribución v8). Umbrales cumplidos; la cifra oficial de esta sesión es la de arriba. No se toca código. |
| Aviso UI de duplicados (decisión D5) | Sin implementar (búsqueda de "duplicad" en app/components: 0 resultados) | ⚠️ Derivado pendiente → Fase C |
| CSP estricta pendiente (SEC-010, SG D-i) | `next.config.mjs` sin `Content-Security-Policy` | ✓ coherente con el plan (queda en Fase D) |

---

## 3. Roadmap recalculado (qué queda de verdad pendiente)

### Hecho y verificado (no repetir)

| Fase | Ítems cerrados |
|---|---|
| A completa | A1 fix TST-002 (+rescate v8) · A2 safeParse por colección · A3 bloqueo duro TST-001/D6 · A4 cobertura TST-003-store (`saveMaestro`, ramas `<2…<6`, autosolape, `VU_NEW_TENANT`, `VU_DELETE`) · A5 turbo.json |
| Adelantos de B/C | B2 scaffold auth (SEC-006 parcial, verificado contra AU) · C3 adelantado: VAL-005 RUT+pasaporte + migración v10 · C5 umbrales Vitest · SEC-005 parcial (partialize) |

Nota: el consolidado anterior planificaba un único bump a **v9** para A1+A2; la realidad son **dos bumps** (v9 para el fix TST-002/VAL-006 y v10 para la reparación de RUTs), conforme a la regla permanente SG §4.5 (cada cambio de esquema ⇒ bump + migración reparadora + test). Versión vigente: **v10**.

### Resto de Fase B — Antes de seguir con UI de sesión/auth

| # | Qué | IDs / fuente |
|---|---|---|
| B4 | Cobertura de componentes/hooks con RTL + MSW (≥80% comp., ≥85% hooks). Instalar dependencias. **Debe incluir la página `/ingresar` y el flujo login/logout/proxy**, que existen desde la sesión 24 sin tests de UI | TST-003 (UI), AU |

*(B3 autorización por roles pasa íntegra a Fase C: según AU §4 requiere BD, RP y D3.)*

### Resto de Fase C — Antes de BD (según SG §1)

| # | Qué | Fuente |
|---|---|---|
| C1 | Modelo Prisma con `comunidadId` indexado en toda entidad de dominio; migración inicial desde `lib/schemas.ts` (D1+D3) | SG §1 |
| C1b | Repositorios con scoping obligatorio por `comunidadId` + tests de aislamiento A/B | SG §1, AU §4 |
| C2-final | SMTP y clave de eliminación a env del servidor (`SMTP_PASSWORD`, etc.); borrar campos de `ConfiguracionGlobalSchema` | SG §1, SEC-005 |
| C3b | Constraints de unicidad compuestas opcionales tabla por tabla (D5) | SG §1, VAL-007 |
| C-extra-1 | Aviso UI de duplicados TU/EF/MP (decidido en D5, no implementado) | D5, VAL-007 |
| C-extra-2 | B3: autorización con roles por comunidad (`membresías`), `lib/authz.ts`, scoping solo server-side con tests de aislamiento | AU §4, SEC-006 |
| C-extra-3 | Reemplazo del scaffold por Auth.js: provider credentials + adapter BD, usuarios ligados a MP, rate limit persistente, eliminar fallbacks dev | AU §3 |

### Fase D — Pre-deploy (según SG §3, íntegra)

| # | Qué | Fuente |
|---|---|---|
| D-i | CSP estricta con nonces/hashes; empezar report-only y revisar telemetría | SG §3, SEC-010 |
| D-ii | Headers contra dominio definitivo (HSTS preload, etc.), verificar en securityheaders.com | SG §3, SEC-008 |
| D-iii | Re-chequeos manuales: 413 backup >10MB · 404 con `APP_ENV=production` · 404 path traversal · redirect sin cookie a `/admin/*` · 401 API sin sesión | SG §3, SEC-001/002/003/006 |
| D-iv | Re-auditoría OWASP completa (skill `code-review-security`), nuevo informe registrado; salida exige cero 🔴 abiertos | SG §3 |
| D-v | Rate limiting persistente (BD/Redis) fuera de memoria del proceso | SG §3 |
| D-vi | Backup automático diario de BD + restauración probada | SG §3 |

---

## 4. Contradicciones entre informes/adendas y su resolución

| # | Tensión detectada | Resolución y criterio |
|---|---|---|
| 1 | Consolidado anterior planificaba un único bump a v9 (A2); la implementación real hizo v9 **y** v10 (RUT) | **Prevalece la realidad, y es correcta:** la regla SG §4.5 manda un bump por cada cambio de esquema con su migración reparadora y test; endurecer RUT era un cambio de esquema distinto del fix de unidades. Documentado así para futuras sesiones. |
| 2 | Roadmap anterior ordenaba B4 (RTL) *antes* de tocar formularios de login; la sesión 24 creó `/ingresar` y el flujo auth sin cobertura UI | **Prevalce lo implementado.** El scaffold fue necesario para validar el flujo end-to-end manualmente antes de invertir en RTL. Consecuencia registrada: B4 se amplía para cubrir `/ingresar` + login/logout/proxy; no hay código que rehacer. |
| 3 | Baseline de cobertura comentada en `vitest.config.ts` (96.57/83.26/89.65/96.57) vs corrida actual (95.51/81.04/90.32/95.51) | **No es contradicción: TST-004.** Artefacto de atribución del provider v8 en suites multi-archivo. Umbrales cumplidos; cifra oficial de esta sesión: la de la corrida actual con 83/83 tests. No se modifica código (comentario incluido). |
| 4 | Cifras de tests sucesivas: 34/34 (validación) → 39/39 (testing) → **83/83** (hoy) | **Cronología, no contradicción.** Cifra oficial vigente: 83/83 en 7 archivos. Las anteriores eran snapshots al cierre de cada sesión. |
| 5 | Adenda de validación declara "persistencia v8 respetada… `migrate` sin cambios" y el testing luego demostró el bug TST-002 en esa misma rama | **Ya resuelto en el consolidado anterior (prevalía TST-002) y hoy cerrado:** la frase era declaración de alcance, no de corrección. El bug está corregido y con regresión en `store-fase-a.test.ts`. |
| 6 | AU §2 presenta `AUTH_SECRET` como requerido con 503 si falta, pero el código tiene fallback de secreto en desarrollo | **Discrepancia documental resuelta editando AU §2:** se documenta el fallback dev (`compass-dev-secret-solo-desarrollo`) y se precisa que el 503 aplica solo en producción. Criterio: la spec debe describir el comportamiento real, que es seguro (fail-closed en prod). |
| 7 | Severidades originales (🟡) vs criticidad de despliegue de SEC-005/006 | **Sin cambio (criterio ya fijado en el consolidado anterior):** las severidades describen Fase 0 localhost; la dimensión "bloqueante de fase destino" vive en este roadmap. |

Conclusión: ninguna contradicción sustantiva abierta; las dos correcciones aplicadas fueron documentales (AU §2) o de registro (este consolidado).

---

## 5. Decisiones pendientes del owner

**Ninguna nueva obligatoria.** D1–D6 están tomadas y verificadas como aplicadas (ver encabezado). Los ítems surgidos esta sesión son de ejecución, no de decisión: aviso UI de duplicados (ya decidido en D5, falta implementarlo), cobertura RTL del flujo auth (B4) y la precisión documental de AUTH_SECRET (ya aplicada).

---

## 6. Nota de sesión

Consolidación documental exclusivamente; **sin cambios de código** (única edición fuera de esta carpeta: AU §2, precisiones documentales). Próximo hito sugerido: **B4** (RTL + MSW cubriendo store-hooks UI existentes y el flujo de sesión), único ítem restante de Fase B.
