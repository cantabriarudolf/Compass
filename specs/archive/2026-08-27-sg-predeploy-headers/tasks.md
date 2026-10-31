## 1. D-i — CSP report-only con nonce vía proxy

- [x] 1.1 Auditar orígenes necesarios: `self`, imágenes `https:`/`data:`/`blob:` (logo/imagenUrl), YouTube embeds `youtube.com`/`youtu.be`, fonts `fonts.googleapis.com`/`gstatic` desde `app/layout.tsx` y `next/font/google`; `grep` y documentar en `design.md`
- [x] 1.2 Implementar nonce por request en `k0mp4ss_fe/apps/web/proxy.ts` (Web Crypto `randomUUID`/getRandomValues, header `Content-Security-Policy-Report-Only` con política auditada, `x-nonce`/`x-csp-nonce`, sin emitir `Content-Security-Policy` enforcement)
- [x] 1.3 Añadir opcional `app/api/csp-report/route.ts` sink para telemetría dev y documentar en `design.md` plan de activación enforcement (qué telemetría revisar, cuándo forzar, criterio 0 violations 7 días)

## 2. D-ii — Headers dominio configurable

- [x] 2.1 Documentar `PUBLIC_DOMAIN=` en `k0mp4ss_fe/apps/web/.env.example` (vacío, owner define; no hardcodear) y comentario HSTS preload
- [x] 2.2 Verificar y complementar `k0mp4ss_fe/apps/web/next.config.mjs` `securityHeaders`: mantiene `X-Frame-Options DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `HSTS max-age=63072000; includeSubDomains` **sin** `preload` (documenta que preload se activa con dominio), añade `X-DNS-Prefetch-Control`, `X-Permitted-Cross-Domain-Policies`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy` (y `Cross-Origin-Embedder-Policy credentialless` si no rompe dev)
- [x] 2.3 Crear `k0mp4ss_fe/apps/web/scripts/check-headers.mjs` e integrar `package.json` script `check:headers` que imprima headers (lectura estática `next.config.mjs`+`proxy.ts` CSP + `fetch` vivo si `next dev` corre) para verificación manual/`securityheaders.com`; documentar límite `next build` Google Fonts y uso `next dev + curl`

## 3. D-iii — Re-chequeos scripted 5/5

- [x] 3.1 Crear `k0mp4ss_fe/apps/web/scripts/security-recheck.mjs` (node, invocación handlers directa, sin `next start` requerido) que verifica e imprime OK/FAIL por cada check y hace `process.exit(1)` si falla
- [x] 3.2 Crear `k0mp4ss_fe/apps/web/test/security-rechecks.test.ts` (vitest integración) con 5 checks equivalentes para suite verde, usando `NextRequest`/`Request` reales y `test/helpers/sesion-authjs.ts`:
  - [x] 3.2.1 `POST /api/backup` con body >10 MB → 413
  - [x] 3.2.2 APIs escritura (`/api/backup`, `/api/dev-dashboard`) con `APP_ENV=production`/`NEXT_PUBLIC_APP_ENV=production` → 404
  - [x] 3.2.3 `toggleTask`/`PATCH /api/dev-dashboard` con `changeId` path traversal (`../../etc/passwd`, `..%2F..%2Fetc/passwd`) → 404/sanitizado (SAFE_CHANGE_ID)
  - [x] 3.2.4 `proxy` `GET /admin/*` sin cookie → redirect 307/308 a `/ingresar?next=`
  - [x] 3.2.5 `proxy`/`GET /api/admin/usuarios` sin sesión → 401 JSON
- [x] 3.3 Añadir `package.json` script `check:rechecks` (o `security:recheck`) que ejecute el script node y asegurar que `npm test` incluye re-chequeos 5/5 OK

## 4. Validación y cierre

- [x] 4.1 `openspec validate --all` sin fallos, `npm run typecheck`/`tsc --noEmit`, `npm run lint`, `npm test` verde (incluido `security-rechecks` 5/5), `node scripts/security-recheck.mjs` 5/5 OK, `node scripts/check-headers.mjs` imprime headers; `SERIE-PLATAFORMA.md` P6 → HECHA al archivar
