# AU - Autenticación y Sesión

Define la capa de autenticación y autorización del frontend. Fase actual: scaffold propio sin dependencias, pensado para monousuario en desarrollo local. Reemplazo definitivo planificado: **Auth.js (NextAuth v5)** cuando exista base de datos (decisión D2 del consolidado 2026-08-24).

## 1. Estado implementado (Fase B2 — sesión 2026-08-24)

- **`lib/auth.ts` (solo servidor):** token de sesión `base64url(payload).hmac-sha256` firmado con `AUTH_SECRET`. Verificación con `timingSafeEqual`, expiración 30 días. Rate limiting en memoria: máx. 10 intentos fallidos por IP cada 15 min → HTTP 429.
- **Credenciales:** variables `ADMIN_EMAIL` / `ADMIN_PASSWORD`. En desarrollo, si no existen, fallback a `admin@compass.local` / `compass-dev`. En producción sin variables configuradas el login siempre falla (401).
- **`AUTH_SECRET`:** obligatorio (≥16 caracteres) en producción — su ausencia devuelve 503. En desarrollo, si no se define, se usa un secreto de fallback fijo (`compass-dev-secret-solo-desarrollo`) para no bloquear el arranque local.
- **Rate limiting:** la clave de intentos es la IP del header `x-forwarded-for` (fallback `"local"`); es un valor suplantable si la app se expone sin proxy de confianza, motivo adicional para el rate limiting persistente de SG D-v.
- **Cookie:** `compass_session`, `httpOnly`, `sameSite=lax`, `secure` en producción, `path=/`.
- **Rutas API:** `POST /api/auth/login` (crea cookie), `POST /api/auth/logout` (la invalida). Ambas públicas; todo lo demás bajo `/api/*` exige sesión.
- **`proxy.ts` (Next 16, reemplaza middleware.ts):** matcher `/admin/:path*` y `/api/:path*`; páginas protegidas redirigen a `/ingresar?next=<ruta>`, APIs responden 401 JSON. Rutas públicas: `/ingresar`, `/api/auth`.
- **Página de login:** `app/ingresar/page.tsx` (cliente, respeta `?next=`).
- **Rol único `"admin"`** implícito en la sesión. No hay aún tabla de roles.

## 2. Variables de entorno requeridas

```
AUTH_SECRET=<aleatorio >=16 caracteres>
ADMIN_EMAIL=<correo del administrador>
ADMIN_PASSWORD=<contraseña>
NEXT_PUBLIC_APP_ENV=development|production   # ya usado por lib/env-guard.ts
```

Registrarlas en `.env.local` (gitignored) y en Vercel al desplegar. Nunca commitear valores reales.

## 3. Reemplazo por Auth.js (cuando haya BD)

Una IA que implemente esto debe:

1. Instalar `next-auth@beta` y mover la emisión/verificación de sesión a Auth.js (provider credentials + adapter de BD); conservar `proxy.ts` como guardia de borde usando `auth()` en lugar de `verificarToken`.
2. Migrar usuarios: crear tabla `usuarios` vinculada a `MP - Maestro de Personas` (una persona puede tener 0..1 cuenta). El `sub` del token pasa a ser el id de usuario en BD.
3. Sustituir el rate limiting en memoria por uno persistente (o del proveedor).
4. Eliminar `ADMIN_EMAIL`/`ADMIN_PASSWORD` y el fallback dev de `lib/auth.ts`; mantener `AUTH_SECRET`.
5. Actualizar los tests que mockean la cookie `compass_session`.

## 4. Autorización con roles (B3 — pendiente, depende de RP + D3)

- La spec de roles es `RP - Roles y Permisos.md`; el modelo multi-comunidad elegido es **tenant compartido con `comunidadId`** (D3).
- Al existir BD: roles **por comunidad** (`membresias: {usuarioId, comunidadId, rol}`). El scoping se implementa SOLO en la capa repositorio/servidor (nunca confiar en el cliente) y debe tener tests de aislamiento que demuestren que un admin de comunidad A no lee ni muta datos de comunidad B.
- Interfaz sugerida: `lib/authz.ts` exportando `puede(rol, accion, recurso)` mapeando las acciones de RP; `proxy.ts` solo decide autenticación, la autorización fina vive en server actions/route handlers.

## 5. Reglas vigentes mientras tanto

- Toda ruta nueva bajo `/admin` o `/api` queda automáticamente protegida por el matcher de `proxy.ts`; si una API nueva debe ser pública, añadirla explícitamente a `RUTAS_PUBLICAS` con justificación.
- Los secretos de configuración (SMTP, clave de eliminación maestro) NO se persisten en localStorage (SEC-005, ver `SG - Hardening y Despliegue.md` §2).
