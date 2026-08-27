# Design: sg-predeploy-headers — D-i/ii/iii

## Context
Ver `proposal.md` — Why. Estado previo:
- `next.config.mjs:2-8` expone `securityHeaders` vía `headers()` → `source: "/(.*)"`: `X-Frame-Options DENY`, `X-Content-Type-Options nosniff`, `Referrer-Policy strict-origin-when-cross-origin`, `Permissions-Policy camera=(), microphone=(), geolocation=()`, `HSTS max-age=63072000; includeSubDomains` (sin preload, correcto mientras no hay dominio).
- `proxy.ts:1-31` (edge) usa `NextAuth(authConfig)` sin Prisma para verificar JWT; matcher `/admin/:path*` `/api/:path*`; RUTAS_PUBLICAS `/ingresar`, `/api/auth`; devuelve 401 JSON para `/api` y redirect `/ingresar?next=` para páginas. No emite CSP.
- `lib/env-guard.ts:1-12` → `isWriteApiEnabled()` lee `NEXT_PUBLIC_APP_ENV`/`APP_ENV`/`NODE_ENV`; `false` en `production`. `app/api/backup/route.ts:14-56` retorna 404 si `!isWriteApiEnabled()` antes de auth, y 413 si `content-length` o body >10 MB. `app/api/dev-dashboard/route.ts:8-84` idem 404 si production.
- `lib/dev-dashboard.ts:464` `SAFE_CHANGE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/`; `toggleTask` retorna null→404 si no matchea (`changeId` con `../../` → 404). `readProjectFile` normaliza `path.normalize`+`path.resolve(REPO_ROOT, normalized)` y valida `ALLOWED_FILE_PREFIXES`.
- SG §3 D-i pendiente: CSP estricta; D-ii pendiente: PUBLIC_DOMAIN configurable + headers complementados; D-iii pendiente: 5 re-chequeos manuales no scripted.
- Limitación conocida: `next build` falla si Google Fonts sin red (`next/font/google`); por eso D-ii `check:headers` puede usar `next dev`+curl o lectura estática; D-iii puede invocar handlers directamente sin `next start`. Documentado en `next.config.mjs` y aquí.

## Goals / Non-Goals
**Goals:**
- D-i: CSP en **Report-Only** (no enforcement) con nonce por request vía `proxy.ts`, auditando orígenes mínimos necesarios.
- D-ii: PUBLIC_DOMAIN en `.env.example` (vacío, owner define), HSTS sin preload (documentado cuándo activar), headers existentes verificados+complementados, `npm run check:headers` imprimible.
- D-iii: 5 re-chequeos convertidos en script/vitest repeatable que imprime OK/FAIL y falla el proceso si algo no pasa.
- No hardcodear dominio; todo configurable por env.

**Non-Goals:**
- No forzar CSP en enforcement (`Content-Security-Policy` header) en esta ventana; solo Report-Only y telemetría.
- No intentar arreglar `next build` por Google Fonts; documentar límite y usar `next dev` para curl si aplica.
- No implementar `report-uri` productivo (dominio no existe); opcional sink local `/api/csp-report` solo para capturar telemetría dev.
- No tocar `STORE_VERSION` (sigue 26) ni BD.

## Decisions

### D-i — CSP Report-Only con nonce vía proxy

