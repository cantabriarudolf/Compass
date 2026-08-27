# 🛡️ SG - Hardening y Despliegue

Acá verificás que Compass está listo para salir a producción con los candados de seguridad activos. Desde P6, la app emite CSP en modo report-only con nonce, headers HSTS sin preload (dominio aún no existe) y un runbook de re-chequeos scripted 5/5. Desde P7, además, la auditoría OWASP final está cerrada (cero 🔴 abiertos, informe `Data/NSGC/docs/auditorias/auditoria - 2026-08-27 - owasp-final.md`) y hay runbook de backups/restauración de BD (`backup:db`/`restore:db`).

## 🚀 Funcionalidad Principal

Blindar la plataforma antes del deploy real del owner: CSP estricta en report-only (sin forzar), headers contra dominio definitivo configurable por env, re-chequeos manuales convertidos en script repetible y respaldo/restauración de la BD Prisma con verificación de conteos.

## 🛠️ Secciones

- **CSP report-only con nonce** (SG §3 D-i, P6): `k0mp4ss_fe/apps/web/proxy.ts:12` genera nonce por request (`crypto.randomUUID()` → 32 hex) y emite `Content-Security-Policy-Report-Only` con orígenes auditados:
  `default-src 'self'` · `script-src 'self' 'nonce-{x}' 'strict-dynamic' 'unsafe-inline' 'unsafe-eval' https:` (Next inline/HMR tolerados en report-only) · `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com` · `font-src 'self' data: https://fonts.gstatic.com https://fonts.googleapis.com` · `img-src 'self' data: blob: https:` (logo `configuracion.logoUrl` y `aviso.imagenUrl` del visor CV pueden ser https remotas) · `connect-src 'self'` · `frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com` (visor CV `app/visor-mensajes/page.tsx:22` `youtubeEmbed`) · `media-src 'self' https: data: blob:` · `object-src 'none'` · `base-uri 'self'` · `form-action 'self'` · `frame-ancestors 'none'` (equiv. DENY). También propaga `x-nonce`/`x-csp-nonce` a downstream. No emite `Content-Security-Policy` enforcement en esta ventana (solo Report-Only). Sink opcional `POST /api/csp-report` (dev) loguea violations en servidor.
  Auditoría: `app/layout.tsx:1` `next/font/google` (Inter/Geist) → `fonts.googleapis.com`/`gstatic` · `app/visor-mensajes/page.tsx:90,133,137` (`<img src={...}>`, `<iframe youtube>`) · `components/admin/logo-uploader`/`community-header` (`next/image` remoto). Plan enforcement en `openspec/changes/sg-predeploy-headers/design.md` §Plan de activación.

- **Headers y dominio configurable** (SG §3 D-ii, P6): `k0mp4ss_fe/apps/web/next.config.mjs:2` `securityHeaders` vía `headers()` `source: "/(.*)"`:
  `X-Frame-Options DENY` · `X-Content-Type-Options nosniff` · `Referrer-Policy strict-origin-when-cross-origin` · `Permissions-Policy camera=(), microphone=(), geolocation=()` · `Strict-Transport-Security max-age=63072000; includeSubDomains` **sin** `preload` (documentado que `preload` se activa solo con dominio real) · `X-DNS-Prefetch-Control on` · `X-Permitted-Cross-Domain-Policies none` · `Cross-Origin-Opener-Policy same-origin` · `Cross-Origin-Resource-Policy same-origin` · `Cross-Origin-Embedder-Policy credentialless` (compatible con youtube embeds, no rompe HMR dev).
  Dominio definitivo en `.env.example:1` `PUBLIC_DOMAIN=` (vacío, owner define; no hardcodear; `hstspreload.org` cuando toque). Límite: `next build` falla por Google Fonts sin red → usar `next dev` + `npm run check:headers` (ver `scripts/check-headers.mjs`).

