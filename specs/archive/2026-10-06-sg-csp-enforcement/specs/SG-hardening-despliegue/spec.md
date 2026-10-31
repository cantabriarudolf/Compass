# Delta for SG-hardening-despliegue

## RENAMED Requirements

- FROM: `### Requirement: CSP estricta en modo report-only con nonce (D-i)`
- TO: `### Requirement: CSP con nonce por request y toggle report-only/enforcement (D-i)`

## MODIFIED Requirements

### Requirement: CSP con nonce por request y toggle report-only/enforcement (D-i)
El sistema SHALL emitir `Content-Security-Policy-Report-Only` por defecto (cuando `CSP_ENFORCEMENT=false` o no está definido) y `Content-Security-Policy` en modo enforcement (cuando `CSP_ENFORCEMENT=true`) por cada respuesta vía `k0mp4ss_fe/apps/web/proxy.ts` (edge) con nonce único por request (Web Crypto `randomUUID`/`getRandomValues` base64, expuesto como `x-nonce`/`x-csp-nonce`). La política SHALL auditar orígenes mínimos necesarios: `default-src 'self'`; `script-src 'self' 'nonce-{x}' 'strict-dynamic' 'unsafe-inline' 'unsafe-eval' https:` (Next inline/HMR tolerados); `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com`; `font-src 'self' data: https://fonts.gstatic.com https://fonts.googleapis.com`; `img-src 'self' data: blob: https:` (logo/aviso CV remotos); `connect-src 'self'`; `frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com` (visor CV YouTube embeds); `media-src 'self' https: data: blob:`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'`. El dominio real aún no existe (decisión owner): ningún dominio SHALL hardcodearse; orígenes configurables por env. El plan de activación enforcement requiere 7 días consecutivos con **cero violaciones** en telemetría vía `/api/csp-report` antes de pasar de Report-Only a `Content-Security-Policy` (configurando `CSP_ENFORCEMENT=true`). El rollback inmediato se logra configurando `CSP_ENFORCEMENT=false`.
(Previously: CSP estricta en modo report-only obligatorio con nonce; enforcement no forzado y plan de activación documentado en design.md sin criterio de 7 días cero violaciones)

#### Scenario: CSP report-only presente con nonce por request
- **WHEN** se hace `GET /` o `/ingresar` (o cualquier ruta) vía `proxy.ts` con `CSP_ENFORCEMENT=false` o sin definir y se inspecciona la respuesta
- **THEN** existe header `content-security-policy-report-only` con `default-src 'self'` y `script-src` conteniendo `'nonce-` + valor base64/hex único por request, `frame-src` contiene `youtube.com`, `img-src` contiene `https:` y `data:`, y **no** existe header `content-security-policy` (enforcement).

#### Scenario: CSP enforcement presente con nonce por request (tras telemetría limpia)
- **WHEN** se hace `GET /` o `/ingresar` (o cualquier ruta) vía `proxy.ts` con `CSP_ENFORCEMENT=true` y se inspecciona la respuesta
- **THEN** existe header `content-security-policy` con `default-src 'self'` y `script-src` conteniendo `'nonce-` + valor base64/hex único por request, `frame-src` contiene `youtube.com`, `img-src` contiene `https:` y `data:`, y **no** existe header `content-security-policy-report-only`.

#### Scenario: Orígenes auditados cubren visor y fonts
- **WHEN** se auditan `app/visor-mensajes/page.tsx` (youtubeEmbed + `<img src={...}>` + `<iframe>`) y `app/layout.tsx` (`next/font/google` Inter/Geist)
- **THEN** la política `frame-src` lista `www.youtube.com` y `www.youtube-nocookie.com`, `img-src` lista `https:`/`data:`/`blob:` y `font-src`/`style-src` listan `fonts.googleapis.com`/`fonts.gstatic.com` conforme a `design.md`.

#### Scenario: Telemetría 7 días cero violaciones antes de enforcement
- **WHEN** `CSP_ENFORCEMENT=false` ha estado activo en staging/producción por 7+ días consecutivos
- **AND** el endpoint `/api/csp-report` registra **cero violaciones** durante todo el período
- **THEN** el equipo PUEDE activar enforcement configurando `CSP_ENFORCEMENT=true` en variables de entorno de producción
- **AND** el próximo despliegue o hot-reload emite `Content-Security-Policy` en lugar de `Content-Security-Policy-Report-Only`.

#### Scenario: Rollback inmediato a report-only
- **WHEN** `CSP_ENFORCEMENT=true` está activo y se detecta un problema
- **AND** el operador configura `CSP_ENFORCEMENT=false`
- **THEN** la **próxima respuesta** emite `content-security-policy-report-only` en lugar de `content-security-policy`
- **AND** todas las directivas CSP, generación de nonce y `strict-dynamic` permanecen idénticas
- **AND** no se requiere cambio de código, git revert, ni build.

#### Scenario: Enforcement no forzado sin telemetría limpia
- **WHEN** no se ha completado la ventana de 7 días con cero violaciones
- **THEN** `CSP_ENFORCEMENT` DEBE permanecer en `false` (Report-Only)
- **AND** cualquier intento de activar enforcement sin cumplir el criterio SHALL ser bloqueado por proceso operativo.

#### Scenario: Enforcement no forzado documentado
- **WHEN** se lee `design.md` (sección "Migration / Rollout" y la decisión "7-day zero-violations criterion as operational gate") y `runbook.md` (fases 2–4)
- **THEN** describen qué telemetría revisar (violaciones CSP en DevTools, header `content-security-policy-report-only`, el sink `/api/csp-report`), el criterio de cero violaciones por 7 días consecutivos y el procedimiento de flip/rollback antes de pasar de Report-Only a `Content-Security-Policy`.

## ADDED Requirements

### Requirement: CSP_ENFORCEMENT documentado en `.env.example` con default false

`k0mp4ss_fe/apps/web/.env.example` SHALL documentar `CSP_ENFORCEMENT=false` con comentarios que expliquen: (1) controla el modo Report-Only vs enforcement de la CSP; (2) `false` es el default seguro para la ventana de telemetría de 7 días; (3) SHALL ponerse en `true` únicamente tras 7 días consecutivos de telemetría con cero violaciones registradas vía `/api/csp-report`; y (4) volver a `false` revierte a Report-Only de inmediato, sin cambio de código ni redeploy.

#### Scenario: `.env.example` contiene CSP_ENFORCEMENT con su documentación
- **WHEN** se lee `k0mp4ss_fe/apps/web/.env.example`
- **THEN** contiene `CSP_ENFORCEMENT=false` con comentarios que explican que controla el modo Report-Only/enforcement, que `false` es el default seguro de la ventana de telemetría de 7 días y que volver a `false` revierte de inmediato sin cambio de código.