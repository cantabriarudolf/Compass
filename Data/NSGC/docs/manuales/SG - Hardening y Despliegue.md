# 🛡️ SG - Hardening y Despliegue

Acá verificás que Compass está listo para salir a producción con los candados de seguridad activos. Desde P6 (serie original), la app emitía CSP en modo report-only con nonce; desde FASE2 P5 está en **enforcement** con `report-uri` (ver abajo); **desde sg-csp-enforcement (2026-10-06) hay toggle `CSP_ENFORCEMENT`** que permite alternar entre Report-Only y Enforcement sin redeploy. headers HSTS sin preload (dominio aún no existe) y un runbook de re-chequeos scripted 5/5. Desde P7, además, la auditoría OWASP final está cerrada (cero 🔴 abiertos, informe `Data/NSGC/docs/auditorias/auditoria - 2026-08-27 - owasp-final.md`) y hay runbook de backups/restauración de BD (`backup:db`/`restore:db`).

## 🚀 Funcionalidad Principal

Blindar la plataforma antes del deploy real del owner: CSP estricta en report-only (sin forzar), headers contra dominio definitivo configurable por env, re-chequeos manuales convertidos en script repetible y respaldo/restauración de la BD Prisma con verificación de conteos.

## 🛠️ Secciones

- **CSP report-only con nonce + toggle enforcement** (SG §3 D-i, P6 + sg-csp-enforcement 2026-10-06): `k0mp4ss_fe/apps/web/proxy.ts:12` genera nonce por request (`crypto.randomUUID()` → 32 hex) y emite **`Content-Security-Policy-Report-Only`** por defecto (`CSP_ENFORCEMENT=false`). Si `CSP_ENFORCEMENT=true` → emite **`Content-Security-Policy`** (enforcement). Directivas idénticas en ambos modos (orígenes auditados, nonce, strict-dynamic):
  `default-src 'self'` · `script-src 'self' 'nonce-{x}' 'strict-dynamic' 'unsafe-inline' 'unsafe-eval' https:` (Next inline/HMR tolerados en report-only) · `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com` · `font-src 'self' data: https://fonts.gstatic.com https://fonts.googleapis.com` · `img-src 'self' data: blob: https:` · `connect-src 'self'` · `frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com` · `media-src 'self' https: data: blob:` · `object-src 'none'` · `base-uri 'self'` · `form-action 'self'` · `frame-ancestors 'none'`. También propaga `x-nonce`/`x-csp-nonce` a downstream. Sink `POST /api/csp-report` **público** (es el `report-uri` que envía el navegador; sin sesión, con rate limit 60 POST/min por IP → 429) que loguea las violations sanitizadas: es la telemetría del criterio de 0 violations.
  **Toggle sin redeploy**: cambiar `CSP_ENFORCEMENT` en Vercel → efecto inmediato en siguiente request. Rollback instantáneo: `CSP_ENFORCEMENT=false` → Report-Only.
  Auditoría: `app/layout.tsx:1` `next/font/google` (Inter/Geist) → `fonts.googleapis.com`/`gstatic` · `app/visor-mensajes/page.tsx:90,133,137` (`<img src={...}>`, `<iframe youtube>`) · `components/admin/logo-uploader`/`community-header` (`next/image` remoto).
  Tests: 18 unit (`test/proxy.nonce.test.ts`, `test/proxy.csp.test.ts`, `test/proxy.header-selection.test.ts`) + e2e `e2e/csp-modos.spec.ts` (contrato del header según el modo del **servidor** — el navegador no puede cambiarlo —, directivas auditadas, nonce y unicidad por request) y `e2e/csp-report-endpoint.spec.ts` (GET 200, POST 204, límite por IP). Los `/api/health` y `/api/csp-report` son públicos por diseño.

