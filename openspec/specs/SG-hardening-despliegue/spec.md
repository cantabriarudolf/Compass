# SG-hardening-despliegue Specification

## Purpose
Checklist técnico de seguridad para completar la Fase C restante (pre-Base de Datos) y ejecutar íntegramente la Fase D (pre-deploy a producción). Derivado del consolidado de auditorías `Data/NSGC/docs/auditorias/consolidado - 2026-08-24-b.md` y de `Data/NSGC/docs/especificaciones/SG - Hardening y Despliegue.md`. Esta capability cubre SG §1 Fase C pendiente al migrar a BD: C1 modelo Prisma con `comunidadId` indexado, C1b repositorios con scoping obligatorio + tests de aislamiento A/B, y C3b constraints de unicidad compuesta opcionales documentadas.
## Requirements
### Requirement: Modelo Prisma con comunidadId en toda entidad de dominio (C1)
El sistema SHALL proveer `k0mp4ss_fe/apps/web/prisma/schema.prisma` con `datasource db { provider = "sqlite" url = env("DATABASE_URL") }` y `generator client { provider = "prisma-client-js" }`, que modele el inventario definitivo de colecciones derivado de `CompassData` en `lib/store.ts` (v26: estructura, comunidad, portal, notificaciones, controles, actas, CO/GE/IR/IN/MT/RA/CV/FI/PE/PL/CT/RE, eventos, configuración sin secretos) y de `lib/schemas.ts`, incluyendo los 20 maestros de `MaestroCollections`. Toda entidad de dominio SHALL llevar `comunidadId String` con `@@index([comunidadId])` y relación a `Comunidad` (D3 tenant compartido). `DATABASE_URL` SHALL vivir en `.env.local` (gitignored) y estar documentado en `.env.example`; archivos `*.db` SHALL estar gitignored y `prisma/migrations` commiteada. `prisma migrate dev` SHALL correr limpio.

#### Scenario: Prisma instalado y migración limpia
- **WHEN** se instala `prisma` + `@prisma/client` (SQLite dev) y se ejecuta `prisma migrate dev --name init` con `DATABASE_URL=file:./dev.db` en `.env.local`
- **THEN** la migración aplica sin errores, `prisma generate` crea el cliente y `openspec validate --all` sigue verde.

#### Scenario: Toda entidad con comunidadId indexado
- **WHEN** se inspecciona `prisma/schema.prisma`
- **THEN** cada `model` de dominio (salvo `Comunidad` raíz) contiene `comunidadId String`, `comunidad Comunidad @relation(...)` y `@@index([comunidadId])`.

### Requirement: Repositorios con scoping obligatorio por comunidadId y tests de aislamiento (C1b)
El sistema SHALL exponer repositorios server-side en `k0mp4ss_fe/apps/web/lib/repos/` con factory obligatorio `crearRepositorio(comunidadId: string)` que scopée TODA lectura/escritura por `comunidadId`. Ningún método SHALL exponer query sin `where: { comunidadId }`; `lib/prisma.ts` SHALL ser singleton PrismaClient y no exponer cliente sin scope a `app/`. Tests SHALL usar sqlite `:memory:` o archivo temporal y SHALL demostrar aislamiento A/B: crear dos comunidades A/B, crear entidad con `repoA`, intentar leer/escribir cross-comunidad con `repoB` SHALL FALLAR (findById retorna null, update/delete no muta).

#### Scenario: Aislamiento cross-comunidad falla
- **WHEN** `repoA = crearRepositorio(comunidadA)` crea un `TipoUnidad` y `repoB = crearRepositorio(comunidadB)` hace `findById(id)` o `update/delete` sobre ese id
- **THEN** la lectura retorna `null` y la escritura no afecta al registro de A (0 filas afectadas o error controlado).

#### Scenario: Listado no fuga cross-comunidad
- **WHEN** cada comunidad tiene datos y se llama `findMany` con cada repo
- **THEN** cada listado contiene solo los registros de su propia `comunidadId`.