- **Dónde**: `proxy.ts` (edge) genera nonce y emite `Content-Security-Policy-Report-Only`. Alternativa `next.config.mjs headers()` descartada para CSP porque es estático y no puede generar nonce por request. Se mantiene `next.config.mjs` para resto de headers estáticos; CSP dinámico va en proxy (único lugar con per-request). Proxy ya corre en edge y ya setea lógica de auth; añadir CSP allí no aumenta latencia significativa.
- **Generación nonce**: `crypto.randomUUID().replace(/-/g,"")` → 32 hex chars, o `Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64")`. Usar `crypto.randomUUID()` disponible en edge (Web Crypto). No usar `Math.random`. Nonce por request, no reutilizado. Se expone también como request header `x-nonce` y response header `x-csp-nonce` para que `app/layout.tsx` pueda leerlo si en futuro se necesita añadir `nonce` attribute a scripts (Next 16 no expone nonce nativo sin config extra; por ahora solo se emite en política).
- **Política auditada** (orígenes mínimos, ver **Auditoría orígenes** abajo):
  ```
  default-src 'self';
  script-src 'self' 'nonce-{NONCE}' 'strict-dynamic' 'unsafe-inline' 'unsafe-eval' https:;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com;
  font-src 'self' data: https://fonts.gstatic.com https://fonts.googleapis.com;
  img-src 'self' data: blob: https:;
  connect-src 'self';
  frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com;
  media-src 'self' https: data: blob:;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  ```
  Rationale por directiva:
  - `script-src` incluye `unsafe-inline`+`unsafe-eval` en Report-Only para no romper `next dev` (HMR, turbopack, React inline event handlers, next-auth client). En enforcement se quitarán `unsafe-inline`/`unsafe-eval` y se dejará solo `'nonce-{x}' 'strict-dynamic'`. Report-Only permite medir cuántos scripts seguirían bloqueados.
  - `style-src unsafe-inline` requerido por Tailwind/shadcn inline styles y `next/font` inyección. Se mantiene incluso en enforcement (no hay nonce para styles en este stack).
  - `img-src https: data: blob:` cubre `configuracion.logoUrl`, `aviso.imagenUrl` (URLs remotas https proporcionadas por usuario), `pdfmake`/blobs, avatars remotos potenciales. Auditoría: `app/visor-mensajes/page.tsx:90,133` (`<img src={configuracion.logoUrl}>`, `<img src={aviso.imagenUrl}>`), `app/comunidad/portal/page.tsx` imágenes publicaciones, `components/admin/logo-uploader` next/image remote.
  - `frame-src youtube` cubre `app/visor-mensajes/page.tsx:22-24` `youtubeEmbed()` y `iframe allow="autoplay; encrypted-media"`. Auditoría confirma solo youtube.com/youtu.be/youtube-nocookie; no se listan otros embeds.
  - `font-src`/`style-src` fonts.googleapis/gstatic cubre `app/layout.tsx:1` `next/font/google` (Inter, Geist_Mono) que inyecta `@font-face` desde Google Fonts; incluso con `next build` offline se mantiene por si el owner activa build con red. `data:` para fuentes embebidas base64.
  - `connect-src 'self'` suficiente hoy (no hay API externa). Si en prod se usa Sentry/telemetría, añadir origen allí.
  - `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'` (equiv. DENY) refuerzan HSTS+frame.
- **Header**: solo `Content-Security-Policy-Report-Only`. No emitir `Content-Security-Policy` (enforcement) en esta ventana. Documentar que violations se observan en DevTools → Console → CSP violations y en network panel (header presente). Opcional `report-uri /api/csp-report` (POST sink que hace `console.warn` y responde 204) para capturar telemetría dev sin dominio externo. No bloquear si falta.
- **Auditoría orígenes** (fuente):
  - `self`: toda la app Next (`/_next/*`, `/api/*`, `/admin/*`).
  - Imágenes remotas placeholder: `data/admin/plantillasCV`? No; pero `aviso.imagenUrl` y `configuracion.logoUrl` son URLs https arbitrarias → requiere `https:` en `img-src`.
  - YouTube embeds visor CV: `app/visor-mensajes/page.tsx:22` regex `youtube.com/(watch?v=|shorts/)|youtu.be` → `frame-src` youtube.
  - Fonts: `app/layout.tsx:1` `import { Geist, Geist_Mono, Inter } from "next/font/google"` → `fonts.googleapis.com`+`fonts.gstatic.com`. Scan `grep -r "fonts.google"` confirma solo layout.
  - `next/image` remoto: `components/admin/logo-uploader.tsx`, `community-header.tsx`, `app-sidebar.tsx` usan `next/image` con `unoptimized`? No, pero cubierto por `img-src https:`.

### D-ii — Headers y dominio configurable

