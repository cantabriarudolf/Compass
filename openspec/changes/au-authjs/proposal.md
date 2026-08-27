# Proposal: au-authjs — P5 Auth.js (credentials + Prisma) y rate limit persistente (D-v)

## Why
P4 cerró la autorización B3 pero la autenticación sigue siendo el scaffold propio de AU §1: token HMAC artesanal en `lib/auth.ts`, cookie `compass_session`, credenciales de entorno `ADMIN_EMAIL`/`ADMIN_PASSWORD` con fallback dev, y rate limit en memoria (`Map`) que se pierde al reiniciar el proceso. `AU - Autenticacion y Sesion.md §3` (pasos 1–5, obligatorios) y `SG - Hardening y Despliegue.md §3 D-v` exigen, ahora que existe BD (P2): mover emisión/verificación de sesión a Auth.js (`next-auth@beta`, provider credentials + adapter de BD), `proxy.ts` usando `auth()`, usuarios en BD vinculados a MP con `sub` = id de `Usuario`, rate limiting persistente, eliminar credenciales de entorno y actualizar los tests que mockean `compass_session`. STORE_VERSION permanece 26 (sin bump esquema cliente).

## What Changes
- **Auth.js v5 (`next-auth@beta`)**: configuración dividida — `lib/auth.config.ts` (edge-safe: estrategia JWT, maxAge 30 días, `pages.signIn = "/ingresar"`, callbacks session que exponen `user.id = token.sub`) y `lib/auth.ts` (instancia Node con provider Credentials + adapter Prisma custom sobre `Usuario`, exporta `handlers`/`auth`/`signIn`/`signOut`). Rutas Auth.js en `app/api/auth/[...nextauth]/route.ts` (`/api/auth/*`: csrf, session, signin, signout, callback, providers, error). Cookie de sesión pasa a `authjs.session-token` (JWE firmado/cifrado con `AUTH_SECRET`; `__Secure-` en https).
- **proxy.ts (edge)**: usa `auth()` (instancia edge-safe sin Prisma) en lugar de `verificarToken`; mismo matcher `/admin/:path*` + `/api/:path*`, mismas rutas públicas (`/ingresar`, `/api/auth`), mantiene 401 JSON para `/api` y redirect `/ingresar?next=` para páginas.
- **Login `/ingresar`**: flujo estándar Auth.js credentials (GET `/api/auth/csrf` → POST `/api/auth/callback/credentials` con `X-Auth-Return-Redirect`). `authorize()` valida email+password contra `Usuario.passwordHash` (bcrypt), exige `activo`, `sub` = id de `Usuario` en BD. Erroles vía subclases de `CredentialsSignin` con `code`: `credentials` (inválidas/inactivo) y `rate_limited` (límite D-v). Se eliminan `ADMIN_EMAIL`, `ADMIN_PASSWORD`, el fallback dev de secreto y `credencialesValidas`; `AUTH_SECRET` se mantiene (lo usa Auth.js).
- **D-v rate limit persistente**: modelo Prisma `RateLimitAttempt {id, clave, createdAt}` + `lib/rate-limit.ts` (async, inyectable): 10 fallos/15 min por IP (`x-forwarded-for` ?? `local`) leídos desde BD, cleanup oportunista de filas expiradas. Reemplaza el `Map` en memoria de `lib/auth.ts`.
- **Prisma**: `Usuario.passwordHash String?` (migración `authjs_password_ratelimit`); seed `seedUsuariosMembresias` asigna hash bcrypt a los 5 usuarios TEST (password TEST documentada) y queda idempotente; bootstrap CLI `npm run seed:authz` (`scripts/seed-authz.mjs`) para primer arranque sin usuarios.
- **Consumidores de sesión**: `GET /api/admin/usuarios`, `POST /api/backup` y `POST /api/admin/seed-authz` pasan de `verificarToken(cookie)` a `await auth()` (lookup por `Usuario.id` = `sub`); se elimina el fallback "admin legado" (sin credenciales de entorno ya no existe). Portal inmobiliario lee la respuesta Auth.js de `/api/auth/session` (`{user}` | `null`). Se eliminan las rutas propias `app/api/auth/{login,logout,session}` (las cubre Auth.js).
- **Tests**: nuevo helper `test/helpers/sesion-authjs.ts` (minta cookie de sesión real vía `@auth/core/jwt`); rewrite de `test/auth/{proxy,api-auth,lib-auth}.test.ts`, `test/auth/ingresar-page.test.tsx` (MSW contra `/api/auth/csrf` + `/api/auth/callback/credentials`), `test/api-admin-usuarios.test.ts` y `test/api-backup-authz.test.ts` (mock `next/headers`); nuevo `test/auth/rate-limit.test.ts`. Sin `compass_session` en el repo (grep limpio).
- **Deltas de spec**: `AU-autenticacion-sesion` MODIFIED (scaffold §1 → Auth.js §3; seed con password; tests al nuevo mecanismo) + ADDED (login /ingresar credentials, rate limit persistente D-v). `project.md` actualiza fila AU a implementado con Auth.js.