### Requirement: Constraints de unicidad compuesta opcionales tabla por tabla (C3b)
El sistema MAY definir constraints de unicidad compuesta `@@unique([comunidadId, campo])` tabla por tabla, conforme a D5 (repetidos permitidos en la app, la BD decide). Cada constraint añadida SHALL estar documentada en `openspec/changes/bd-prisma-fundamento/design.md` con justificación; las tablas sin constraint SHALL explicitar la decisión de no-constraint. Ejemplos válidos: `Comunidad.slug @unique`, `TipoUnidad @@unique([comunidadId, nombre])`, `MacroSector @@unique([comunidadId, nombre])`, `FondoFI @@unique([comunidadId, nombre])`, `ProveedorPE @@unique([comunidadId, rut])`. Repetidos cross-comunidad SHALL seguir permitidos.

#### Scenario: Constraint por comunidad documentada
- **WHEN** se declara `@@unique([comunidadId, nombre])` en `TipoUnidad`
- **THEN** duplicar `nombre` dentro de la misma `comunidadId` falla a nivel BD, pero el mismo `nombre` en otra `comunidadId` se permite y la decisión está justificada en `design.md`.

#### Scenario: No-constraint documentada (D5)
- **WHEN** `Unidad.numero` no lleva `@@unique`
- **THEN** `design.md` justifica la omisión (número repetible en distintos microsectores, D5) y la app lo permite.

### Requirement: Secretos de configuración por variables de entorno (C2-final)
Los campos sensibles `smtpPassword` y `claveEliminacionMaestro` SHALL dejar de existir en `ConfiguracionGlobalSchema` (`lib/schemas.ts`) y en `data/admin/configuracion.ts` (seed `configuracionDefault`). El store cliente SHALL persistir `STORE_VERSION = 26` y su `migrate` SHALL eliminar ambos campos del `configuracion` persistido v25 sin romper el resto del estado (patrón v8 limpieza legacy). El `partialize` SHALL simplificarse para no vaciar secretos (ya no existen). La UI `/admin/configuracion` SHALL mostrar ambos secretos como "gestionados por el servidor (variables de entorno SMTP_PASSWORD / CLAVE_ELIMINACION_MAESTRO)" sin input editable. `.env.example` SHALL documentar `SMTP_PASSWORD` y `CLAVE_ELIMINACION_MAESTRO`.

#### Scenario: Schema sin secretos
- **WHEN** se inspecciona `lib/schemas.ts` y `data/admin/configuracion.ts`
- **THEN** `ConfiguracionGlobalSchema` y la interfaz `ConfiguracionGlobal` no contienen `smtpPassword` ni `claveEliminacionMaestro`, y `configuracionDefault` no los define

#### Scenario: Migrate v25→v26 limpia secretos
- **WHEN** existe un persistido v25 con `configuracion: { smtpPassword: "x", claveEliminacionMaestro: "y", nombreComunidad: "...", ... }`
- **THEN** al hidratar con `STORE_VERSION=26` el migrate elimina `smtpPassword` y `claveEliminacionMaestro` del estado resultante y preserva todos los demás campos y colecciones

#### Scenario: UI informativa sin inputs
- **WHEN** el administrador abre `/admin/configuracion` tabs SMTP y Operación y Seguridad
- **THEN** ve notas informativas "Gestionado por el servidor (variable de entorno SMTP_PASSWORD / CLAVE_ELIMINACION_MAESTRO)" y no hay `<input type="password">` para esos campos; guardar no envía secretos

#### Scenario: partialize simplificado
- **WHEN** se inspecciona `lib/store.ts` `partialize`
- **THEN** `configuracion` se persiste tal cual sin mapear `smtpPassword: ""` ni `claveEliminacionMaestro: ""`

#### Scenario: .env.example documenta vars
- **WHEN** se lee `k0mp4ss_fe/apps/web/.env.example`
- **THEN** contiene `SMTP_PASSWORD` y `CLAVE_ELIMINACION_MAESTRO` con comentarios indicando que son secretos servidor

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