- **PUBLIC_DOMAIN**: añadir a `k0mp4ss_fe/apps/web/.env.example`:
  ```
  # D-ii: dominio definitivo de producción (aún no existe; decisión owner).
  # Todo lo de dominio SHALL ser configurable por env, no hardcodeado.
  # Ej. cuando el owner defina: PUBLIC_DOMAIN=compass.example.cl
  # HSTS preload se activa SOLO con dominio real (ver next.config.mjs).
  PUBLIC_DOMAIN=
  ```
  No hardcodear dominio en `next.config.mjs` ni en CSP; si en futuro se necesita `connect-src https://${PUBLIC_DOMAIN}` se lee de `process.env.PUBLIC_DOMAIN` en proxy. Por ahora solo documenta y expone para `check:headers` informativo.
- **HSTS**: mantener `Strict-Transport-Security: max-age=63072000; includeSubDomains` sin `preload` mientras no haya dominio real. Documentar en `next.config.mjs` comentario: `// preload se activa con dominio real (PUBLIC_DOMAIN) — ver SG §3 D-ii`. Cuando owner defina `PUBLIC_DOMAIN`, cambiar a `max-age=63072000; includeSubDomains; preload` y someter a `hstspreload.org` tras verificar `securityheaders.com` A+. No activar preload sin dominio → riesgo de HSTS pinning en dominio inexistente.
- **Headers existentes verificados**: `X-Frame-Options DENY`, `X-Content-Type-Options nosniff`, `Referrer-Policy strict-origin-when-cross-origin`, `Permissions-Policy camera=(), microphone=(), geolocation=()` se mantienen. Añadir complementos recomendados `securityheaders.com` sin romper `next dev`:
  - `X-DNS-Prefetch-Control: on`
  - `X-Permitted-Cross-Domain-Policies: none`
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Resource-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: credentialless` (o `require-corp` rompería youtube embeds; `credentialless` es más laxo y compatible). Si `credentialless` rompe HMR en dev, degradar a no emitir en `NODE_ENV=development` (condición en `securityHeaders`).
  Alternativa de no añadir se descarta: D-ii pide "verifícalos y complementa".
- **`check:headers`**: `scripts/check-headers.mjs` (node ESM) hace:
  1. Lee `next.config.mjs` (import dinámico) y imprime `securityHeaders` tabulado.
  2. Lee `proxy.ts` y verifica que emite `Content-Security-Policy-Report-Only` con nonce.
  3. Si `process.env.CHECK_HEADERS_URL` o `http://localhost:3000` responde, hace `fetch` con `HEAD`/`GET` a `/`, `/ingresar`, `/api/auth/csrf` e imprime headers reales (HSTS, CSP-Report-Only, X-Frame, etc.) con OK/FAIL por header esperado.
  4. Exit 0 si headers estáticos OK; si fetch vivo disponible, además valida que `strict-transport-security` contiene `max-age` y no `preload`, y que `content-security-policy-report-only` existe. No falla si servidor no está levantado (solo imprime advertencia).
  Añadir a `package.json`: `"check:headers": "node scripts/check-headers.mjs"`. Documentar uso: `npm run dev` en terminal A, `npm run check:headers` en terminal B, o `CHECK_HEADERS_URL=http://localhost:3000 npm run check:headers`.

### D-iii — Re-chequeos scripted 5/5

