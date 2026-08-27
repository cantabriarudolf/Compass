# Tasks: au-authjs

## 1. Dependencias y esquema Prisma
- [x] 1.1 Instalar `next-auth@beta` + `bcryptjs`; desinstalar `@auth/prisma-adapter` (adapter custom sobre `Usuario` — ver design). `npm run build`/tsc sin errores de resolución
- [x] 1.2 `prisma/schema.prisma`: `Usuario.passwordHash String?` + modelo `RateLimitAttempt {id, clave, createdAt}` con `@@index([clave, createdAt])`; `npx prisma migrate dev --name authjs_password_ratelimit` limpio + `prisma generate`

## 2. Auth.js core
- [x] 2.1 Crear `lib/auth.config.ts` edge-safe: `session {strategy: "jwt", maxAge: 30d}`, `pages {signIn: "/ingresar"}`, `trustHost: true`, `callbacks.session` que expone `session.user.id = token.sub` y email; `providers: []`
- [x] 2.2 Crear `lib/auth-adapter.ts`: contrato `Adapter` (next-auth/adapters) sobre Prisma/`Usuario` (createUser/getUser/getUserByEmail/updateUser/deleteUser mapeados; Account/Session/VerificationToken no-op/null documentado)
- [x] 2.3 Reescribir `lib/auth.ts`: instancia `NextAuth` (Node) con `{...authConfig, adapter, providers: [Credentials]}`; `authorize` valida email/password contra `Usuario.passwordHash` (bcrypt) + `activo`, aplica rate limit D-v vía `lib/rate-limit.ts`, retorna `{id: usuario.id, email}`; errores `CredencialesInvalidas`/`LimiteIntentos` (subclases `CredentialsSignin` con `code`); exporta `handlers, auth, signIn, signOut`. Elimina token HMAC, `credencialesValidas`, cookie `compass_session`, rate Map y fallback dev de secreto
- [x] 2.4 Crear `lib/rate-limit.ts`: `excedeIntentos(clave, client?)`, `registrarFallo(clave, client?)`, `limpiarIntentos(clave, client?)` async con Prisma; 10 fallos/15 min por clave; cleanup oportunista de filas expiradas
- [x] 2.5 Crear `app/api/auth/[...nextauth]/route.ts` (`export const { GET, POST } = handlers`); eliminar `app/api/auth/{login,logout,session}/route.ts`

## 3. proxy.ts y consumidores
- [x] 3.1 `proxy.ts`: `NextAuth(authConfig).auth()` como guardia (edge-safe, sin Prisma); mismas rutas públicas (`/ingresar`, `/api/auth`), mismo matcher, 401 JSON para `/api`, redirect `/ingresar?next=` para páginas
- [x] 3.2 `app/ingresar/page.tsx`: flujo credentials Auth.js (csrf + POST callback/credentials con `X-Auth-Return-Redirect`), mapeo de `code` a mensajes P1, preserva `?next=` interno-only y estados de carga
- [x] 3.3 `app/api/admin/usuarios/route.ts`, `app/api/backup/route.ts`, `app/api/admin/seed-authz/route.ts`: usar `await auth()` (lookup por `Usuario.id`), eliminar fallback "admin legado"/`ADMIN_EMAIL`; seed-authz queda admin-only
- [x] 3.4 `app/comunidad/portal/page.tsx`: sesión Auth.js (`Boolean(d?.user)`); `lib/seed-authz.ts` + `scripts/seed-authz.mjs` + npm script `seed:authz`: usuarios TEST con `passwordHash` bcrypt (password TEST documentada), idempotente; `.env`/`.env.example` sin `ADMIN_EMAIL`/`ADMIN_PASSWORD`, `AUTH_SECRET` + nota `AUTH_TRUST_HOST`

## 4. Tests (red de seguridad P1)
- [x] 4.1 `test/helpers/sesion-authjs.ts`: mint de cookie `authjs.session-token` vía `@auth/core/jwt.encode` (secret, salt); `test/setup.ts` fija `AUTH_SECRET` default
- [x] 4.2 Rewrite `test/auth/proxy.test.ts` (node env, sesión real mintada): públicas, 401 JSON, redirect `?next=`, sesión válida pasa, cookie inválida falla cerrado
- [x] 4.3 Rewrite `test/auth/api-auth.test.ts` (node env): integración real contra handlers Auth.js con danza CSRF — login ok setea cookie y `GET /api/auth/session` retorna `user.id` = `Usuario.id`; credenciales inválidas → `code=credentials` + fallo persistido; 10 fallos → `code=rate_limited`; usuario inactivo → `code=credentials`; signout limpia cookie
- [x] 4.4 Nuevo `test/auth/rate-limit.test.ts` (node env, DB): 10 fallos bloquean, ventana 15 min expira (createdAt antiguo), claves independientes, cleanup borra expirados
- [x] 4.5 Rewrite `test/auth/lib-auth.test.ts`: callbacks/config de `lib/auth.config.ts` (strategy jwt, pages, session.user.id = token.sub) y superficie de `lib/auth.ts`; sin credenciales de entorno
- [x] 4.6 Actualizar `test/auth/ingresar-page.test.tsx`: MSW handlers a `/api/auth/csrf` + `/api/auth/callback/credentials` (éxito, `code=credentials`, `code=rate_limited`, conexión, sin JSON, disabled, `?next=`); mismos mensajes P1
- [x] 4.7 Actualizar `test/api-admin-usuarios.test.ts` y `test/api-backup-authz.test.ts`: mock `next/headers` (`vi.hoisted`) + cookie mintada; 401/403/200 preservados
- [x] 4.8 `grep -r compass_session` limpio (código y tests); suite completa verde

## 5. Validación y cierre
- [x] 5.1 `npx tsc --noEmit && npm run lint && npm test` verde; `npx prisma validate`; `npm run build` OK (edge bundle de proxy sin Prisma)
- [x] 5.2 `openspec validate au-authjs` sin fallos; migración commiteada
- [x] 5.3 Sync mains: spec `AU-autenticacion-sesion` actualizada al archivar + `openspec/specs/project.md` fila AU; `openspec archive au-authjs --yes`
- [x] 5.4 nsgc-prepush: avance P5, manual de autenticación (AU) reescrito, mocks de sesión en Catálogo de Mocks + Data Dump, Trazabilidad → fila SERIE-PLATAFORMA HECHA + Bitácora → push
