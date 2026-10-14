## MODIFIED Requirements

### Requirement: Estado implementado del scaffold (§1 — contexto)

El sistema SHALL usar Auth.js (`next-auth@beta`, v5) para emisión y verificación de sesión, reemplazando el scaffold propio de §1: instancia Node en `k0mp4ss_fe/apps/web/lib/auth.ts` (`NextAuth` con providers credentials y Google, y adapter Prisma sobre `Usuario`) exportando `handlers`/`auth`/`signIn`/`signOut`, y configuración edge-safe en `lib/auth.config.ts` (estrategia JWT, **maxAge 24 horas (86400 segundos), updateAge 1 hora (3600 segundos)**, `pages.signIn = "/ingresar"`, callback session que expone `user.id = token.sub`). Las rutas Auth.js SHALL vivir en `app/api/auth/[...nextauth]/route.ts` (`/api/auth/*`: csrf, session, signin, signout, callback, providers, error) y la cookie de sesión SHALL ser la de Auth.js (`authjs.session-token`, JWE con `AUTH_SECRET`; `__Secure-` en https). `proxy.ts` SHALL verificar con `auth()` (instancia edge-safe sin Prisma) sobre el matcher amplio `/((?!_next/static|_next/image|favicon.ico).*)` que emite CSP en toda respuesta, manteniendo el scoping de autenticación a `/admin` y `/api` dentro del handler, las mismas rutas públicas (`/ingresar`, `/api/auth`), 401 JSON para `/api` y redirect `/ingresar?next=` para páginas. El sistema SHALL NOT contener `ADMIN_EMAIL`, `ADMIN_PASSWORD`, credenciales hardcodeadas ni fallback dev de secreto; `AUTH_SECRET` SHALL mantenerse como variable de entorno usada por Auth.js.

**Fail-fast de credenciales Google en producción**: El módulo `lib/auth.ts` SHALL validar la presencia y no-vacío de `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` **antes** de invocar `NextAuth()` cuando `process.env.NODE_ENV === 'production'` y `process.env.GOOGLE_PROVIDER_DISABLED !== '1'`. Si cualquiera de las dos variables falta o está vacía (con la bandera apagada), el módulo SHALL lanzar un `Error` descriptivo que indique: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in production. Set them in your environment or set GOOGLE_PROVIDER_DISABLED=1 to disable the Google provider." Con `GOOGLE_PROVIDER_DISABLED=1` el fail-fast SHALL no ejecutarse y el módulo SHALL cargar igualmente. En desarrollo (`NODE_ENV !== 'production'`), el comportamiento actual con fallback a string vacío (`""`) se SHALL mantener para permitir desarrollo local sin credenciales Google.

**Google como provider OAuth 2.0 adicional**: `lib/auth.ts` SHALL registrar el provider `Google` (`next-auth/providers/google`) en el array `providers` junto a `Credentials`, con `clientId: process.env.GOOGLE_CLIENT_ID ?? ""`, `clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? ""` y `allowDangerousEmailAccountLinking: false`, **salvo** que `GOOGLE_PROVIDER_DISABLED === '1'`, en cuyo caso solo se SHALL registrar `Credentials` (change `au-google-provider-disabled`). Habilitar Google SHALL NOT introducir modelos, campos ni migraciones: el schema Prisma SHALL seguir sin tablas `Account`/`Session` y `AdapterPrismaCompass` SHALL mantener `getUserByAccount` en `null` y `linkAccount`/`unlinkAccount` como no-op, de modo que el vínculo con la cuenta Google no se persiste en BD. `k0mp4ss_fe/apps/web/.env.example` SHALL documentar `GOOGLE_CLIENT_ID=` y `GOOGLE_CLIENT_SECRET=` como opcionales en dev y requeridas en producción.

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

- **GIVEN** `process.env.NODE_ENV === 'production'`, `process.env.GOOGLE_PROVIDER_DISABLED` distinto de `'1'` y `process.env.GOOGLE_CLIENT_ID` no está definido o es string vacío
- **WHEN** se carga el módulo `lib/auth.ts` (import o require)
- **THEN** se lanza `Error` con mensaje "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in production. Set them in your environment or set GOOGLE_PROVIDER_DISABLED=1 to disable the Google provider." y la app NO inicia

#### Scenario: Build/startup en producción falla sin GOOGLE_CLIENT_SECRET