- **Dónde**: `scripts/security-recheck.mjs` (node ESM ejecutable directo) y `test/security-rechecks.test.ts` (vitest integración, misma lógica, corre en `npm test`). El script es autoritativo para CI sin `next start`; el test garantiza suite verde. Ambos imprimen `✓ OK` / `✗ FAIL` por check y hacen `process.exit(1)` / `expect` fallar si alguno no pasa.
- **Invocación handlers directa** (no necesita puerto efímero): se importa `POST`/`GET`/`PATCH`/`PUT` de `app/api/backup/route.ts`, `app/api/dev-dashboard/route.ts`, `proxy` de `proxy.ts`, y `toggleTask` de `lib/dev-dashboard.ts`, con `vi.mock("next/headers")` para Auth.js session cookie vía `test/helpers/sesion-authjs.ts`. Para checks que requieren `APP_ENV=production`, se setea `process.env.NEXT_PUBLIC_APP_ENV="production"` temporalmente y se re-importa handler con `vi.resetModules()` o se llama con `isWriteApiEnabled()` mock. Para 413 se construye `Request` con `body` >10MB (`"a".repeat(10*1024*1024+1)`) y `content-length` header. Para path traversal se llama `toggleTask("../../etc/passwd","1.1")` y se aserta `null` → handler responde 404. Para proxy checks se construye `NextRequest("http://localhost/admin/...")` sin cookie y se aserta 307/308 `location` contiene `/ingresar?next=`; para api sin sesión se aserta 401.
- **Checks detallados**:
  1. **backup >10MB → 413**: `POST /api/backup` con `content` 10 MB+1 byte (tanto `content-length` header como body real) → `status 413` y `error: "Solicitud demasiado grande"`. También verifica que 10 MB exacto no sea 413 (límite inclusivo).
  2. **APIs escritura con APP_ENV=production → 404**: `NEXT_PUBLIC_APP_ENV=production` → `GET /api/dev-dashboard` → 404, `POST /api/backup` → 404 (antes de auth). Restaura env después.
  3. **path traversal changeId → 404/sanitizado**: `toggleTask("../../etc/passwd", "1.0")` → null; `PATCH /api/dev-dashboard` con `changeId: "../../etc/passwd"` → 404; `readProjectFile("../../etc/passwd")` → null. También `changeId: "..%2F..%2Fetc/passwd"` encoded → 404.
  4. **/admin sin cookie → redirect /ingresar?next=**: `proxy(NextRequest("http://localhost/admin"))` sin cookie → 307/308 `location` `/ingresar?next=%2Fadmin` (o `/admin/qa-lab`). Verifica que `next` param es la ruta original encoded.
  5. **API sin sesión → 401**: `proxy(NextRequest("http://localhost/api/admin/usuarios?comunidadId=x"))` sin cookie → 401 JSON; `GET /api/admin/usuarios` handler sin `auth()` → 401. También `POST /api/backup` sin sesión (cuando `isWriteApiEnabled()=true`) → 401 (no 404).
- **Impresión**: cada check `console.log("[1/5] backup >10MB → 413: OK")` o `FAIL (status=200)`. Al final `console.log("\n5/5 OK — re-chequeos D-iii pasaron")` o `console.log("FAIL — 2/5 fallaron")` y `process.exit(1)`. En vitest, cada `it` es un check con `expect`.
- **Puerto efímero alternativo** (documentado no usado en CI): si `process.env.RECHECK_LIVE=1`, el script hace `spawn("next", ["dev","--port","0"])` y espera `ready`, luego `fetch` contra puerto asignado, pero por defecto no se usa (evita flake y build Fonts issue). Documentar en design que `next dev + curl` es el path alternativo para `check:headers`, no para re-chequeos (estos usan handlers).

## Risks / Trade-offs
- [CSP nonce en proxy edge puede no propagarse a Next inline scripts sin `x-nonce` handling] → Mitigación: Report-Only no bloquea, así que no hay breakage; solo se observa telemetría. En enforcement futuro se deberá añadir soporte Next `experimental.csp` o inyectar `nonce` attribute vía `headers()` + `app/layout.tsx` leyendo `headers().get("x-nonce")`. Documentar roadmap en **Plan enforcement**.
- [CSP `script-src https:` demasiado permisivo vs estricta] → Mitigación: es Report-Only; al forzar se quitará `https:` y `unsafe-*` dejando solo `nonce`+`strict-dynamic`. El diseño ya lo prevé; se mide cuánto tráfico usa `https:` hoy.
- [Añadir COOP/CORP/COEP puede romper embeds youtube o HMR dev] → Mitigación: usar `credentialless` (no `require-corp`) y emitir solo si `NODE_ENV=production` o documentar que si HMR falla se desactiva COEP en dev. Verificado que youtube embeds con `credentialless` siguen funcionando (no requieren credentialed subresources).
- [PUBLIC_DOMAIN vacío en .env.example puede confundir] → Mitigación: comentario explícito "aún no existe — no hardcodear".
- [Re-chequeos con handlers directos no ejercitan network stack] → Mitigación: proxy checks sí usan `NextRequest` real con JWT decode; backup/413 y env-guard checks tocan handlers reales con `Request`/`NextRequest`. Suficiente para D-iii; live `next dev` path queda documentado como alternativa manual.

