# Spec Delta: SG-hardening-despliegue — D-i/ii/iii CSP + headers + re-chequeos

## MODIFIED Requirements

### Requirement: Modelo Prisma con comunidadId en toda entidad de dominio (C1)
El sistema SHALL proveer `k0mp4ss_fe/apps/web/prisma/schema.prisma` con `datasource db { provider = "sqlite" url = env("DATABASE_URL") }` y `generator client { provider = "prisma-client-js" }`, que modele el inventario definitivo de colecciones derivado de `CompassData` en `lib/store.ts` (v26: estructura, comunidad, portal, notificaciones, controles, actas, CO/GE/IR/IN/MT/RA/CV/FI/PE/PL/CT/RE, eventos, configuración sin secretos) y de `lib/schemas.ts`, incluyendo los 20 maestros de `MaestroCollections`. Toda entidad de dominio SHALL llevar `comunidadId String` con `@@index([comunidadId])` y relación a `Comunidad` (D3 tenant compartido). `DATABASE_URL` SHALL vivir en `.env.local` (gitignored) y estar documentado en `.env.example`; archivos `*.db` SHALL estar gitignored y `prisma/migrations` commiteada. `prisma migrate dev` SHALL correr limpio.

#### Scenario: Prisma instalado y migración limpia
- **WHEN** se instala `prisma` + `@prisma/client` (SQLite dev) y se ejecuta `prisma migrate dev --name init` con `DATABASE_URL=file:./dev.db` en `.env.local`
- **THEN** la migración aplica sin errores, `prisma generate` crea el cliente y `openspec validate --all` sigue verde.

#### Scenario: Toda entidad con comunidadId indexado
- **WHEN** se inspecciona `prisma/schema.prisma`
- **THEN** cada `model` de dominio (salvo `Comunidad` raíz) contiene `comunidadId String`, `comunidad Comunidad @relation(...)` y `@@index([comunidadId])`.

## ADDED Requirements

### Requirement: CSP estricta en modo report-only con nonce (D-i)
El sistema SHALL emitir `Content-Security-Policy-Report-Only` (y SHALL NOT emitir `Content-Security-Policy` enforcement en esta ventana) por cada respuesta vía `k0mp4ss_fe/apps/web/proxy.ts` (edge) con nonce único por request (Web Crypto `randomUUID`/`getRandomValues` base64, expuesto como `x-nonce`/`x-csp-nonce`). La política SHALL auditar orígenes mínimos necesarios: `default-src 'self'`; `script-src 'self' 'nonce-{x}' 'strict-dynamic' 'unsafe-inline' 'unsafe-eval' https:` (Next inline/HMR tolerados en report-only); `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com`; `font-src 'self' data: https://fonts.gstatic.com https://fonts.googleapis.com`; `img-src 'self' data: blob: https:` (logo/aviso CV remotos); `connect-src 'self'`; `frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com` (visor CV YouTube embeds); `media-src 'self' https: data: blob:`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'`. El dominio real aún no existe (decisión owner): ningún dominio SHALL hardcodearse; orígenes configurables por env. El plan de activación enforcement (telemetría a revisar, criterio 0 violations 7 días, cuándo quitar `unsafe-*` y forzar) SHALL estar documentado en `openspec/changes/sg-predeploy-headers/design.md` y no se fuerza enforcement en esta ventana.

#### Scenario: CSP report-only presente con nonce por request
- **WHEN** se hace `GET /` o `/ingresar` (o cualquier ruta) vía `proxy.ts` y se inspecciona la respuesta
- **THEN** existe header `content-security-policy-report-only` con `default-src 'self'` y `script-src` conteniendo `'nonce-` + valor base64/hex único por request, `frame-src` contiene `youtube.com`, `img-src` contiene `https:` y `data:`, y **no** existe header `content-security-policy` (enforcement).

#### Scenario: Orígenes auditados cubren visor y fonts
- **WHEN** se auditan `app/visor-mensajes/page.tsx` (youtubeEmbed + `<img src={...}>` + `<iframe>`) y `app/layout.tsx` (`next/font/google` Inter/Geist)
- **THEN** la política `frame-src` lista `www.youtube.com` y `www.youtube-nocookie.com`, `img-src` lista `https:`/`data:`/`blob:` y `font-src`/`style-src` listan `fonts.googleapis.com`/`fonts.gstatic.com` conforme a `design.md`.

#### Scenario: Enforcement no forzado documentado
- **WHEN** se lee `design.md` sección "Plan de activación enforcement CSP"
- **THEN** describe qué telemetría revisar (DevTools CSP violations, `content-security-policy-report-only` header, opcional `/api/csp-report` sink), métricas y criterio de 0 violations 7 días antes de pasar de Report-Only a `Content-Security-Policy` quitando `unsafe-inline`/`unsafe-eval`.

### Requirement: Headers contra dominio configurable y script de verificación (D-ii)
El sistema SHALL documentar `PUBLIC_DOMAIN` en `k0mp4ss_fe/apps/web/.env.example` como variable vacía por defecto (dominio definitivo configurable por env, aún no existe; no hardcodeado). Los headers de seguridad en `k0mp4ss_fe/apps/web/next.config.mjs` SHALL verificarse y complementarse: `Strict-Transport-Security: max-age=63072000; includeSubDomains` **sin** `preload` mientras no haya dominio real (documentado que `preload` se activa solo con dominio), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()` SHALL permanecer, y SHALL añadirse `X-DNS-Prefetch-Control: on`, `X-Permitted-Cross-Domain-Policies: none`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin` (y `Cross-Origin-Embedder-Policy: credentialless` si no rompe `next dev` HMR). El sistema SHALL proveer `npm run check:headers` (`k0mp4ss_fe/apps/web/scripts/check-headers.mjs` o test) que imprima los headers para verificación: lectura estática de `next.config.mjs`+`proxy.ts` CSP y, si `next dev` corre, `fetch` vivo contra `http://localhost:3000` mostrando headers reales y validando HSTS sin `preload` y CSP-Report-Only presente. La limitación `next build` por Google Fonts sin red SHALL estar documentada (usar `next dev`+`curl`).

