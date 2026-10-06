# AU-autenticacion-sesion — Delta Specs for sg-jwt-maxage-verify

## MODIFIED Requirements

### Requirement: Estado implementado del scaffold (§1 — contexto)

El sistema SHALL usar Auth.js (`next-auth@beta`, v5) para emisión y verificación de sesión, reemplazando el scaffold propio de §1: instancia Node en `k0mp4ss_fe/apps/web/lib/auth.ts` (`NextAuth` con provider credentials y adapter Prisma sobre `Usuario`) exportando `handlers`/`auth`/`signIn`/`signOut`, y configuración edge-safe en `lib/auth.config.ts` (estrategia JWT, **maxAge 24 horas (86400 segundos), updateAge 1 hora (3600 segundos)**, `pages.signIn = "/ingresar"`, callback session que expone `user.id = token.sub`). Las rutas Auth.js SHALL vivir en `app/api/auth/[...nextauth]/route.ts` (`/api/auth/*`: csrf, session, signin, signout, callback, providers, error) y la cookie de sesión SHALL ser la de Auth.js (`authjs.session-token`, JWE con `AUTH_SECRET`; `__Secure-` en https). `proxy.ts` SHALL verificar con `auth()` (instancia edge-safe sin Prisma) sobre el matcher amplio `/((?!_next/static|_next/image|favicon.ico).*)` que emite CSP en toda respuesta, manteniendo el scoping de autenticación a `/admin` y `/api` dentro del handler, las mismas rutas públicas (`/ingresar`, `/api/auth`), 401 JSON para `/api` y redirect `/ingresar?next=` para páginas. El sistema SHALL NOT contener `ADMIN_EMAIL`, `ADMIN_PASSWORD`, credenciales hardcodeadas ni fallback dev de secreto; `AUTH_SECRET` SHALL mantenerse como variable de entorno usada por Auth.js.

**Fail-fast de credenciales Google en producción**: El módulo `lib/auth.ts` SHALL validar la presencia y no-vacío de `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` **antes** de invocar `NextAuth()` cuando `process.env.NODE_ENV === 'production'`. Si cualquiera de las dos variables falta o está vacía, el módulo SHALL lanzar un `Error` descriptivo que indique: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in production. Set them in your environment or disable the Google provider." En desarrollo (`NODE_ENV !== 'production'`), el comportamiento actual con fallback a string vacío (`""`) se SHALL mantener para permitir desarrollo local sin credenciales Google.

(Previously: scaffold Auth.js v5 con providers credentials + JWT, maxAge 30 días y sin validación fail-fast de credenciales OAuth)

#### Scenario: Autenticación contra Auth.js sin credenciales de entorno

- **WHEN** se inspecciona `lib/auth.ts`, `lib/auth.config.ts`, `proxy.ts`, `.env.example` y se ejecuta `grep -r compass_session`
- **THEN** no existen `ADMIN_EMAIL`/`ADMIN_PASSWORD`, token HMAC propio ni cookie `compass_session`; la sesión es JWT de Auth.js firmada con `AUTH_SECRET` y `proxy.ts` decide solo autenticación vía `auth()`.

#### Scenario: proxy edge verifica sin Prisma

- **WHEN** una petición a `/admin/*` o `/api/*` (fuera de rutas públicas) pasa por `proxy.ts`
- **THEN** la verificación de sesión es decodificación JWT local (sin BD) idéntica a la de `auth()` server-side, con 401 JSON para `/api` y redirect `/ingresar?next=` para páginas si no hay sesión.

#### Scenario: sub es el id de Usuario en BD

- **WHEN** un usuario inicia sesión con credenciales válidas
- **THEN** el JWT `sub` y `session.user.id` son el `Usuario.id` de la BD (vinculable a MP vía `personaId`), no el email.

#### Scenario: Scaffold vigente sin Auth.js

- **WHEN** se inspecciona `k0mp4ss_fe/apps/web/lib/auth.ts` y `proxy.ts`
- **THEN** la sesión es JWT de Auth.js con `auth()` y `proxy.ts` verifica sin `verificarToken` ni `compass_session`, y `openspec validate --all` sigue verde con `next-auth`.

