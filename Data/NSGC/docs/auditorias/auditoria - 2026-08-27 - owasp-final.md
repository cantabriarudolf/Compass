# 🔒 Auditoría OWASP Final — Re-auditoría D-iv (P7)

**Fecha:** 2026-08-27
**Ventana:** P7 (D-iv re-auditoría OWASP + D-vi backups)
**Skill:** `code-review-security` (OWASP Top 10 2021 / ASVS v5.0)
**Base de hechos:** SG §3 D-iv — criterio de salida: CERO hallazgos 🔴 abiertos.

---

## 1. Alcance

Código vigente en `k0mp4ss_fe/apps/web` (rama main, base 86ac98e):

| Área | Archivos auditados |
|---|---|
| Auth Auth.js (P5) | `lib/auth.ts`, `lib/auth.config.ts`, `lib/auth-adapter.ts`, `app/api/auth/[...nextauth]/route.ts`, `app/ingresar/page.tsx` |
| Proxy / middleware | `proxy.ts` (authn + CSP-RO + nonce) |
| Route handlers `/api/*` | `backup`, `admin/usuarios`, `admin/seed-authz`, `dev-dashboard`, `csp-report` |
| Secrets / env | `.env.example`, `lib/env-guard.ts`, `lib/store.ts` (partialize/migrate v26), `prisma/schema.prisma` |
| Headers | `next.config.mjs` (securityHeaders + allowedDevOrigins) |
| Exposición store cliente | `lib/store.ts` (persist/partialize/migrate v25→v26) |
| Prisma / repos scoping | `lib/prisma.ts`, `lib/repos/index.ts` (scoping comunidadId), `prisma/migrations/*` |
| Inyección / validación | `lib/schemas.ts` (Zod), handlers (validación manual), `lib/backup.ts`, `lib/dev-dashboard.ts` (allowlists), `lib/rate-limit.ts` |
| Auditoría previa | `consolidado - 2026-08-24-b.md` (SEC-001..SEC-010) — re-verificación de cierre |

Método: revisión sistemática por clase de vulnerabilidad (A03 inyección, A07 auth/sesión, A01 authz, A02 cripto, A01 exposición de datos, A05 misconfig, A08 deserialización) + re-chequeo de los 10 hallazgos del consolidado 2026-08-24-b.

---

## 2. Hallazgos

| ID | Severidad | Estado | Ubicación | Descripción |
|---|---|---|---|---|
| **SEC-011** | 🔴 Alta | ✅ **Corregido (P7)** | `lib/auth.ts:19-21,36-50` | **Rate limit D-v derivable por spoofing de XFF.** `claveIp()` usaba el header `x-forwarded-for` completo como única clave del límite 10 fallos/15 min. El header lo controla el cliente cuando no hay proxy que lo normalice (o el primer hop es cliente-controlado): un atacante rota `X-Forwarded-For` en cada request y **evade el único control anti-fuerza bruta** de `/api/auth/callback/credentials`, con rate limit persistente (D-v) en BD que no ayuda porque cada IP nueva abre contador nuevo. Escenario: brute force a `admin@comunidad.cl` con 1M intentos sin jamás alcanzar 10 fallos por clave. |
| **SEC-012** | 🟡 Media | ✅ **Corregido (P7)** | `lib/auth.ts:41-48` | **Enumeración de usuarios por timing.** Cuando el email no existía en BD se saltaba `bcrypt.compare` (respuesta ~80-100ms más rápida). Los mensajes ya eran genéricos (sin fuga semántica), pero el timing filtraba existencia del email. |
| **SEC-013** | 🟡 Media | ✅ **Corregido (P7)** | `app/api/admin/seed-authz/route.ts:38-39` | **GET con side effects.** `GET /api/admin/seed-authz` delegaba a `POST()` y ejecutaba el seed. Autenticado como admin era seguro en práctica (idempotente, requiere sesión admin), pero viola semántica de métodos seguros (RFC 9110): un prefetch/crawler/escaneo con cookie admin dispara mutaciones. Solo `qa-lab` usa POST. |
| **SEC-014** | 🟡 Media | 🟨 **Pendiente documentado** | `proxy.ts:31` | **CSP-RO con `unsafe-eval` `unsafe-inline` `https:` en script-src.** Es Report-Only por diseño (D-i, P6): el plan de enforcement exige 7 días de telemetría sin violations y ya está documentado en el manual SG §Plan de activación. Con `'strict-dynamic'` los navegadores modernos ignoran `unsafe-inline`/`https:`, pero `unsafe-eval` aplica de verdad. **No es 🔴:** no bloquea nada hoy (report-only), el plan de remoción existe y está pautado post-P7 en deploy real. Condición para cerrar: enforcement activado (proxy emite `Content-Security-Policy` con `'nonce-{x}' 'strict-dynamic'` sin unsafe-*) tras ventana de telemetría limpia. |
| **SEC-015** | ℹ️ Info | ✅ Verificado | `app/api/csp-report/route.ts` + `proxy.ts:10` | El sink `/api/csp-report` queda tras el guardia de proxy (401 sin sesión) y el CSP-RO **no emite `report-uri`/`report-to`**, así que el navegador nunca le postea: es sink manual de dev. Sin riesgo (superficie 401-cerrada), solo nota para no malinterpretar telemetría. |
| **SEC-016** | ℹ️ Info | ✅ Aceptado | `lib/auth.ts:19-23` | `claveIp()` toma el primer hop del XFF: sigue siendo spoofable como clave IP (documentado), pero SEC-011 lo neutraliza al agregar la clave `email:` no-spoofable. La IP mantiene valor para ataques amplios distribuidos. Documentado en `.env.example`: el proxy de deploy debe normalizar `x-forwarded-*`. |