- **Headers y dominio configurable** (SG §3 D-ii, P6): `k0mp4ss_fe/apps/web/next.config.mjs:2` `securityHeaders` vía `headers()` `source: "/(.*)"`:
  `X-Frame-Options DENY` · `X-Content-Type-Options nosniff` · `Referrer-Policy strict-origin-when-cross-origin` · `Permissions-Policy camera=(), microphone=(), geolocation=()` · `Strict-Transport-Security max-age=63072000; includeSubDomains` **sin** `preload` (documentado que `preload` se activa solo con dominio real) · `X-DNS-Prefetch-Control on` · `X-Permitted-Cross-Domain-Policies none` · `Cross-Origin-Opener-Policy same-origin` · `Cross-Origin-Resource-Policy same-origin` · `Cross-Origin-Embedder-Policy credentialless` (compatible con youtube embeds, no rompe HMR dev).
  Dominio definitivo en `.env.example:1` `PUBLIC_DOMAIN=` (vacío, owner define; no hardcodear; `hstspreload.org` cuando toque). Límite: `next build` falla por Google Fonts sin red → usar `next dev` + `npm run check:headers` (ver `scripts/check-headers.mjs`).

- **Runbook de verificación** (SG §3 D-iii, P6): los 5 re-chequeos manuales ahora scripted:
  1. `POST /api/backup` >10 MB → `413` (`MAX_BACKUP_BYTES 10*1024*1024` en `app/api/backup/route.ts:11` con `content-length` + `Buffer.byteLength`).
     El endpoint **no escribe en el disco del servidor**: responde el respaldo como adjunto `compass-backup-AAAA-MM-DD_HH-mm.json` (la fecha la fija el servidor; el cliente solo aporta el prefijo semántico, p. ej. `compass-seed-report`) con `Cache-Control: no-store`. En producción ese disco es efímero y una copia que se pierde no es un respaldo: el respaldo real de la BD son `backup:db` / `restore:db` (abajo). Guardas intactas: producción → 404, sin sesión → 401, sin rol → 403 con `RP_PERMISSION_DENIED`.
  2. APIs escritura con `APP_ENV=production` (`NEXT_PUBLIC_APP_ENV`/`APP_ENV` → `lib/env-guard.ts:10` `isWriteApiEnabled()=false`) → `404` (`/api/backup`, `/api/dev-dashboard` GET/POST/PUT/PATCH).
  3. Path traversal `changeId` → `404`/sanitizado (`lib/dev-dashboard.ts:464` `SAFE_CHANGE_ID=/^[A-Za-z0-9][A-Za-z0-9._-]*$/` + `readProjectFile` allowlist `ALLOWED_FILE_PREFIXES`). Ej. `toggleTask("../../etc/passwd")` → null.
  4. `GET /admin/*` sin cookie → `307/308` redirect a `/ingresar?next=` (`proxy.ts:65` `encodeURIComponent(pathname)`).
  5. `GET /api/*` sin sesión → `401` JSON `No autenticado.` (proxy + handlers `auth()`).
  Ejecutables: `k0mp4ss_fe/apps/web/scripts/security-recheck.mjs` (estático, `node scripts/security-recheck.mjs` → 5/5 OK) y `k0mp4ss_fe/apps/web/test/security-rechecks.test.ts` (vitest, `NextRequest` real + `test/helpers/sesion-authjs.ts`, imprime OK/FAIL). También `npm run check:headers` (fetch vivo si `next dev` corre, sino estático).
  ⚠️ **Opt-in e2e `E2E_ALLOW_WRITE_APIS=1`** (e2e-guard-optin-ci, 2026-10-13): el guard `isWriteApiEnabled()` (`lib/env-guard.ts`) acepta un opt-in explícito **exclusivo de la lane e2e del CI** (job `e2e`): habilita las APIs de escritura en el build de producción que sirve la lane, donde sin él la limpieza bulk del QA-Lab cae al fallback O(n) y revienta los 120 s estrictos de las limpiezas de cola. Tiene **doble candado**: requiere además `NEXT_PUBLIC_APP_ENV=development`; un entorno con `NEXT_PUBLIC_APP_ENV=production` (Vercel/prod) sigue devolviendo 404 aunque el opt-in esté seteado. **Producción no debe setearlo**. Detalle: `k0mp4ss_fe/apps/web/docs/runbook-operaciones.md` §"APIs de escritura bloqueadas (env-guard)". (`GOOGLE_PROVIDER_DISABLED` es otra bandera del mismo saneamiento, pero vive en **AU - Autenticación y Sesión** — acá no se documenta porque SG no cubre el provider Google.)

