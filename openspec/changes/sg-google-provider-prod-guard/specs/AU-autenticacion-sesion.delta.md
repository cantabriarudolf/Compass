# AU-autenticacion-sesion — Delta Specs for sg-google-provider-prod-guard

## Modified Requirement: Estado implementado del scaffold (§1 — contexto)

El sistema SHALL usar Auth.js (`next-auth@beta`, v5) para emisión y verificación de sesión, reemplazando el scaffold propio de §1: instancia Node en `k0mp4ss_fe/apps/web/lib/auth.ts` (`NextAuth` con provider credentials y adapter Prisma sobre `Usuario`) exportando `handlers`/`auth`/`signIn`/`signOut`, y configuración edge-safe en `lib/auth.config.ts` (estrategia JWT, maxAge 30 días, `pages.signIn = "/ingresar"`, callback session que expone `user.id = token.sub`). Las rutas Auth.js SHALL vivir en `app/api/auth/[...nextauth]/route.ts` (`/api/auth/*`: csrf, session, signin, signout, callback, providers, error) y la cookie de sesión SHALL ser la de Auth.js (`authjs.session-token`, JWE con `AUTH_SECRET`; `__Secure-` en https). `proxy.ts` SHALL verificar con `auth()` (instancia edge-safe sin Prisma) manteniendo el mismo matcher `/admin/:path*` + `/api/:path*`, las mismas rutas públicas (`/ingresar`, `/api/auth`), 401 JSON para `/api` y redirect `/ingresar?next=` para páginas. El sistema SHALL NOT contener `ADMIN_EMAIL`, `ADMIN_PASSWORD`, credenciales hardcodeadas ni fallback dev de secreto; `AUTH_SECRET` SHALL mantenerse como variable de entorno usada por Auth.js.

**Fail-fast de credenciales Google en producción**: El módulo `lib/auth.ts` SHALL validar la presencia y no-vacío de `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` **antes** de invocar `NextAuth()` cuando `process.env.NODE_ENV === 'production'`. Si cualquiera de las dos variables falta o está vacía, el módulo SHALL lanzar un `Error` descriptivo que indique: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in production. Set them in your environment or disable the Google provider." En desarrollo (`NODE_ENV !== 'production'`), el comportamiento actual con fallback a string vacío (`""`) se SHALL mantener para permitir desarrollo local sin credenciales Google.

(Previously: scaffold Auth.js v5 con providers credentials + JWT, sin validación fail-fast de credenciales OAuth)

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

---

## Unchanged Requirements (for context)

All other requirements in `openspec/specs/AU-autenticacion-sesion/spec.md` remain unchanged:
- Requirement: Modelos Usuario y Membresia por comunidad (B3)
- Requirement: Matriz de permisos pura lib/authz.ts (RP)
- Requirement: Autorización server-side en endpoints (SG §4.1)
- Requirement: Seed dev de 2 comunidades con membresías
- Requirement: Tests de autorización y aislamiento
- Requirement: Login /ingresar contra Auth.js (credentials)
- Requirement: Rate limit persistente (SG D-v)