- **GIVEN** `process.env.NODE_ENV === 'production'`, `process.env.GOOGLE_PROVIDER_DISABLED` distinto de `'1'` y `process.env.GOOGLE_CLIENT_SECRET` no está definido o es string vacío
- **WHEN** se carga el módulo `lib/auth.ts`
- **THEN** se lanza `Error` con el mismo mensaje descriptivo (que nombra `GOOGLE_PROVIDER_DISABLED=1`) y la app NO inicia

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

#### Scenario: Provider Google registrado sin persistencia de cuenta

- **GIVEN** `GOOGLE_PROVIDER_DISABLED` no está seteada en `'1'`
- **WHEN** se inspecciona `k0mp4ss_fe/apps/web/lib/auth.ts`, `k0mp4ss_fe/apps/web/lib/auth-adapter.ts` y `k0mp4ss_fe/apps/web/prisma/schema.prisma`
- **THEN** el array `providers` contiene `Credentials` y `Google({clientId: process.env.GOOGLE_CLIENT_ID ?? "", clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "", allowDangerousEmailAccountLinking: false})`, el schema no tiene modelos `Account`/`Session` ni campos Google, y el adapter sigue con `getUserByAccount` → `null` y `linkAccount` no-op (sin migración asociada)

## ADDED Requirements

### Requirement: Bandera GOOGLE_PROVIDER_DISABLED (opt-out del provider Google)

El módulo `k0mp4ss_fe/apps/web/lib/auth.ts` SHALL interpretar `process.env.GOOGLE_PROVIDER_DISABLED === "1"` como opt-out total del provider Google: (a) el fail-fast de credenciales de producción SHALL no ejecutarse (el módulo carga con `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` ausentes o vacíos) y (b) el provider `Google` SHALL no registrarse en el array `providers` (queda solo `Credentials`; los callbacks `signIn`/`jwt` de Google quedan inertes porque ningún provider los dispara, sin cambios en ellos). Con cualquier otro valor de la bandera (vacío, ausente, `"0"`, `"true"`) el comportamiento SHALL ser idéntico al actual: en desarrollo las credenciales vacías cargan con fallback `""` y en producción se exige el fail-fast y se registra `Google`. La bandera SHALL documentarse en `k0mp4ss_fe/apps/web/.env.example` (junto a `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`) y en `k0mp4ss_fe/apps/web/docs/runbook-operaciones.md`, incluyendo que NO debe setearse en un entorno de producción con SSO Google activo.

#### Scenario: Producción sin credenciales con la bandera carga sin Google

- **GIVEN** `process.env.NODE_ENV === 'production'`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` ausentes o vacíos y `GOOGLE_PROVIDER_DISABLED=1`
- **WHEN** se carga el módulo `lib/auth.ts`
- **THEN** el módulo no lanza `Error` y el array `providers` contiene solo `Credentials` (ningún provider con `id: "google"`)

#### Scenario: La bandera omite Google aunque las credenciales estén presentes

- **GIVEN** producción con `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` válidos y `GOOGLE_PROVIDER_DISABLED=1`
- **WHEN** se carga el módulo `lib/auth.ts`
- **THEN** el módulo carga y el provider `Google` NO se registra (la bandera manda sobre la presencia de credenciales)

#### Scenario: Sin bandera el comportamiento actual se mantiene

- **GIVEN** `GOOGLE_PROVIDER_DISABLED` ausente o con valor distinto de `'1'`
- **WHEN** se carga el módulo `lib/auth.ts` en producción sin credenciales, en producción con credenciales o en desarrollo sin credenciales
- **THEN** en producción sin credenciales lanza el `Error` que nombra `GOOGLE_PROVIDER_DISABLED=1`, en producción con credenciales registra `Credentials` + `Google`, y en desarrollo carga con fallback `""` registrando `Credentials` + `Google`

#### Scenario: .env.example y runbook documentan la bandera

- **GIVEN** se leen `k0mp4ss_fe/apps/web/.env.example` y `k0mp4ss_fe/apps/web/docs/runbook-operaciones.md`
- **THEN** ambos mencionan `GOOGLE_PROVIDER_DISABLED` con su efecto exacto (sin fail-fast de producción y sin provider Google, solo Credentials) y la restricción de no usarla donde el SSO Google esté activo