- **Backups de BD** (SG §3 D-vi, P7): scripts npm en `k0mp4ss_fe/apps/web`:

  - `npm run backup:db` (→ `scripts/backup-db.mjs`): vuelca la BD SQLite dev a `Data/NSGC/backups/db-<timestamp>/` con:
    `sqlite/dev.db` (copia consistente: `PRAGMA wal_checkpoint(TRUNCATE)` antes de copiar, así no hace falta copiar `-wal`/`-shm`), `tables/<Model>.json` por cada modelo de `prisma/schema.prisma` (69 tablas, export vía Prisma `findMany`) y `manifest.json` (timestamp, conteos por tabla, total de filas, `sha256` y bytes de la copia). Acepta `--label=pre-restore` para snapshots etiquetados.
  - `npm run restore:db -- db-<timestamp>|latest [--yes]` (→ `scripts/restore-db.mjs`): restaura desde `Data/NSGC/backups/`. Guardas: **bloqueado con `APP_ENV=production`** (la BD gestionada de prod la opera el owner con su proveedor, fuera de alcance), **exige `--yes` o `RESTORE_CONFIRM=1`** (sobrescribe la BD actual), y **crea snapshot `db-<ts>-pre-restore` automáticamente antes de tocar nada**. Tras copiar el archivo de vuelta (y limpiar `-wal`/`-shm` obsoletos) verifica los conteos de cada tabla contra el manifest e imprime divergencias; sale `exit 2` si hay divergencias.
  - **Destino/origen configurable con `--dir` (2026-10-26):** `backup:db` y `restore:db` aceptan `--dir <ruta>` (o `--dir=<ruta>`) para escribir/leer el backup en otro lado; sin el flag todo sigue igual (`Data/NSGC/backups/`). El snapshot pre-restore se guarda en el mismo `--dir`. Además ambos scripts leen **primero `DATABASE_URL` del shell** (gana sobre `.env`, la misma convención de `e2e-fresh.mjs`): p. ej. `DATABASE_URL=file:./perf-test.db npm run restore:db -- latest --yes` restaura una base descartable de pruebas sin tocar `dev.db`.
  - **Drill de restauración automatizado (2026-10-26, `npm run db:drill` → `scripts/drill-restore.mjs`):** sustituye la prueba a mano de P7; corre en CI en el job `unit` (después de `npm test`, con la misma `DATABASE_URL` descartable del job, sin secretos) y deja el job en rojo (`exit 1`) si algo no cuadra. Ciclo:

    1. **Guardas duras**: aborta si `DATABASE_URL` no es `file:` o si el archivo no es `perf*.db` (nunca `dev.db`, nunca producción); también aborta si el entorno es producción.
    2. Crea su **propio directorio temporal** en `os.tmpdir()`: nunca escribe en `Data/NSGC/backups/` (le pasa `--dir` propio a backup y restore).
    3. Corre `backup:db --dir <tmp> --label=drill` (mismo pipeline; subproceso).
    4. Lee el manifest y memoriza los conteos por tabla.
    5. Muta a propósito: inserta una fila marcadora en `RateLimitAttempt` (`clave=DRILL-RESTORE-<ts>`).
    6. Corre `restore:db --dir <tmp> <backup> --yes` (snapshot pre-restore dentro del mismo tmpdir).
    7. Verifica: la fila marcadora **ya no existe** y los conteos coinciden tabla por tabla con el manifest.
    8. Borra el tmpdir (siempre, en `finally`) y imprime el resumen en pantalla.

  - **Prueba histórica a mano (antecedente, P7 2026-08-27):** `backup:db` → backup `db-20260827T163813` (69 tablas, 18 filas, sha256 5d4a714b…); se insertó fila de prueba `RateLimitAttempt clave='RESTORE-TEST-PROOF'`; `restore:db --yes` → snapshot pre-restore automático, **69 tablas verificadas contra manifest, 0 divergencias** y la fila de prueba borrada (estado exactamente el del backup). Ese mismo ciclo es hoy el `db:drill` automatizado de arriba.
  - **Producción (pendiente del owner):** el provider/schedule/retención de la BD gestionada queda a elección del owner al definir `DATABASE_URL` de prod (ej. managed Postgres + snapshots del proveedor + retención 30d). Este runbook cubre el ciclo dev (SQLite) y el patrón manifest+verificación a replicar en prod. `restore:db` nunca corre contra prod (guardia `APP_ENV`).

