# Auditoría de Seguridad — k0mp4ss_fe/apps/web (OWASP)

- **Fecha:** 2026-08-23
- **Tema:** Seguridad (revisión OWASP Top 10 2021)
- **Fase del proyecto:** Fase 0 — mock, monousuario, sin BD

## 1. Alcance

Auditoría estática de código sobre `k0mp4ss_fe/apps/web`:

- **APIs locales:** `app/api/backup/route.ts`, `app/api/dev-dashboard/route.ts` (rutas que escriben/leen archivos en disco).
- **Librerías:** `lib/backup.ts`, `lib/dev-dashboard.ts`, `lib/store-backup.ts`, `lib/env-guard.ts` (nuevo). `lib/store.ts` revisado solo desde la perspectiva de almacenamiento de secretos (sin modificar su lógica de dominio).
- **Páginas admin:** `app/admin/configuracion`, `mantenimiento`, `qa-lab`, `dev-dashboard`, `maestros`, `metricas`.
- **Configuración:** `next.config.mjs`, `data/admin/configuracion.ts`.

Referencia OWASP Top 10 2021: A01 (Broken Access Control), A02 (Cryptographic Failures), A05 (Security Misconfiguration), A07 (Identification & Auth Failures), A09 (Logging/Monitoring Failures). A03/A08/A10 sin superficie aplicable en fase mock sin BD.

## 2. Hallazgos

