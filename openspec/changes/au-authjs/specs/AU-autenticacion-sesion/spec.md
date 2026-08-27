# Spec Delta: AU-autenticacion-sesion — Auth.js (§3) + rate limit persistente (D-v)

## MODIFIED Requirements

### Requirement: Sesión y autenticación vía Auth.js (AU §3)
El sistema SHALL usar Auth.js (`next-auth@beta`, v5) para emisión y verificación de sesión, reemplazando el scaffold propio de §1: instancia Node en `k0mp4ss_fe/apps/web/lib/auth.ts` (`NextAuth` con provider credentials y adapter Prisma sobre `Usuario`) exportando `handlers`/`auth`/`signIn`/`signOut`, y configuración edge-safe en `lib/auth.config.ts` (estrategia JWT, maxAge 30 días, `pages.signIn = "/ingresar"`, callback session que expone `user.id = token.sub`). Las rutas Auth.js SHALL vivir en `app/api/auth/[...nextauth]/route.ts` (`/api/auth/*`: csrf, session, signin, signout, callback, providers, error) y la cookie de sesión SHALL ser la de Auth.js (`authjs.session-token`, JWE con `AUTH_SECRET`; `__Secure-` en https). `proxy.ts` SHALL verificar con `auth()` (instancia edge-safe sin Prisma) manteniendo el mismo matcher `/admin/:path*` + `/api/:path*`, las mismas rutas públicas (`/ingresar`, `/api/auth`), 401 JSON para `/api` y redirect `/ingresar?next=` para páginas. El sistema SHALL NOT contener `ADMIN_EMAIL`, `ADMIN_PASSWORD`, credenciales hardcodeadas ni fallback dev de secreto; `AUTH_SECRET` SHALL mantenerse como variable de entorno usada por Auth.js.

#### Scenario: Autenticación contra Auth.js sin credenciales de entorno
- **WHEN** se inspecciona `lib/auth.ts`, `lib/auth.config.ts`, `proxy.ts`, `.env.example` y se ejecuta `grep -r compass_session`
- **THEN** no existen `ADMIN_EMAIL`/`ADMIN_PASSWORD`, token HMAC propio ni cookie `compass_session`; la sesión es JWT de Auth.js firmada con `AUTH_SECRET` y `proxy.ts` decide solo autenticación vía `auth()`.

#### Scenario: proxy edge verifica sin Prisma
- **WHEN** una petición a `/admin/*` o `/api/*` (fuera de rutas públicas) pasa por `proxy.ts`
- **THEN** la verificación de sesión es decodificación JWT local (sin BD) idéntica a la de `auth()` server-side, con 401 JSON para `/api` y redirect `/ingresar?next=` para páginas si no hay sesión.

#### Scenario: sub es el id de Usuario en BD
- **WHEN** un usuario inicia sesión con credenciales válidas
- **THEN** el JWT `sub` y `session.user.id` son el `Usuario.id` de la BD (vinculable a MP vía `personaId`), no el email.

### Requirement: Seed dev de 2 comunidades con membresías
El sistema SHALL proveer helper `k0mp4ss_fe/apps/web/lib/seed-authz.ts` idempotente que crea 2 comunidades (`comunidad-a`, `comunidad-b`) y usuarios TEST (`admin@test.cl` admin en A+B, `comite@test.cl` comite en A, `conserjeria@test.cl` conserjeria en A, `residente@test.cl` residente en A, `mantencion@test.cl` mantencion en A) con `Membresia` por comunidad y `passwordHash` bcrypt asignado (password TEST documentada en manual), de modo que los usuarios TEST puedan iniciar sesión vía Auth.js. Para el primer arranque (BD sin usuarios, login imposible por diseño fail-closed) SHALL existir bootstrap CLI `npm run seed:authz` (`scripts/seed-authz.mjs`) idempotente que replica el seed sin servidor. El endpoint qa-lab `POST /api/admin/seed-authz` SHALL exigir sesión de administrador (`puede(rol, "crear", "admin:usuarios")`) sin fallback legado.

#### Scenario: Seed idempotente dos comunidades
- **WHEN** se ejecuta `seedUsuariosMembresias()` (o `npm run seed:authz`) dos veces
- **THEN** no duplica usuarios/membresias, ambos runs retornan `ok:true` con counts estables y los usuarios quedan con password hash verificable.

#### Scenario: Bootstrap sin usuarios en BD
- **WHEN** la BD no tiene usuarios y se ejecuta `npm run seed:authz`
- **THEN** se crean comunidades + usuarios TEST con membresías y passwordHash, habilitando el primer login vía Auth.js.