- **Wipe de datos de prueba y anonimización de la bitácora** (pe-paneles-bd, 2026-10-25/26): dos comandos npm en `k0mp4ss_fe/apps/web`.
  - `npm run datos:reset` (→ `scripts/datos-reset.mjs`): borra la base SQLite local, migra, regenera el client del schema correcto (la trampa del `prisma generate` de PostgreSQL del job `unit-pg`) y resiembra con `seed:authz` + `seed:mocks` + `db:punto-cero` (histórico 2023-2024) + `db:fondos-fi` (fondos de demo financieros, F17). Guardas: bloqueado con `NEXT_PUBLIC_APP_ENV`/`APP_ENV`/`NODE_ENV` en producción —gana la variable **más restrictiva**, para que un `.env` con `development` no sombree un `APP_ENV=production` del shell— y con un `DATABASE_URL` que no sea `file:` local. No toca el navegador: esa mitad es «Borrar datos locales» en `/admin/dev-dashboard` (`localStorage.clear()` con confirmación y aviso de que la base no se toca).
  - `npm run datos:anonimizar` (→ `scripts/anonimizar-bitacora.mjs`): a los **90 días** anonimiza al visitante de la bitácora PE (la asesoría del 2026-10-26 no encontró plazo legal de conservación para registros de acceso: 90 días por minimización, y los 5 años quedan para documentación administrativa) (`nombre`, `dni`, `patente`, `notas`) y **conserva** fecha, estado, hora, jornada, unidad y destinatario: el registro y su trazabilidad quedan, el tercero deja de estar identificado. Idempotente, con `--dry-run` y evento `PE_BITACORA_ANONIMIZADA` cuando afecta filas. Guardas: producción y base no-SQLite bloqueadas salvo `--si-produccion` explícito (en prod la corrida la decide el owner). **Sin agendar todavía**: hoy es manual.
  - La lane e2e siembra el histórico financiero con `db:punto-cero` dentro de `e2e:reseed-base` (y también los fondos de demo con `db:fondos-fi`, F17), y ese script corre con `vite-node --config vitest.config.ts` porque su fixture se importa con el alias `@`.
  - `npm run db:catalogo-nacional` (F20 fase 2, `scripts/seed-catalogo-nacional.ts`): asegura los **ocho catálogos del país** (bancos, AFPs, previsiones de salud, mutuales/cajas, feriados, índices de ajuste, cajas de compensación, unidades de medida) definidos en `data/admin/maestros.ts`. El catálogo es **global por id** —la clave primaria del maestro es sólo `id` y lo leen todas las comunidades—, así que el upsert sólo asegura la existencia (`update: {}`): la `comunidadId` queda como etiqueta del primero que sembró cada fila y una segunda corrida no reasigna nada. No borra filas ni toca maestros propios ni el ocultamiento (`MaestroOculto`, que sigue siendo por comunidad). Acepta `--comunidad-id` (flag o `COMUNIDAD_ID`) para limitar el alcance; sin comunidades en la base sale avisando con exit 0.

- **Smoke de la app publicada** (2026-10-26, `npm run smoke:produccion` → `scripts/smoke-produccion.mjs`): nadie revisaba lo desplegado — el job `deploy` de CI terminaba sin comprobar que la app responde. A mano: `npm run smoke:produccion -- https://<dominio>` (o `SMOKE_URL=<url>`; `--esperar 60` si el deploy recién acaba y la URL aún propaga). Con `fetch` nativo y timeout ~15 s por request verifica:

  1. `GET /api/health` → `200` con `status: "ok"` y `checks.database: "ok"`.
  2. `GET /ingresar` → `200` y la página incluye un campo de correo (`type="email"`).
  3. `GET /privacidad` → `200`.
  4. `GET /api/importar/estructura/plantilla` → **`401`** (el candado sigue puesto: un `200` significa que se abrió algo que no debe).

  Imprime un resumen (`N/N chequeos OK`) y sale `exit 1` con el detalle de cada chequeo fallido. En CI, el job `deploy` de `.github/workflows/ci.yml` captura la URL de `vercel deploy` en `GITHUB_OUTPUT` (`steps.vercel_deploy.outputs.deploy_url`) y corre el smoke justo después del deploy —la salida del CLI deja la URL final en stdout—, solo si el deploy efectivamente se ejecutó (mismo condicional de los secrets de Vercel). Si el smoke falla, el job queda en rojo: es el punto.

