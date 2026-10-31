# AU-autenticacion-sesion Specification

## Purpose
Capa de autenticación y autorización del frontend. Fuente NSGC: `Data/NSGC/docs/especificaciones/AU - Autenticacion y Sesion.md`. En esta ventana se documenta el scaffold existente (§1) como contexto y se implementa la autorización B3 (§4) con modelos por comunidad, matriz RP y autorización server-side. El reemplazo definitivo por Auth.js (NextAuth v5) y rate limit persistente quedan para P5 según AU §3.

## Requirements

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

### Requirement: Modelos Usuario y Membresia por comunidad (B3)
El sistema SHALL proveer en `k0mp4ss_fe/apps/web/prisma/schema.prisma` los modelos `Usuario {id, email @unique, personaId? (0..1 → MP), activo}` y `Membresia {id, usuarioId, comunidadId, rol}` con `@@unique([usuarioId, comunidadId])`, `@@index([comunidadId])` y relaciones `usuario Usuario @relation` / `comunidad Comunidad @relation` + back-relation `Comunidad.membresias` y `Usuario.membresias`. `Membresia.rol` SHALL ser String validado por `lib/authz.ts` contra roles estándar RP. `prisma migrate dev --name add_usuario_membresia` SHALL correr limpio y `prisma generate` crear cliente.

#### Scenario: Unicidad por comunidad
- **WHEN** se crea `Membresia {usuarioId: u1, comunidadId: A, rol: administrador}` y luego `{u1, A, rol: residente}`
- **THEN** la segunda inserción falla por `@@unique([usuarioId, comunidadId])`, mientras `{u1, B, rol: residente}` en comunidad distinta se permite.

#### Scenario: Usuario global y persona opcional
- **WHEN** se crea `Usuario {email: admin@test.cl, personaId: null}` y otro con `personaId: p-1`
- **THEN** ambos se persisten; `email` falla si se duplica globalmente y `personaId` no exige FK estricta (0..1).

### Requirement: Matriz de permisos pura lib/authz.ts (RP)
El sistema SHALL exponer `k0mp4ss_fe/apps/web/lib/authz.ts` puro con `export const ROLES`, `export type Rol = "administrador" | "comite" | "conserjeria" | "residente" | "mantencion"`, `export type Accion = "ver" | "crear" | "editar" | "eliminar" | "ejecutar"`, `export type Recurso = string` y `export function puede(rol: Rol, accion: Accion, recurso: string): boolean` mapeando la Matriz de Permisos de `RP - Roles y Permisos.md` §3 y specs PE/PL/CT/RE/IR. Roles estándar RP SHALL mapearse: Administrador Maestro → `administrador` (wildcard full access), Miembro del Comité → `comite`, Conserjería/Seguridad → `conserjeria`, Propietario/Residente → `residente`, Personal de Mantención → `mantencion`. Permisos SHALL definirse por módulo y acción; lo no listado SHALL denegarse (menor privilegio) y `puede` SHALL ser testeable sin IO. Exporta también `tienePermiso(roles: Rol[], accion, recurso)` como unión.

#### Scenario: Administrador wildcard
- **WHEN** `puede("administrador", accion, recurso)` para cualquier `accion` y `recurso` de la matriz (FI, MP, PE, PL, CT, RE, IR, admin:usuarios, backup)
- **THEN** retorna `true`.

#### Scenario: Conserjería no ve finanzas
- **WHEN** `puede("conserjeria", "ver", "FI")` o `puede("conserjeria","ver","FI:balance")`
- **THEN** retorna `false` conforme a RP tabla (Finanzas Ver Balance solo Admin/Comité).

#### Scenario: Conserjería sí ejecuta cierre de turno y bitácora
- **WHEN** `puede("conserjeria","ejecutar","PE:cierre_turno")` y `puede("conserjeria","crear","PE:bitacora")`
- **THEN** ambos retornan `true` y `puede("conserjeria","ver","PE:ficha")` retorna `false` (sin prevision/banca).

#### Scenario: Residente solicita mantenimiento pero no interno
- **WHEN** `puede("residente","crear","IR:mantenimiento")` vs `puede("residente","crear","IR:interno")`
- **THEN** el primero `true` (ABAC todos) y el segundo `false` (solo mantencion/personal).

#### Scenario: Menor privilegio deniega no listado
- **WHEN** `puede("residente","eliminar","FI")` o recurso desconocido `puede("comite","ver","recurso_inexistente")`
- **THEN** retorna `false` y se registra `RP_PERMISSION_DENIED` donde aplique.

### Requirement: Autorización server-side en endpoints (SG §4.1)
El sistema SHALL aplicar autorización fina SOLO server-side: `proxy.ts` SHALL seguir decidiendo solo autenticación (401/redirect) y NUNCA autorización. Al menos dos puntos reales SHALL verificar `puede()` server-side: (1) nuevo `GET /api/admin/usuarios?comunidadId=` que lista `Membresia`+`Usuario` de la comunidad del contexto solo si `puede(rol,"ver","admin:usuarios")` (admin-only) y scoping por `comunidadId` via `crearRepositorio`; (2) handler existente `POST /api/backup` reforzado exigiendo `puede(rol,"ejecutar","backup")` (solo `administrador`). Ambos SHALL retornar `401` sin sesión, `400` sin `comunidadId`, `403` con rol sin permiso y `200` con rol válido, validando Zod y sin confiar en cliente.

#### Scenario: Endpoint protegido 403/200 por rol
- **WHEN** `GET /api/admin/usuarios?comunidadId=A` con sesión válida de `conserjeria` miembro de A
- **THEN** responde `403`; con sesión de `administrador` miembro de A responde `200` con solo membresias de A.

#### Scenario: Aislamiento A/B server-side
- **WHEN** `GET /api/admin/usuarios?comunidadId=B` con sesión de `administrador` solo miembro de A (no de B)
- **THEN** responde `403` y no fuga datos de B; con membresia en B responde `200` sin mezclar A.

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

### Requirement: Verificación automática de expiración JWT de sesión (24 h)

El sistema SHALL proveer el test Vitest `k0mp4ss_fe/apps/web/test/auth/session-maxage.test.ts`, que codifica un JWT de sesión con `maxAge = authConfig.session?.maxAge` (86400 s) y, al decodificarlo con `next-auth/jwt` (`encode`/`decode`), verifica que `exp - iat` es 86400 segundos con tolerancia de ±2 s por clock skew.

#### Scenario: El test decodifica el JWT y verifica la expiración de 24 h
- **WHEN** se inspecciona `k0mp4ss_fe/apps/web/test/auth/session-maxage.test.ts`
- **THEN** usa `encode`/`decode` de `next-auth/jwt` con `maxAge` de `authConfig.session` y afirma que `exp - iat` está en el rango 86400 ± 2 s.

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
