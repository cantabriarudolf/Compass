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

### Requirement: Login /ingresar contra Auth.js (credentials)

La página `/ingresar` SHALL autenticar contra Auth.js con provider credentials: GET `/api/auth/csrf` seguido de POST `/api/auth/callback/credentials` (form-urlencoded con `csrfToken`, `email`, `password`, `callbackUrl`; header `X-Auth-Return-Redirect: 1`). `authorize()` SHALL validar email+password contra `Usuario.passwordHash` (bcrypt) exigiendo `Usuario.activo`, con mensaje genérico para usuario inexistente/inactivo/sin hash (sin enumeración de emails). Los fallos SHALL distinguirse por `code` en la URL de respuesta de Auth.js: `credentials` (credenciales inválidas o usuario inactivo) y `rate_limited` (límite D-v excedido), mapeados a mensajes de usuario sin exponer detalle interno. La redirección post-login SHALL aceptar solo `?next=` interno (que empieza con `/`).

La página SHALL ofrecer además Google como segunda vía, aditiva al formulario de credentials: un separador visual "O" seguido de un botón `Continuar con Google` (variant `outline`) que invoca `signIn("google", { callbackUrl })` de `next-auth/react`, con `callbackUrl` = el `?next=` interno cuando `esDestinoSeguro()` lo acepta y `/dashboard` (`DESTINO_POR_DEFECTO`) en cualquier otro caso. El flujo de credentials (CSRF → callback/credentials → `code`) SHALL permanecer sin cambios.

#### Scenario: Login exitoso setea cookie Auth.js
- **WHEN** un usuario TEST con password válida envía el formulario de `/ingresar`
- **THEN** la respuesta setea la cookie de sesión Auth.js y el cliente navega a `?next=` interno o `/admin`.

#### Scenario: Credenciales inválidas con mensaje genérico
- **WHEN** se envía email existente con password errónea, o email inexistente/inactivo
- **THEN** la respuesta lleva `error=CredentialsSignin&code=credentials` y la UI muestra "Credenciales inválidas." sin distinguir la causa.

#### Scenario: Límite de intentos comunicado
- **WHEN** la IP supera el límite D-v y se intenta login
- **THEN** la respuesta lleva `code=rate_limited` y la UI muestra "Demasiados intentos. Espere unos minutos.".

#### Scenario: Botón "Continuar con Google" arranca el flujo OAuth con destino seguro
- **WHEN** se renderiza `/ingresar` con `?next=` interno válido, con `?next=` externo/no seguro o sin `next`, y se pulsa el botón "Continuar con Google"
- **THEN** el botón aparece bajo el separador "O" y junto al formulario de credentials, e invoca `signIn("google", { callbackUrl })` con el `?next=` interno en el primer caso y con `/dashboard` en los otros dos

### Requirement: Rate limit persistente (SG D-v)

El sistema SHALL reemplazar el rate limit en memoria por uno persistente en BD: modelo Prisma `RateLimitAttempt {id, clave, createdAt}` con índice `(clave, createdAt)` y módulo `k0mp4ss_fe/apps/web/lib/rate-limit.ts` con `excedeIntentos(clave, client?)`, `registrarFallo(clave, client?)` y `limpiarIntentos(clave, client?)` (async, Prisma inyectable). El login SHALL limitar a 10 fallos por clave (IP desde `x-forwarded-for` con fallback `local`) en ventana de 15 minutos consultando la BD: `authorize` verifica el límite ANTES de validar credenciales, registra cada fallo y limpia la clave al éxito. `registrarFallo` SHALL eliminar oportunamente filas fuera de la ventana para mantener la tabla acotada. El límite SHALL sobrevivir reinicios del proceso (persistente).

El login Google SHALL compartir ese mecanismo con clave propia por email: el callback `signIn` de `lib/auth.ts` SHALL usar `google:<email>` (email normalizado a minúsculas), consultar `excedeIntentos(clave)` antes de resolver al usuario y denegar el acceso si la clave está bloqueada, registrar `registrarFallo(clave)` cuando el email no corresponde a un `Usuario` activo (inexistente o inactivo) y limpiar la clave con `limpiarIntentos(clave)` cuando el usuario existe y está activo. Umbral (10 fallos) y ventana (15 minutos) SHALL ser los mismos que en credentials.