- **Corte SQLite → PostgreSQL antes del build** (st-migracion-postgres 3.2, 2026-10-05): `npm run db:prod:migrar-datos` (→ `scripts/deploy-migrar-datos.mjs`) valida que `DATABASE_URL` sea PG (fail-closed, la URL nunca se imprime completa), crea el esquema baseline con `prisma db push` y migra los datos con `scripts/migrate-sqlite-to-postgres.mjs` (idempotente, backup previo de SQLite, verificación de conteos por tabla — probado en local: 23087 filas, 71/71 tablas, 0 fallidas). El build corre DESPUÉS, nunca antes. El deploy manual `npm run deploy:vercel` solo migra si `MIGRAR_DATOS_DESDE_SQLITE=1` (por defecto no toca datos); el job `deploy` de CI no se tocó. Corte real con Neon = decisión del owner (credenciales y corrida, fuera de esta serie).

- **Plan de activación CSP enforcement** (D-i + sg-csp-enforcement): 
  1. **Telemetría 7 días** con `CSP_ENFORCEMENT=false` (Report-Only): monitorear DevTools Console → CSP violations, Network → `content-security-policy-report-only`, y `/api/csp-report` (POST sink estructurado). Rutas clave: `/`, `/ingresar`, `/admin/*`, `/visor-mensajes` con y sin youtube.
  2. **Criterio 0 violations 7 días consecutivos** → flip `CSP_ENFORCEMENT=true` en Vercel (inmediato, sin redeploy).
  3. **Validación post-flip**: 24h monitoreo intensivo; si violations → rollback instantáneo `CSP_ENFORCEMENT=false`.
  4. **Próximos pasos (futuro)**: quitar `unsafe-inline`/`unsafe-eval` de `script-src` dejando solo `'nonce-{x}' 'strict-dynamic'` (requiere nonces en todos los scripts inline Next.js 16+), activar `preload` en HSTS (`includeSubDomains; preload`) con dominio real, someter a `hstspreload.org` tras `securityheaders.com` A+.
  Runbook completo en `openspec/changes/sg-csp-enforcement/runbook.md`.

    - **Cifrado en reposo AES-256-GCM** (FASE2 P4): `lib/crypto.ts` (sobre `v1.gcm.iv.tag.ct`, clave `CLAVE_CIFRADO_DATOS` ≥32 chars, fail-closed en prod sin clave) + `lib/prisma-cifrado.ts` (extensión opt-in transparente, bulk fail-closed). Activo en rutas 2FA (`twoFactorSecret`/`twoFactorBackupCodes`); resto mapeado (Persona, ProveedorPE, ConfiguracionGlobal) pendiente de rollout por módulo + blind index HMAC para búsquedas. Migración idempotente: `npm run cifrar:datos` (`scripts/cifrar-datos-existentes.mjs`, con `--dry-run`).

    - **Sentry** (FASE2 P5): `lib/sentry.ts` (no-op sin `SENTRY_DSN`), configs client/server/edge con redacción PII (emails/RUTs) en `beforeSend`, hook en `logger` error/fatal + `instrumentation.onRequestError`, `next.config.mjs` envuelto solo con DSN (source maps solo con `SENTRY_AUTH_TOKEN`). **Pendiente owner: pegar DSN real.**

    - **Privacidad y derechos ARCO** (FASE2 P6, Ley 21.719): páginas `/privacidad` y `/terminos` (scaffolds, **revisión legal pendiente**), API `/api/mis-datos` (GET portabilidad, DELETE olvido a 30 días con `solicitudEliminacion`, PATCH rectificación con auditoría) + UI `/admin/mis-datos` + banner de consentimiento en layout.

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