### Re-verificación del consolidado 2026-08-24-b (SEC-001..SEC-010)

| ID | Estado en código vigente |
|---|---|
| SEC-001 ✅ | APIs filesystem desactivadas en prod (`isWriteApiEnabled` → 404 en backup + dev-dashboard GET/POST/PUT/PATCH) — re-chequeo 2/5 OK |
| SEC-002 ✅ | Path traversal: `SAFE_CHANGE_ID` + `ALLOWED_FILE_PREFIXES` + `toggleTask` → null — re-chequeo 3/5 OK |
| SEC-003 ✅ | 413 >10MB doble capa — re-chequeo 1/5 OK |
| SEC-004 ✅ | Mensajes genéricos en handlers; detalle solo en logs server-side |
| SEC-005 ✅ | Cerrado en P3 (C2-final): secretos fuera del schema cliente, migrate v25→v26 los elimina — tests `store-secretos-migracion` |
| SEC-006 ✅ | Cerrado en P5: Auth.js reemplazó la sesión propia; sin credenciales de entorno |
| SEC-007 ✅ | Log CF_UPDATE_PARAM redactado |
| SEC-008 ✅ | Headers P6 completos (HSTS sin preload, COOP/CORP/COEP, etc.) |
| SEC-010 (ajena a OWASP) | Traza no-security, fuera de alcance de esta auditoría |

---

## 3. Acciones aplicadas en esta sesión

### SEC-011 (🔴→✅) — Rate limit por DOBLE clave: IP + email

`lib/auth.ts` — `autorizarCredenciales` ahora evalúa y registra el límite sobre dos claves:

```ts
const claves = [claveIp(request), `email:${email}`]
for (const clave of claves) {
  if (await excedeIntentos(clave)) throw new LimiteIntentos()
}
// ...
if (!usuario || !usuario.activo || !usuario.passwordHash || !hashValido) {
  for (const clave of claves) await registrarFallo(clave)
  throw new CredencialesInvalidas()
}
for (const clave of claves) await limpiarIntentos(clave)
```

La clave `email:{email}` es no-spoofable al atacar una cuenta concreta: rotar IPs **no reinicia** el contador de la víctima. La clave IP se conserva para ataques amplios. Efecto colateral aceptable y documentado: el rate limit por email también frena distribuidos dirigidos a una cuenta.

### SEC-012 (🟡→✅) — Timing constante contra hash dummy

`lib/auth.ts` — comparación SIEMPRE contra un hash bcrypt (real o dummy cost-10):

```ts
const HASH_DUMMY = "$2a$10$..." // hash de password inexistente, cost 10
const hash = usuario?.passwordHash ?? HASH_DUMMY
const hashValido = await bcrypt.compare(password, hash)
```

Elimina la rama rápida "usuario no existe": tanto existir como no existir cuestan un `bcrypt.compare`. La guarda `!usuario.passwordHash` mantiene el rechazo para usuarios sin hash.

### SEC-013 (🟡→✅) — Seed solo POST

`app/api/admin/seed-authz/route.ts` — eliminado `export async function GET()`. Next responde 405 automáticamente para GET; único consumidor (`qa-lab`) ya usaba POST.

### Tests regresivos (2 nuevos + 1 extendido)