#### Scenario: Diez fallos bloquean desde BD
- **WHEN** una clave acumula 10 `RateLimitAttempt` dentro de los últimos 15 minutos
- **THEN** `excedeIntentos(clave)` retorna `true` y el siguiente login retorna `code=rate_limited` sin verificar credenciales; una clave distinta no queda bloqueada.

#### Scenario: Ventana expira y éxito limpia
- **WHEN** los fallos de una clave tienen `createdAt` anterior a 15 minutos, o el usuario inicia sesión con éxito
- **THEN** `excedeIntentos(clave)` retorna `false` (ventana expirada) y `limpiarIntentos` eliminó los registros de la clave, permitiendo nuevos intentos.

#### Scenario: Persistencia entre reinicios
- **WHEN** el proceso se reinicia con fallos registrados en BD dentro de la ventana
- **THEN** el límite sigue vigente (leído desde BD, no desde memoria del proceso).

#### Scenario: Login Google se limita por la clave google:<email>
- **WHEN** la clave `google:<email>` acumula 10 fallos en la ventana de 15 minutos
- **THEN** `excedeIntentos("google:<email>")` retorna `true` y el callback `signIn` devuelve `false` sin resolver al usuario, mientras una clave `google:<otro-email>` no queda bloqueada

## ADDED Requirements

### Requirement: Vinculación Google restringida a usuarios existentes y activos

El callback `signIn` de `k0mp4ss_fe/apps/web/lib/auth.ts` SHALL aceptar un login Google solo cuando el email (normalizado a minúsculas) corresponda a un `Usuario` existente con `activo = true`; con email ausente, sin `Usuario` asociado o con `Usuario` inactivo SHALL devolver `false`, abortando el login. El sistema SHALL NOT crear `Usuario` automáticamente desde un login Google ni asociar membresías nuevas. El callback `jwt` SHALL, cuando `account.provider === "google"` y exista `user.email`, resolver el `Usuario` por email y fijar `token.sub = Usuario.id` (más `token.tokenVersion`), de modo que la sesión Google use el id de BD y no el `sub` de Google. Dado que el adapter no persiste cuentas OAuth (`getUserByAccount` → `null`, `linkAccount` no-op) y `allowDangerousEmailAccountLinking` es `false`, el primer login Google de un `Usuario` existente sin sesión previa SHALL resolverse como el error `OAuthAccountNotLinked` de Auth.js (redirección a `/ingresar?error=OAuthAccountNotLinked`, `pages.error = "/ingresar"`) y NO SHALL emitir cookie de sesión.

#### Scenario: Email sin Usuario activo no crea cuenta ni sesión

- **WHEN** el callback `signIn` recibe `account.provider === "google"` con un email que no existe en `Usuario` o cuyo `activo` es `false`
- **THEN** ejecuta `registrarFallo("google:<email>")`, devuelve `false` y Auth.js aborta el callback como `AccessDenied` (redirección a `/ingresar?error=AccessDenied`) antes de `handleLoginOrRegister`, sin crear `Usuario` y sin cookie de sesión

#### Scenario: Email ausente es rechazado

- **WHEN** el callback `signIn` recibe `account.provider === "google"` sin `user.email`
- **THEN** devuelve `false` sin consultar la BD ni emitir sesión

#### Scenario: Usuario activo pasa el gate sin auto-creación

- **WHEN** el callback `signIn` recibe `account.provider === "google"` con el email de un `Usuario` existente y `activo = true`
- **THEN** ejecuta `limpiarIntentos("google:<email>")`, devuelve `true` y no crea ni modifica filas de `Usuario`/`Membresia`

#### Scenario: JWT de Google usa el Usuario.id de BD como sub

- **WHEN** el callback `jwt` corre con `account.provider === "google"` y `user.email` correspondiente a un `Usuario`
- **THEN** `token.sub` queda con el `Usuario.id` de la BD (y `token.tokenVersion` con el del usuario), no con el `sub` de Google, por lo que `session.user.id` y la autorización por membresías siguen operando con el id de BD

#### Scenario: Primer login Google sin vínculo persistido no emite sesión

- **WHEN** un `Usuario` activo completa el consentimiento de Google sin tener sesión previa
- **THEN** Auth.js no encuentra cuenta vinculada (`getUserByAccount` → `null`) y, con `allowDangerousEmailAccountLinking: false`, falla con `OAuthAccountNotLinked` (redirección a `/ingresar?error=OAuthAccountNotLinked`), sin crear `Usuario`, sin persistir el vínculo (`linkAccount` no-op) y sin cookie de sesión