#### Scenario: Build/startup en producción falla sin GOOGLE_CLIENT_ID

- **GIVEN** `process.env.NODE_ENV === 'production'` y `process.env.GOOGLE_CLIENT_ID` no está definido o es string vacío
- **WHEN** se carga el módulo `lib/auth.ts` (import o require)
- **THEN** se lanza `Error` con mensaje "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in production. Set them in your environment or disable the Google provider." y la app NO inicia

#### Scenario: Build/startup en producción falla sin GOOGLE_CLIENT_SECRET

- **GIVEN** `process.env.NODE_ENV === 'production'` y `process.env.GOOGLE_CLIENT_SECRET` no está definido o es string vacío
- **WHEN** se carga el módulo `lib/auth.ts`
- **THEN** se lanza `Error` con el mismo mensaje descriptivo y la app NO inicia

#### Scenario: Build/startup en producción exitoso con ambas credenciales

- **GIVEN** `process.env.NODE_ENV === 'production'`, `process.env.GOOGLE_CLIENT_ID="abc.apps.googleusercontent.com"` y `process.env.GOOGLE_CLIENT_SECRET="secret123"`
- **WHEN** se carga el módulo `lib/auth.ts`
- **THEN** el módulo carga sin error, `NextAuth()` se invoca normalmente y la app inicia correctamente

#### Scenario: Desarrollo permite credenciales faltantes

- **GIVEN** `process.env.NODE_ENV === 'development'` (o `test`, o cualquier valor distinto de `'production'`) y `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` no están definidos
- **WHEN** se carga el módulo `lib/auth.ts`
- **THEN** el módulo carga sin error, el fallback a string vacío se aplica y la app funciona en modo desarrollo (el callback OAuth fallará en runtime si se intenta, pero el startup no se bloquea)

#### Scenario: .env.example documenta variables como requeridas en producción

- **GIVEN** se lee `k0mp4ss_fe/apps/web/.env.example`
- **THEN** contiene `GOOGLE_CLIENT_ID=` y `GOOGLE_CLIENT_SECRET=` con comentario indicando: "Google SSO (OAuth 2.0) — opcional en dev, REQUERIDO en producción. Requiere credenciales de Google Cloud Console (APIs & Services > Credentials). En producción, la app NO arrancará sin estas variables."

#### Scenario: JWT token issued with 24-hour expiry

- **WHEN** un usuario inicia sesión exitosamente y se emite un JWT de sesión
- **THEN** el JWT `exp` claim SHALL ser igual a `iat + 86400` (24 horas desde emisión)
- **AND** el JWT `exp - iat` SHALL ser igual a `86400`

#### Scenario: Sliding refresh within 1 hour of expiry extends session

- **WHEN** un token JWT válido es usado dentro de 3600 segundos (1 hora) antes de su `exp`
- **THEN** Auth.js SHALL emitir un nuevo JWT con `new_exp = new_iat + 86400`
- **AND** el nuevo token tendrá una vigencia completa de 24 horas desde el momento del refresh

#### Scenario: Token expirado es rechazado

- **WHEN** se presenta un token JWT donde la hora actual > `exp`
- **THEN** Auth.js SHALL rechazar el token
- **AND** el usuario SHALL ser redirigido a sign-in (o recibir 401 para rutas API)

## ADDED Requirements

### Requirement: Verificación automática de expiración JWT de sesión (24 h)

El sistema SHALL proveer el test Vitest `k0mp4ss_fe/apps/web/test/auth/session-maxage.test.ts`, que codifica un JWT de sesión con `maxAge = authConfig.session?.maxAge` (86400 s) y, al decodificarlo con `next-auth/jwt` (`encode`/`decode`), verifica que `exp - iat` es 86400 segundos con tolerancia de ±2 s por clock skew.

#### Scenario: El test decodifica el JWT y verifica la expiración de 24 h
- **WHEN** se inspecciona `k0mp4ss_fe/apps/web/test/auth/session-maxage.test.ts`
- **THEN** usa `encode`/`decode` de `next-auth/jwt` con `maxAge` de `authConfig.session` y afirma que `exp - iat` está en el rango 86400 ± 2 s.