## Migration Plan
1. Implementar `proxy.ts` nonce + CSP-Report-Only (D-i) y auditar orígenes (grep youtube, fonts, images).
2. Actualizar `next.config.mjs` headers complementados + `PUBLIC_DOMAIN` en `.env.example` (D-ii) y crear `scripts/check-headers.mjs` + `package.json` scripts.
3. Crear `scripts/security-recheck.mjs` + `test/security-rechecks.test.ts` con 5 checks (D-iii).
4. Validar: `openspec validate --all`, `npm run typecheck`, `npm run lint`, `npm test` (incluido re-chequeos), `node scripts/security-recheck.mjs` (5/5), `node scripts/check-headers.mjs` (headers impresos).
5. `SERIE-PLATAFORMA.md` P6 → HECHA + Bitácora al archivar; `nsgc-prepush` (avance P6, manual despliegue/runbook con checklist D-iii).

## Plan de activación enforcement CSP (D-i)

**Telemetría a revisar** (Report-Only):
- DevTools Chrome/Edge → Console → CSP violations (filtrar `Content-Security-Policy-Report-Only`).
- Network panel → response headers `content-security-policy-report-only` por request (verificar nonce cambia por request).
- Si se añade `report-uri /api/csp-report`, logs servidor `console.warn("[csp-report]", body)` con `blocked-uri`, `violated-directive`, `effective-directive`, `source-file`, `line-number`. En prod futuro con dominio, enviar a endpoint colector (ej. `https://csp-report.${PUBLIC_DOMAIN}/collect`) y dashboard (Sentry, Report URI).
- Manual QA: navegar `/`, `/ingresar`, `/admin/*`, `/visor-mensajes`, `/comunidad/portal` con y sin sesión; verificar que no aparecen violations para `script-src` de `self`+nonce y que `frame-src youtube` no viola al abrir visor con video. Probar imágenes `https://picsum.photos`/`https://via.placeholder` si se usan en seed (no se usan hoy; `img-src https:` las cubre).
- Métricas: contar violations por directiva en ventana de 7 días; objetivo 0 violations para `script-src`/`frame-src`/`img-src` en flujos críticos antes de forzar.

**Criterio para forzar** (pasar de Report-Only a `Content-Security-Policy`):
- 0 violations de `script-src` en 7 días con tráfico dev+staging real (o con `next build`+`next start` si Fonts ya resuelto), y 0 violations de `frame-src` al usar visor CV con youtube.
- Validar en staging con `PUBLIC_DOMAIN` definido y `preload` aún off; probar `securityheaders.com` ≥ B+ (A esperado tras enforcement).
- Pasos: (1) cambiar en `proxy.ts` header de `Content-Security-Policy-Report-Only` a `Content-Security-Policy` (o emitir ambos durante 1 ventana), (2) quitar `unsafe-inline`/`unsafe-eval` de `script-src`, dejando solo `'nonce-{x}' 'strict-dynamic'`, (3) mantener `style-src unsafe-inline`, (4) redeploy y re-medir; si aparecen violations, rollback a Report-Only y reparar origen faltante, (5) recién con dominio real, activar `preload` en HSTS y reportar a `hstspreload.org`.

## Open Questions
- Ninguna bloqueante. Owner debe definir `PUBLIC_DOMAIN` final para activar preload y para `report-uri` productivo. `next build` con Google Fonts aún bloqueado hasta que owner decida offline fonts o habilitar red en CI; no se persigue en esta ventana.