- **Runbook de verificación** (SG §3 D-iii, P6): los 5 re-chequeos manuales ahora scripted:
  1. `POST /api/backup` >10 MB → `413` (`MAX_BACKUP_BYTES 10*1024*1024` en `app/api/backup/route.ts:11` con `content-length` + `Buffer.byteLength`).
  2. APIs escritura con `APP_ENV=production` (`NEXT_PUBLIC_APP_ENV`/`APP_ENV` → `lib/env-guard.ts:10` `isWriteApiEnabled()=false`) → `404` (`/api/backup`, `/api/dev-dashboard` GET/POST/PUT/PATCH).
  3. Path traversal `changeId` → `404`/sanitizado (`lib/dev-dashboard.ts:464` `SAFE_CHANGE_ID=/^[A-Za-z0-9][A-Za-z0-9._-]*$/` + `readProjectFile` allowlist `ALLOWED_FILE_PREFIXES`). Ej. `toggleTask("../../etc/passwd")` → null.
  4. `GET /admin/*` sin cookie → `307/308` redirect a `/ingresar?next=` (`proxy.ts:65` `encodeURIComponent(pathname)`).
  5. `GET /api/*` sin sesión → `401` JSON `No autenticado.` (proxy + handlers `auth()`).
  Ejecutables: `k0mp4ss_fe/apps/web/scripts/security-recheck.mjs` (estático, `node scripts/security-recheck.mjs` → 5/5 OK) y `k0mp4ss_fe/apps/web/test/security-rechecks.test.ts` (vitest, `NextRequest` real + `test/helpers/sesion-authjs.ts`, imprime OK/FAIL). También `npm run check:headers` (fetch vivo si `next dev` corre, sino estático).

- **Backups de BD** (SG §3 D-vi, P7): scripts npm en `k0mp4ss_fe/apps/web`:

  - `npm run backup:db` (→ `scripts/backup-db.mjs`): vuelca la BD SQLite dev a `Data/NSGC/backups/db-<timestamp>/` con:
    `sqlite/dev.db` (copia consistente: `PRAGMA wal_checkpoint(TRUNCATE)` antes de copiar, así no hace falta copiar `-wal`/`-shm`), `tables/<Model>.json` por cada modelo de `prisma/schema.prisma` (69 tablas, export vía Prisma `findMany`) y `manifest.json` (timestamp, conteos por tabla, total de filas, `sha256` y bytes de la copia). Acepta `--label=pre-restore` para snapshots etiquetados.
  - `npm run restore:db -- db-<timestamp>|latest [--yes]` (→ `scripts/restore-db.mjs`): restaura desde `Data/NSGC/backups/`. Guardas: **bloqueado con `APP_ENV=production`** (la BD gestionada de prod la opera el owner con su proveedor, fuera de alcance), **exige `--yes` o `RESTORE_CONFIRM=1`** (sobrescribe la BD actual), y **crea snapshot `db-<ts>-pre-restore` automáticamente antes de tocar nada**. Tras copiar el archivo de vuelta (y limpiar `-wal`/`-shm` obsoletos) verifica los conteos de cada tabla contra el manifest e imprime divergencias; sale `exit 2` si hay divergencias.

  - **Prueba de restauración ejecutada (P7, 2026-08-27):** `backup:db` → backup `db-20260827T163813` (69 tablas, 18 filas, sha256 5d4a714b…); se insertó fila de prueba `RateLimitAttempt clave='RESTORE-TEST-PROOF'` (rateLimitAttempt pasó de 2 a 3 filas); `restore:db -- db-20260827T163813 --yes` → snapshot pre-restore `db-20260827T163850-pre-restore` creado automáticamente; **69 tablas verificadas contra manifest, 0 divergencias**; post-restore: fila de prueba `count=0`, total `rateLimitAttempt=2` (estado exactamente el del backup). Resultado: ✅ restauración funcional y verificable.
  - **Paso a paso para reproducir la prueba en local:**
    1. `npm run backup:db` → anota el nombre del dir `db-<ts>` impreso.
    2. Inserta una fila marcadora: `node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.rateLimitAttempt.create({data:{clave:'RESTORE-TEST-PROOF'}}).then(r=>console.log('insertada',r.id)).finally(()=>p.$disconnect())"`.
    3. Verifica que la fila está: `count` de `rateLimitAttempt` aumentó en 1.
    4. `npm run restore:db -- db-<ts> --yes` (usa el timestamp del paso 1).
    5. Verifica salida `69 tablas verificadas … 0 divergencias` y que la fila marcadora ya no existe (`count where clave='RESTORE-TEST-PROOF'` = 0).
    6. Los backups de prueba (`db-<ts>` y `db-<ts>-pre-restore`) se pueden borrar a mano tras verificar.
  - **Producción (pendiente del owner):** el provider/schedule/retención de la BD gestionada queda a elección del owner al definir `DATABASE_URL` de prod (ej. managed Postgres + snapshots del proveedor + retención 30d). Este runbook cubre el ciclo dev (SQLite) y el patrón manifest+verificación a replicar en prod. `restore:db` nunca corre contra prod (guardia `APP_ENV`).

