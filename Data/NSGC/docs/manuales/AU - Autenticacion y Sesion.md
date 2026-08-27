# 🔐 AU - Autenticación y Sesión

Acá gestionás quién entra a Compass y cómo se mantiene su sesión. Desde P5, el login es contra la base de datos con Auth.js (JWT), sin credenciales de entorno.

## 🚀 Funcionalidad Principal

Autenticar usuarios por email + contraseña, mantener sesión segura y limitar intentos de login por IP con rate limit persistente.

## 🛠️ Secciones

- **Login `/ingresar`** (AU §3 P5): formulario email + contraseña. Flujo estándar Auth.js: `GET /api/auth/csrf` → `POST /api/auth/callback/credentials` (form-urlencoded con `csrfToken`, `email`, `password`, `callbackUrl`; header `X-Auth-Return-Redirect: 1`). Respuesta `{url}`: éxito → `url = callbackUrl` (cookie `authjs.session-token` seteada); fallo → `url` con `?error=CredentialsSignin&code=credentials|rate_limited`. Mensajes: "Credenciales inválidas." (genérico, no enumera emails), "Demasiados intentos. Espere unos minutos." (D-v), "Error de conexión…" y "No fue posible iniciar sesión.".

- **Sesión Auth.js (JWT)** (AU §3): `lib/auth.ts` instancia Node (`NextAuth` con provider `Credentials` + adapter Prisma sobre `Usuario` `lib/auth-adapter.ts`; exporta `handlers`/`auth`/`signIn`/`signOut`). Estrategia `jwt` (30 días, `AUTH_SECRET` firma/cifra JWE `A256CBC-HS512`), `pages.signIn = "/ingresar"`, `trustHost: true` (deploy self-hosted). `sub` = `Usuario.id` en BD (vinculable a MP vía `personaId`). `lib/auth.config.ts` edge-safe expone `session.user.id = token.sub` para `proxy.ts` sin Prisma.

- **Guardia de borde `proxy.ts`** (edge): `NextAuth(authConfig).auth()` verifica JWT sin BD. Mismo matcher `/admin/:path*` + `/api/:path*`, públicas `/ingresar` y `/api/auth/*`, resto 401 JSON para `/api` y redirect `/ingresar?next=` para páginas.

- **Usuarios y contraseñas** (AU §3.2, P4 B3 + P5): `Usuario {id cuid, email @unique, personaId? (0..1→MP), activo, passwordHash String? (bcrypt 10)}` y `Membresia {usuarioId, comunidadId, rol}` con `@@unique([usuarioId, comunidadId])` (`prisma/schema.prisma`, migración `20260827140912_authjs_password_ratelimit`). Login exige `activo` y `passwordHash` válido; sin hash o inactivo → "Credenciales inválidas.".

- **Rate limit persistente D-v** (SG §3 D-v): `RateLimitAttempt {id cuid, clave String (IP), createdAt}` con `@@index([clave, createdAt])` + `lib/rate-limit.ts` (`excedeIntentos`, `registrarFallo`, `limpiarIntentos` async, inyectable). 10 fallos/15 min por IP (`x-forwarded-for` ?? `local`, leído desde BD). `authorize` verifica límite **antes** de bcrypt (fail-closed sin leak de timing), registra cada fallo y limpia la clave al éxito; `registrarFallo` borra filas fuera de ventana (tabla acotada). Sobrevive reinicios.

- **Gates server-side** (SG §4.1): `proxy` solo autentica. Autorización fina en handlers vía `auth()` + `puede()` (`lib/authz.ts`): `GET /api/admin/usuarios?comunidadId=` (solo `administrador`, scoping D3, 401/400/403/200) y `POST /api/backup` (solo `administrador` con membresía). Sin fallback `ADMIN_EMAIL`/`ADMIN_PASSWORD` (eliminados en P5).

- **Seed dev / QA Lab** (B3 + P5): `lib/seed-authz.ts:seedUsuariosMembresias()` idempotente crea 2 comunidades (`comunidad-a` Los Aromos TEST, `comunidad-b` Las Palmas TEST) + 5 usuarios TEST (`admin@test.cl` admin en A+B, `comite`/`conserjeria`/`residente`/`mantencion` en A) con `passwordHash` bcrypt (`test1234`, dato de demo documentado). Botón "👥 Crear usuarios TEST" en `/admin/qa-lab` (requiere sesión admin) invoca `POST /api/admin/seed-authz`. **Primer arranque sin usuarios**: `npm run seed:authz` (`scripts/seed-authz.mjs`, PrismaClient+bcryptjs directo, idempotente, lee `.env`).

## 💡 Tips de Oro

- **Fail-closed**: sin `AUTH_SECRET` (≥32 chars en prod) o sin cookie → 401/redirect; usuario inactivo/sin hash → login falla sin distinguir causa (anti-enumeración).
- **No hay credenciales de entorno**: `ADMIN_EMAIL`/`ADMIN_PASSWORD` y el fallback dev de secreto fueron eliminados en P5 (habían sido scaffold AU §1). Todo login es contra BD.
- **Rate limit por IP**: detrás del proxy del owner, `x-forwarded-for` trae la IP real; en dev cae a `local`.
- **Cookie** `authjs.session-token` (dev http) / `__Secure-authjs.session-token` (prod https), httpOnly, lax, JWE cifrado con `AUTH_SECRET`. Tests mintan cookies reales vía `@auth/core/jwt.encode` (`test/helpers/sesion-authjs.ts`).
- **Bootstrap**: si `prisma/dev.db` está vacío, el login es imposible por diseño → correr `npm run seed:authz` una vez, luego `admin@test.cl / test1234`.

## 🔗 Dependencias

- Usuarios vinculados a **MP - Maestro de Personas** (`personaId` opcional, 0..1).
- Roles y permisos en **RP - Roles y Permisos** (`Membresia.rol` + `lib/authz.ts:puede()`).
- Capa de datos en **ST - Capa de Datos Persistente** (`Usuario`/`Membresia`/`RateLimitAttempt` + `lib/prisma.ts` singleton).
- Trazabilidad en **03 - Mapa de Desarrollo y Trazabilidad** y serie en `openspec/SERIE-PLATAFORMA.md` (P5 HECHA).