#### Scenario: .env.example documenta PUBLIC_DOMAIN vacío
- **WHEN** se lee `k0mp4ss_fe/apps/web/.env.example`
- **THEN** contiene `PUBLIC_DOMAIN=` con comentario indicando dominio aún no existe (decisión owner), configurable por env, no hardcodeado y que `preload` HSTS se activa solo con dominio.

#### Scenario: HSTS sin preload y headers complementados
- **WHEN** se inspecciona `k0mp4ss_fe/apps/web/next.config.mjs` `securityHeaders`
- **THEN** incluye `Strict-Transport-Security` con `max-age=63072000; includeSubDomains` y **no** contiene `preload`, incluye `X-Frame-Options DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, más `X-DNS-Prefetch-Control`, `X-Permitted-Cross-Domain-Policies`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy` (y `COEP credentialless` si aplica), con comentario documentando activación `preload` con dominio.

#### Scenario: check:headers imprime headers verificables
- **WHEN** se ejecuta `npm run check:headers` (o `node scripts/check-headers.mjs`) con o sin `next dev` corriendo
- **THEN** imprime la lista de `securityHeaders` de `next.config.mjs` con OK por header esperado, indica si `Content-Security-Policy-Report-Only` con nonce está presente en `proxy.ts`, y si hay servidor vivo hace `fetch` a `/` e imprime headers reales con OK/FAIL por `strict-transport-security` (max-age sin preload) y `content-security-policy-report-only`; exit 0 si estáticos OK.

### Requirement: Re-chequeos D-iii scripted repetibles 5/5 (D-iii)
El sistema SHALL proveer re-chequeos convertidos en script repetible: `k0mp4ss_fe/apps/web/scripts/security-recheck.mjs` (node, invocación handlers directa sin requerir `next start` en puerto efímero) y `k0mp4ss_fe/apps/web/test/security-rechecks.test.ts` (vitest integración) que verifican 5 casos imprimiendo `OK`/`FAIL` por check y fallando el proceso si alguno no pasa (exit 1 o `expect` fallido). Los checks SHALL ser: (1) `POST /api/backup` con payload >10 MB → `413`; (2) APIs escritura (`POST /api/backup`, `GET`/`POST`/`PUT`/`PATCH /api/dev-dashboard`) con `APP_ENV=production` (`NEXT_PUBLIC_APP_ENV=production`/`APP_ENV=production` → `isWriteApiEnabled()=false`) → `404`; (3) path traversal `changeId` en `toggleTask`/dev-dashboard (`"../../etc/passwd"`, `"..%2F..%2Fetc/passwd"`) → `404`/sanitizado via `SAFE_CHANGE_ID`/`readProjectFile` allowlist; (4) `proxy` `GET /admin/*` sin cookie de sesión → redirect `307`/`308` a `/ingresar?next={ruta}`; (5) `proxy`/`GET /api/admin/usuarios` (o `/api/*`) sin sesión → `401` JSON `No autenticado`. El script SHALL usar `NextRequest`/`Request` reales y helper `test/helpers/sesion-authjs.ts` donde aplique, y el límite `next build` por Fonts SHALL estar documentado (alternativa `next dev` en puerto efímero o handlers directos descrita en `design.md`).

#### Scenario: 5/5 re-chequeos OK
- **WHEN** se ejecuta `node scripts/security-recheck.mjs` (o `npm run check:rechecks`/`npm test` incluye `security-rechecks`)
- **THEN** imprime `[1/5] backup >10MB → 413: OK` … `[5/5] API sin sesión → 401: OK` y termina con `5/5 OK` y exit 0; si algún check falla imprime `FAIL` y exit 1 / test rojo.

#### Scenario: backup 413 por >10MB
- **WHEN** `POST /api/backup` con `content-length` >10 MB o body `Buffer.byteLength > 10*1024*1024`
- **THEN** responde `413` con `error: "Solicitud demasiado grande"`; con ≤10 MB no es 413.

#### Scenario: escritura en production → 404
- **WHEN** `process.env.NEXT_PUBLIC_APP_ENV="production"` y se llama `GET /api/dev-dashboard` o `POST /api/backup`
- **THEN** responde `404` con `error: "Not Found"` antes de auth (env-guard), independiente de sesión.

#### Scenario: path traversal sanitizado → 404
- **WHEN** `toggleTask("../../etc/passwd","1.0")` o `PATCH /api/dev-dashboard` con `changeId: "../../etc/passwd"`
- **THEN** retorna `null`/responde `404` (`Recurso no encontrado`/`Recurso no disponible`) y `readProjectFile("../../etc/passwd")` retorna `null` (allowlist `ALLOWED_FILE_PREFIXES`).

#### Scenario: admin sin cookie → redirect /ingresar?next=
- **WHEN** `proxy` recibe `NextRequest("http://localhost/admin/qa-lab")` sin cookie
- **THEN** responde `307` o `308` con `location` conteniendo `/ingresar?next=%2Fadmin%2Fqa-lab`.

#### Scenario: API sin sesión → 401
- **WHEN** `proxy` o handler `GET /api/admin/usuarios?comunidadId=x` recibe request sin cookie de sesión Auth.js
- **THEN** responde `401` JSON `error: "No autenticado."`.