- **Plan de activación CSP enforcement** (D-i): Telemetría en Report-Only: DevTools Console → CSP violations, Network → `content-security-policy-report-only`, opcional `/api/csp-report` (POST sink `console.warn`). Revisar 7 días de tráfico dev/staging, 0 violations para `script-src`/`frame-src`/`img-src` en `/`, `/ingresar`, `/admin/*`, `/visor-mensajes` con y sin youtube. Criterio 0 violations 7 días → cambiar en `proxy.ts` a `Content-Security-Policy` (o dual) quitando `unsafe-inline`/`unsafe-eval` dejando `'nonce-{x}' 'strict-dynamic'`, mantener `style-src unsafe-inline`. Redeploy + re-medir; si violations → rollback a Report-Only. Con dominio real, activar `preload` en HSTS (`includeSubDomains; preload`) y someter a `hstspreload.org` tras `securityheaders.com` A+.

## 💡 Tips de Oro

- **No hardcodear dominio**: todo lo de dominio es `PUBLIC_DOMAIN` en env. `preload` sin dominio pinnea HSTS en vacío → no activar.
- **Google Fonts sin red rompe `next build`**: usa `next dev` + `npm run check:headers` para verificar headers; no persigas el build aquí.
- **Report-Only no bloquea**: puedes navegar con violations sin que se caiga la app; sirve para medir antes de forzar.
- **Runbook repetible**: `npm test -- test/security-rechecks.test.ts` + `node scripts/security-recheck.mjs` deben dar 5/5 OK antes de cada deploy. Si alguno falla, el script hace `exit 1` (CI rojo).
- **Backup antes de tocar BD**: corre `npm run backup:db` antes de cualquier migración o restore; el manifest (sha256 + conteos) es tu punto de verificación. `restore:db` siempre crea su propio snapshot pre-restore igual.
- **Restore exige confirmación**: sin `--yes` el restore aborta — es deliberado, la BD se sobrescribe.

## 🔗 Dependencias

- Sesión y guardia en **AU - Autenticación y Sesión** (`proxy.ts` + `lib/auth.ts` + `test/helpers/sesion-authjs.ts`).
- Tenant y scoping en **ST - Capa de Datos Persistente** (`comunidadId` + `lib/prisma.ts` + `lib/env-guard.ts`).
- Visor CV en **16 - CO - Visor de Mensajes** (origen youtube auditado).
- Trazabilidad en **03 - Mapa de Desarrollo y Trazabilidad** y serie en `openspec/SERIE-PLATAFORMA.md` (P6 D-i/ii/iii, P7 D-iv + D-vi).
- Auditoría OWASP final en `Data/NSGC/docs/auditorias/auditoria - 2026-08-27 - owasp-final.md` (D-iv, P7).