### Requirement: Tests de autorización y aislamiento
El sistema SHALL tener tests: (a) `lib/authz.test.ts` puro matriz RP (≥20 casos permitidos/denegados por rol), (b) `lib/repos/repos.authz.test.ts` aislamiento A/B usando `crearRepositorio` y DB temporal (admin A no lee/muta membresias de B), (c) `test/api-admin-usuarios.test.ts` endpoint responde `403` con rol sin permiso y `200` con rol válido usando sesión Auth.js mintada (`test/helpers/sesion-authjs.ts` + mock de `next/headers`) y DB temporal/dev. Los tests de `/ingresar` de P1 (RTL+MSW) SHALL seguir cubriendo login exitoso (con y sin `?next=`), credenciales inválidas, rate limit, error de conexión, respuesta sin JSON y estados de carga, con handlers MSW apuntando a las rutas de Auth.js (`/api/auth/csrf` y `/api/auth/callback/credentials`). Ningún test SHALL mockear la cookie `compass_session`.

#### Scenario: Suite verde
- **WHEN** se ejecuta `cd k0mp4ss_fe/apps/web && npm test`
- **THEN** los suites authz, proxy, api-auth, rate-limit, ingresar y endpoints pasan; `grep -r compass_session` no retorna resultados y `openspec validate --all` sigue verde.

## ADDED Requirements

### Requirement: Login /ingresar contra Auth.js (credentials)
La página `/ingresar` SHALL autenticar contra Auth.js con provider credentials: GET `/api/auth/csrf` seguido de POST `/api/auth/callback/credentials` (form-urlencoded con `csrfToken`, `email`, `password`, `callbackUrl`; header `X-Auth-Return-Redirect: 1`). `authorize()` SHALL validar email+password contra `Usuario.passwordHash` (bcrypt) exigiendo `Usuario.activo`, con mensaje genérico para usuario inexistente/inactivo/sin hash (sin enumeración de emails). Los fallos SHALL distinguirse por `code` en la URL de respuesta de Auth.js: `credentials` (credenciales inválidas o usuario inactivo) y `rate_limited` (límite D-v excedido), mapeados a mensajes de usuario sin exponer detalle interno. La redirección post-login SHALL aceptar solo `?next=` interno (que empieza con `/`).

#### Scenario: Login exitoso setea cookie Auth.js
- **WHEN** un usuario TEST con password válida envía el formulario de `/ingresar`
- **THEN** la respuesta setea la cookie de sesión Auth.js y el cliente navega a `?next=` interno o `/admin`.

#### Scenario: Credenciales inválidas con mensaje genérico
- **WHEN** se envía email existente con password errónea, o email inexistente/inactivo
- **THEN** la respuesta lleva `error=CredentialsSignin&code=credentials` y la UI muestra "Credenciales inválidas." sin distinguir la causa.

#### Scenario: Límite de intentos comunicado
- **WHEN** la IP supera el límite D-v y se intenta login
- **THEN** la respuesta lleva `code=rate_limited` y la UI muestra "Demasiados intentos. Espere unos minutos.".

### Requirement: Rate limit persistente (SG D-v)
El sistema SHALL reemplazar el rate limit en memoria por uno persistente en BD: modelo Prisma `RateLimitAttempt {id, clave, createdAt}` con índice `(clave, createdAt)` y módulo `k0mp4ss_fe/apps/web/lib/rate-limit.ts` con `excedeIntentos(clave, client?)`, `registrarFallo(clave, client?)` y `limpiarIntentos(clave, client?)` (async, Prisma inyectable). El login SHALL limitar a 10 fallos por clave (IP desde `x-forwarded-for` con fallback `local`) en ventana de 15 minutos consultando la BD: `authorize` verifica el límite ANTES de validar credenciales, registra cada fallo y limpia la clave al éxito. `registrarFallo` SHALL eliminar oportunamente filas fuera de la ventana para mantener la tabla acotada. El límite SHALL sobrevivir reinicios del proceso (persistente).

#### Scenario: Diez fallos bloquean desde BD
- **WHEN** una clave acumula 10 `RateLimitAttempt` dentro de los últimos 15 minutos
- **THEN** `excedeIntentos(clave)` retorna `true` y el siguiente login retorna `code=rate_limited` sin verificar credenciales; una clave distinta no queda bloqueada.

#### Scenario: Ventana expira y éxito limpia
- **WHEN** los fallos de una clave tienen `createdAt` anterior a 15 minutos, o el usuario inicia sesión con éxito
- **THEN** `excedeIntentos(clave)` retorna `false` (ventana expirada) y `limpiarIntentos` eliminó los registros de la clave, permitiendo nuevos intentos.

#### Scenario: Persistencia entre reinicios
- **WHEN** el proceso se reinicia con fallos registrados en BD dentro de la ventana
- **THEN** el límite sigue vigente (leído desde BD, no desde memoria del proceso).