## Capabilities
### Modified Capabilities
- `AU-autenticacion-sesion`: sustituye el scaffold §1 por Auth.js v5 (JWT + credentials + adapter Prisma sobre `Usuario`), login `/ingresar` contra Auth.js, rate limit persistente en BD (D-v), sin credenciales de entorno; autorización B3 (modelos, `puede()`, endpoints) permanece intacta.

### New Capabilities
<!-- none -->

## Impact
- `k0mp4ss_fe/apps/web/package.json` (+ `next-auth@beta`, `bcryptjs`; sin `@auth/prisma-adapter` — ver Design: el adapter oficial exige modelos `User`/`Account`/`Session` que no existen; se implementa el contrato `Adapter` directamente sobre `Usuario` con Prisma)
- `k0mp4ss_fe/apps/web/lib/auth.config.ts` (nuevo edge-safe), `lib/auth.ts` (reescrito: instancia NextAuth + authorize), `lib/auth-adapter.ts` (nuevo), `lib/rate-limit.ts` (nuevo), `lib/seed-authz.ts` (passwordHash)
- `k0mp4ss_fe/apps/web/prisma/schema.prisma` + `prisma/migrations/*_authjs_password_ratelimit/` (`Usuario.passwordHash`, `RateLimitAttempt`)
- `k0mp4ss_fe/apps/web/proxy.ts` (auth() edge), `app/ingresar/page.tsx` (flujo credentials), `app/api/auth/[...nextauth]/route.ts` (nuevo), elimina `app/api/auth/{login,logout,session}/route.ts`
- `k0mp4ss_fe/apps/web/app/api/admin/usuarios/route.ts`, `app/api/backup/route.ts`, `app/api/admin/seed-authz/route.ts` (auth() + sin fallback legado), `app/comunidad/portal/page.tsx` (forma de sesión Auth.js)
- `k0mp4ss_fe/apps/web/scripts/seed-authz.mjs` (nuevo bootstrap) + `.env`/`.env.example` (sin ADMIN_*, + AUTH_TRUST_HOST doc)
- Tests: `test/helpers/sesion-authjs.ts` (nuevo), `test/auth/proxy.test.ts`, `test/auth/api-auth.test.ts`, `test/auth/lib-auth.test.ts`, `test/auth/rate-limit.test.ts` (nuevo), `test/auth/ingresar-page.test.tsx`, `test/api-admin-usuarios.test.ts`, `test/api-backup-authz.test.ts`
- `openspec/specs/AU-autenticacion-sesion/spec.md` (al archivar) + `openspec/specs/project.md`
- Sin bump `STORE_VERSION` (26). Validaciones: `npx tsc --noEmit`, `npm run lint`, `npm test` verde, `npx prisma migrate dev` limpio, `openspec validate --all` sin fallos.
