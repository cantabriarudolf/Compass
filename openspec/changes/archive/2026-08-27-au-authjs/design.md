# Design: au-authjs — Auth.js v5 sobre Usuario/Membresia (P4) + D-v

## Contexto
- `next-auth@5.0.0-beta.32` (única vía de instalar Auth.js v5; no existe estable). `@auth/prisma-adapter@2.11.3` instalado para evaluación: **NO admite mapeo de modelos** (requiere `User`/`Account`/`Session`/`VerificationToken` con `emailVerified`/`name`/`image`), incompatible con `Usuario`/`Membresia` de P4 y con renombrar modelos ya migrados. Decisión: implementar el contrato `Adapter` de Auth.js directamente sobre Prisma/`Usuario` (`lib/auth-adapter.ts`); se desinstala `@auth/prisma-adapter`. Con estrategia JWT + solo credentials el adapter queda inactivo en el flujo (Auth.js no lo invoca), pero satisface AU §3.1 "adapter de BD" y deja el terreno listo para OAuth sin duplicar modelos. Desviación documentada en proposal/reporte.
- Estrategia de sesión **JWT** (explícita): `proxy.ts` corre en Edge y NO puede importar Prisma; con JWT la verificación es decodificación JWE local (sin BD). El adapter vive solo en la instancia Node (`lib/auth.ts` → route handlers/server). La combinación adapter+JWT es soportada (init.js: `strategy: config.session.strategy` explícito gana al default "database" cuando hay adapter).
- `AUTH_SECRET` se mantiene (Auth.js lo lee; deriva la llave JWE HKDF por cookie/salt). `trustHost: true` explícito (deploy self-hosted del owner; Auth.js en producción no confía en Host por defecto).

## Arquitectura
```
lib/auth.config.ts   (edge-safe: strategy jwt 30d, pages.signIn /ingresar,
                      callbacks.session → session.user.id = token.sub)
lib/auth.ts          (Node: NextAuth({...authConfig, adapter: AdapterPrismaCompass(),
                      providers: [Credentials({authorize})]}) → handlers/auth/signIn/signOut)
app/api/auth/[...nextauth]/route.ts   (export {GET, POST} = handlers)
proxy.ts             (edge: NextAuth(authConfig).auth((req) => ...reglas de ruta...))
lib/rate-limit.ts    (D-v: excedeIntentos/registrarFallo/limpiarIntentos async con Prisma)
lib/auth-adapter.ts  (contrato Adapter sobre Usuario: getUserByEmail/getUser/updateUser/
                      deleteUser/createUser; Account/Session/VerificationToken → no-op/null
                      por ausencia de OAuth; documentado)
scripts/seed-authz.mjs (bootstrap idempotente sin server: 2 comunidades + 5 usuarios TEST
                      con passwordHash bcrypt; espejo de lib/seed-authz.ts)
```

## Decisiones clave
1. **Login cliente (`/ingresar`)**: flujo manual estándar Auth.js — GET `/api/auth/csrf` → POST `/api/auth/callback/credentials` (form-urlencoded, header `X-Auth-Return-Redirect: 1`). Con ese header, Auth.js responde `{url}` JSON: éxito → `url` = callbackUrl (cookie de sesión en Set-Cookie); fallo → `url` = `/ingresar?error=CredentialsSignin&code=<code>`. Se evita `next-auth/react` (beta): `signIn()` añade un roundtrip a `/api/auth/providers`, semántica de error variable entre betas y dependencia de `__NEXTAUTH` internals; el flujo manual es el mismo contrato HTTP, testeable con MSW y conserva los mensajes de P1 ("Credenciales inválidas.", "Demasiados intentos…", "Error de conexión…", "No fue posible iniciar sesión.").
2. **Códigos de error**: subclases de `CredentialsSignin` (export público de `next-auth`) con `code`: `CredencialesInvalidas` → `code = "credentials"` (default; cubre password errónea, usuario inexistente, inactivo o sin hash — mensaje genérico para no enumerar emails) y `LimiteIntentos` → `code = "rate_limited"`. El cliente mapea `code` → mensaje. Auth.js los propaga como query params en `url`.
3. **sub = Usuario.id** (AU §3.2): `authorize` retorna `{id: usuario.id, email}`; el JWT lleva `sub` = id. `callbacks.session` expone `session.user.id`. Las rutas server-side hacen lookup directo por `Usuario.id` (antes buscaban por email).
4. **Rate limit D-v**: `RateLimitAttempt {id, clave, createdAt}` + índice `(clave, createdAt)`. `authorize` extrae IP (`x-forwarded-for` ?? `local`), consulta `excedeIntentos` ANTES de validar credenciales (fail-closed sin timing leak de bcrypt), registra fallo en cada credencial inválida y limpia la clave al éxito. `registrarFallo` borra filas expiradas (>15 min) de forma oportunista (tabla acotada). Inyectable (`client?: PrismaClient`) para tests, igual patrón que `seed-authz`.
5. **Passwords**: `bcryptjs` (puro JS, sin build nativo). `Usuario.passwordHash String?` (migración aditiva; usuarios existentes quedan sin password → login fail-closed hasta re-seed). Seed TEST usa password documentada `test1234` para los 5 usuarios (dato de demo en BD, no credencial de entorno).
6. **Bootstrap**: con auth estricta, un BD vacío no permite login ni seed vía API (correcto, fail-closed). Primer arranque: `npm run seed:authz` (scripts/seed-authz.mjs, PrismaClient+bcryptjs directos, idempotente). qa-lab mantiene su botón (re-seed exige sesión admin).
7. **Cookie**: nombre default Auth.js `authjs.session-token` (httpOnly, lax, `__Secure-` + secure en https). El mecanismo cambia (HMAC propio → JWE Auth.js); los tests mintan cookies reales con `@auth/core/jwt` `encode({token, secret, salt})` en `test/helpers/sesion-authjs.ts`. `grep -r compass_session` debe quedar limpio.
8. **Consumidores**: `auth()` (RSC/route handlers) lee `next/headers`; en tests se mockea `next/headers` con `vi.hoisted` + cookie mintada. Portal: `/api/auth/session` Auth.js devuelve `{user, expires}` | `null` → `autenticado = Boolean(d?.user)`. Logout: Auth.js expone POST `/api/auth/signout` (csrf + cookie); sin botón UI todavía (pendiente heredado, no existía antes).
9. **Entornos de test**: proxy/api/rate-limit en `@vitest-environment node` (crypto.subtle para JWE; jsdom no lo garantiza). `test/setup.ts` fija `AUTH_SECRET` default (`test-secret-12345678`) porque `NextAuth()` captura el secreto al cargar el módulo. Tests de integración login↔Auth.js usan el handler real con danza CSRF (GET csrf → POST callback) contra dev.db con usuarios únicos + cleanup.

## Riesgos / trade-offs
- `next-auth@beta`: API estable en la práctica para credentials+JWT+middleware (beta.32), pero es beta; se documenta la versión exacta y las desviaciones en el reporte. No se usa `next-auth/react` (menor superficie beta).
- Adapter inactivo con JWT: aceptable (AU §3.1 pide adapter de BD; OAuth futuro lo activará). Métodos Account/Session/VerificationToken son no-op/null explícitos.
- Rate limit por IP con `x-forwarded-for` sin parsear multi-hop (igual que P1; detrás de proxy del owner se normaliza en el proxy).
- `authorize` corre en Node (route handler); bcrypt+Prisma OK. proxy.ts queda libre de Node-only deps (verificar bundling edge en build).