| ID | Severidad | Estado | Ubicación (`archivo:línea`) | Descripción |
|---|---|---|---|---|
| SEC-001 | 🔴 Alta | ✅ | `app/api/backup/route.ts:6`; `app/api/dev-dashboard/route.ts:6-56` | Rutas API con acceso al sistema de archivos activas por defecto en producción (CWE-486/CWE-16). Sin flag de entorno, cualquier despliegue expondría escritura de archivos y lectura del repo. |
| SEC-002 | 🔴 Alta | ✅ | `lib/dev-dashboard.ts:465` (`toggleTask`, vía PATCH `/api/dev-dashboard`) | Path traversal (CWE-22): `changeId` llegaba sin validar a `path.join(CHANGES_DIR, changeId)`; un valor con `../` permitía localizar un `tasks.md` fuera de `openspec/changes` y sobrescribirlo. |
| SEC-003 | 🟡 Media | ✅ | `app/api/backup/route.ts` (POST) | Sin límite de tamaño de payload (CWE-770/CWE-400): el cuerpo era volcado a disco íntegro, permitiendo agotar espacio en disco con una sola request. |
| SEC-004 | 🟡 Media | ✅ | Ambos route handlers (`catch` de cada verbo) | Fuga de información interna al cliente (CWE-209): se devolvía `error.message` crudo (mensajes de Node, rutas absolutas, detalle de `saveBackup`). |
| SEC-005 | 🟡 Media | ⏳ | `data/admin/configuracion.ts:27,46`; `lib/store.ts` (persist en localStorage); `data.path` en exports de backup | Secretos en claro en cliente (CWE-312): `smtpPassword` y `claveEliminacionMaestro` viven en localStorage sin cifrar y se copian dentro de cualquier export JSON generado en `admin/mantenimiento` o `admin/qa-lab`. |
| SEC-006 | 🟡 Media | ⏳ | `app/api/*`; todas las páginas `/admin/*` | Sin autenticación ni autorización (CWE-306). Riesgo contenido por ser app monousuario de localhost (Fase 0), pero bloqueante para cualquier despliegue multiusuario. |
| SEC-007 | 🟢 Baja | ✅ | `app/admin/configuracion/page.tsx:40` | `console.log("[AM] CF_UPDATE_PARAM", config)` volcaba la configuración completa —incluidos secretos— a la consola del navegador (CWE-532). |
| SEC-008 | 🟢 Baja | ✅ | `next.config.mjs` | Ausencia total de headers HTTP de seguridad (CWE-693): sin `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, etc. |
| SEC-009 | ℹ️ Info | ✔️ | `lib/backup.ts:24-25`; `lib/dev-dashboard.ts:489-494,541-547` | Observación positiva: `saveBackup` sanitiza `fileName` (solo `[a-zA-Z0-9._-]`) y `readProjectFile` valida con allowlist de prefijos resueltos. No se identificó bypass en lectura. |
| SEC-010 | ℹ️ Info | ⏳ | `next.config.mjs` | Sin Content-Security-Policy estricta (hardening frente a XSS, CWE-79). React mitiga XSS por escape automático, pero no hay defensa en profundidad. |

## 3. Acciones aplicadas en esta sesión

> **Adenda 2026-08-24 (sesión Fase B/C):**
> - **SEC-005 (parcial):** el `partialize` del persist vacía `smtpPassword` y `claveEliminacionMaestro` antes de escribir en localStorage; la UI de CF lo indica. Traslado definitivo a servidor pendiente como C2-final en `SG - Hardening y Despliegue.md`.
> - **SEC-006 (scaffold):** autenticación propia sin dependencias — `lib/auth.ts` (token HMAC-SHA256, cookie httpOnly 30 días, rate limit 10 fallos/15 min), `POST /api/auth/login|logout`, guardia `proxy.ts` sobre `/admin/*` y `/api/*` (401 JSON / redirect a `/ingresar`). Reemplazo por Auth.js documentado en `AU - Autenticacion y Sesion.md`.

1. **Flag de entorno** — Nuevo `lib/env-guard.ts`: `getAppEnv()` / `isWriteApiEnabled()`.
   - Variable `NEXT_PUBLIC_APP_ENV` (fallback servidor `APP_ENV`): valores `dev|development|prod|production`.
   - Si no está definida, se hereda `NODE_ENV`: `next dev` queda habilitado sin configuración extra; `next build && next start` (producción) queda **deshabilitado por defecto**.
   - Aplicado en `POST /api/backup` y en los cuatro verbos de `/api/dev-dashboard`: respuesta `404 {"error":"Not Found"}` indistinguible de una ruta inexistente.
2. **Límite de tamaño en `POST /api/backup`** — Tope de 10 MB verificado en dos capas: header `Content-Length` y longitud real en bytes del cuerpo leído (`Buffer.byteLength`). Excedido → `413`.
3. **Errores genéricos al cliente** — Todos los `catch` devuelven mensajes fijos (`Error interno del servidor`, `Recurso no disponible`, `No se pudo guardar el backup`). El detalle real se registra solo en `console.error` del servidor. JSON malformado devuelve `400 Cuerpo JSON inválido`.
4. **Fix path traversal (SEC-002)** — `toggleTask` ahora rechaza `changeId` que no cumpla `/^[A-Za-z0-9][A-Za-z0-9._-]*$/` (excluye `/`, `\`, prefijo `.`) y verifica que el candidato sea directorio antes de escribir.
5. **Headers de seguridad (SEC-008)** — `next.config.mjs` con `headers()` global: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (cámara/mic/geoloc off), `Strict-Transport-Security`.
6. **Redacción de secretos en logs (SEC-007)** — El log de `CF_UPDATE_PARAM` sustituye `smtpPassword` y `claveEliminacionMaestro` por `***`.

Nota: no se modificaron mocks (`data/**`) ni lógica de dominio del store (`lib/store.ts`).

## 4. Pendientes

| Hallazgo | Condición para abordarlo |
|---|---|
| SEC-005 (secretos en localStorage) | Al salir de fase mock: mover SMTP y clave de eliminación a variables de entorno/bóveda del backend cuando exista BD/API server. Mientras tanto, tratar todo export JSON como sensible y no compartirlo. |
| SEC-006 (authN/authZ ausente) | Al introducir multiusuario o exponer la app fuera de `localhost`: middleware de sesión + protección de `/admin/*` y de toda ruta API restante. |
| SEC-010 (CSP estricta) | Cuando el build de producción se estabilice: definir política con nonces/hashes para los scripts inline de Next.js y auditar orígenes de imágenes/fuentes. |
| Warnings `turbo/no-undeclared-env-vars` | Declarar `NEXT_PUBLIC_APP_ENV`/`APP_ENV` en `turbo.json` si se desea silenciarlos (mismo patrón que el ya existente para `COMPASS_ROOT`). |

## 5. Verificación

Comandos ejecutados en `k0mp4ss_fe/apps/web`:

```
npm run lint      → OK: 0 errores, 60 warnings (preexistentes; 2 nuevos avisos turbo/no-undeclared-env-vars, documentados arriba)
npm run typecheck → OK: sin errores (tsc --noEmit)
```

Pruebas manuales sugeridas (fase dev):
- `curl -i -X POST localhost:3000/api/backup` con cuerpo > 10 MB → espera `413`.
- `NEXT_PUBLIC_APP_ENV=production npm run start` + `curl -i localhost:3000/api/backup` → espera `404`.
- PATCH `/api/dev-dashboard` con `changeId: "../../etc"` → espera `404 Recurso no encontrado`.