- `test/auth/api-auth.test.ts` — **"D-iv SEC-011: rotar x-forwarded-for NO evade el rate limit (clave por email)"**: 10 fallos contra la misma cuenta con 10 IPs distintas → contador `email:` acumula 10 → 11º intento con credenciales CORRECTAS e IP nueva → `rate_limited` sin cookie de sesión (timeout 30s: 11 logins completos).
- `test/auth/api-auth.test.ts` — **"D-iv SEC-012: usuario inexistente → mismo error y fallos persistidos en ambas claves"**: email fantasma → mismo `code=credentials` que password errónea (sin rama de timing) + fallo registrado en clave IP y clave `email:`.
- `test/auth/lib-auth.test.ts` — **"no exporta secretos"** extendido: `seed-authz` export solo `POST`, `GET` undefined (SEC-013).

---

## 4. Pendientes

| ID | Condición para abordar |
|---|---|
| SEC-014 (CSP enforcement) | Post-P7 en deploy real: 7 días Report-Only sin violations en `/`, `/ingresar`, `/admin/*`, `/visor-mensajes` (con/sin youtube) → cambiar a `Content-Security-Policy` con `'nonce-{x}' 'strict-dynamic'` sin `unsafe-inline`/`unsafe-eval`. Plan completo en manual SG §Plan de activación CSP. Fuera de alcance P7 (exige dominio + tráfico real). |
| Proxy normalización XFF | Al definir dominio/deploy: el proxy inverso del owner debe sobreescribir `x-forwarded-*` (ya documentado en `.env.example` y manual AU). Con proxy normalizador la clave IP vuelve a ser confiable además de la clave email. |
| DB gestionada en prod (D-vi) | Runbook escrito en manual SG §Backups de BD; proveedor y schedule del owner (fuera de alcance). `restore:db` se autobloquea con APP_ENV=production. |

---

## 5. Controles positivos verificados (sin hallazgo)

- **Authn**: bcrypt cost 10; mensajes genéricos sin enumeración semántica; CSRF double-submit de Auth.js (test "sin csrf → rechazado"); JWT 30d con decisión documentada (AU §3); `trustHost` self-hosted documentado; rate limit persistente en BD `RateLimitAttempt` (sobrevive reinicios).
- **Proxy fail-closed**: `/admin` sin sesión → redirect `/ingresar?next=`; `/api` sin sesión → 401 JSON; cookie inválida/firmada con otro secreto → rechazada (tests proxy 5/5); nonce CSP por request vía `crypto.randomUUID`.
- **Authz**: matriz `puede()` pura (RP 5 roles); gates server-side en TODOS los handlers `/api/admin/*` y `/api/backup`; scoping obligatorio `comunidadId` en `crearRepositorio()` (C1b) con 66 modelos; membresía verificada por comunidad (cross-tenant → 403).
- **Secrets (C2-final)**: partialize persiste `configuracion` sin secretos (ya no existen en schema cliente); migrate v25→v26 purga legado (tests store-secretos-migracion); `.env`/`.env.*` gitignored salvo `.env.example` (sin valores reales); AUTH_SECRET solo env.
- **Inyección**: Prisma parameterized en todo el repo; sin `$queryRawUnsafe` con input de usuario (solo `PRAGMA wal_checkpoint` constante en scripts de BD); Zod `safeParse` en todas las escrituras del store (SEC/VAL del consolidado re-verificado).
- **Filesystem**: `saveBackup` sanitiza `fileName` sin separadores (sin traversal); `readProjectFile` allowlist de prefijos; `toggleTask` regex segura; límite 10MB doble capa.
- **Headers**: X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, HSTS includeSubDomains sin preload, COOP same-origin, CORP same-origin, COEP credentialless, X-Permitted-Cross-Domain-Policies none.

---

## 6. Verificación

| Comando | Resultado |
|---|---|
| `npm run typecheck` (tsc --noEmit) | ✅ sin errores |
| `npm run lint` | ✅ 0 errores (239 warnings pre-existentes de estilo) |
| `npm test` (vitest + coverage) | ✅ **412/412** (410 previos + 2 regresivos nuevos), 37 archivos |
| `node scripts/security-recheck.mjs` | ✅ 5/5 OK |
| `npm run backup:db` / `npm run restore:db` | ✅ backup 69 tablas · restore verificado (0 divergencias, fila de prueba eliminada) — runbook en manual SG |
| `openspec validate --all` | ✅ 32/32 specs |

**Salida D-iv: CERO hallazgos 🔴 abiertos** (SEC-011 corregido y testeado; SEC-014 🟡 pendiente con plan de enforcement pautado y condición explícita).
