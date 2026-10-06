# Delta for AU-autenticacion-sesion

## MODIFIED Requirements

### Requirement: Estado implementado del scaffold (§1 — contexto)

El sistema SHALL usar Auth.js (`next-auth@beta`, v5) para emisión y verificación de sesión, reemplazando el scaffold propio de §1: instancia Node en `k0mp4ss_fe/apps/web/lib/auth.ts` (`NextAuth` con provider credentials y adapter Prisma sobre `Usuario`) exportando `handlers`/`auth`/`signIn`/`signOut`, y configuración edge-safe en `lib/auth.config.ts` (estrategia JWT, **maxAge 24 horas (86400 segundos), updateAge 1 hora (3600 segundos)**, `pages.signIn = "/ingresar"`, callback session que expone `user.id = token.sub`). Las rutas Auth.js SHALL vivir en `app/api/auth/[...nextauth]/route.ts` (`/api/auth/*`: csrf, session, signin, signout, callback, providers, error) y la cookie de sesión SHALL ser la de Auth.js (`authjs.session-token`, JWE con `AUTH_SECRET`; `__Secure-` en https). `proxy.ts` SHALL verificar con `auth()` (instancia edge-safe sin Prisma) manteniendo el mismo matcher `/admin/:path*` + `/api/:path*`, las mismas rutas públicas (`/ingresar`, `/api/auth`), 401 JSON para `/api` y redirect `/ingresar?next=` para páginas. El sistema SHALL NOT contener `ADMIN_EMAIL`, `ADMIN_PASSWORD`, credenciales hardcodeadas ni fallback dev de secreto; `AUTH_SECRET` SHALL mantenerse como variable de entorno usada por Auth.js.
(Previously: maxAge was 30 days; now 24h maxAge with 1h sliding updateAge)

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

#### Scenario: JWT token issued with 24-hour expiry

- **WHEN** un usuario inicia sesión exitosamente y se emite un JWT de sesión
- **THEN** el JWT `exp` claim SHALL ser igual a `iat + 86400` (24 horas desde emisión)
- **AND** el JWT `exp - iat` SHALL ser igual a `86400`

#### Scenario: Sliding refresh within 1 hour of expiry extends session

- **WHEN** un token JWT válido es usado dentro de 3600 segundos (1 hora) antes de su `exp`
- **THEN** Auth.js SHALL emitir un nuevo JWT con `new_exp = new_iat + 86400`
- **AND** el nuevo token tendrá una vigencia completa de 24 horas desde el momento del refresh

#### Scenario: Token no refrescado cuando se usa más de 1 hora antes del expiry

- **WHEN** un token JWT válido es usado más de 3600 segundos antes de su `exp`
- **THEN** Auth.js NO SHALL emitir un nuevo token (sin refresh)
- **AND** el token original continuará siendo válido hasta su `exp` original

#### Scenario: Token expirado es rechazado

- **WHEN** se presenta un token JWT donde la hora actual > `exp`
- **THEN** Auth.js SHALL rechazar el token
- **AND** el usuario SHALL ser redirigido a sign-in (o recibir 401 para rutas API)

(End of file)