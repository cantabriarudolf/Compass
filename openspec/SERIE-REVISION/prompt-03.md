> **Este archivo ES tu prompt.** Ventana 3 de la serie revision.
> Léelo completo (incluido `00-plan.md` de la serie) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie revision)

Project: Compass (Next.js 16 + TypeScript + Prisma + SQLite + Auth.js + Zustand persist).
Método del proyecto: por cada cambio → openspec-propose → implementar con openspec-apply-change
→ validar → commitear (conventional español) → sincronizar specs mains y archivar con
openspec-archive-change → skill nsgc-prepush antes de cualquier push.
Reglas permanentes: dato de dominio solo vía acciones del store (repository + StoreResult);
mocks de data/ son solo seed; D1 media por referencia (sin base64/Blob); secretos jamás en
localStorage ni código; cada cambio de esquema del store = bump STORE_VERSION + migrate + test.
Verificación por ventana: cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint (0 errores)
&& npm test (suite completa verde) + openspec validate --all sin fallos.
`next build` puede fallar por red (Google Fonts): ignóralo salvo ventana de deploy.
No commitear Untitled.md. Si tu contexto se agota: cierra la tarea en curso + commit + deja
el estado exacto en openspec/SERIE-REVISION/00-plan.md.

Estado previo: STORE_VERSION = 27, tests 515/516 pasan (1 roto en RA), e2e 86/88 pasan,
build limpio, tsc limpio, lint 43 warnings (0 errores), último commit 7108e1c.

## Arranque: verificación de la ventana anterior (antes de tu alcance)

1. `git status` (tree limpio) y `git status -sb` (sin "ahead": todo pusheado) y `git log --oneline -8`.
2. `openspec validate --all` → sin fallos.
3. `cd k0mp4ss_fe/apps/web && npm test` → suite completa verde.
4. Contrasta con `openspec/SERIE-REVISION/00-plan.md`:
   - Filas P1 y P2 HECHAS y todo OK → marca tu fila EN CURSO y continúa.
   - HECHA pero algo falla → ARREGLA primero, anótalo en la Bitácora, y solo después empieza.
   - PARCIAL o repo a medias → completa ESE alcance antes del tuyo.
5. Nunca marques tu fila EN CURSO si lo anterior no está cerrado.

## Alcance de esta ventana (P3 — Security Audit Parte II: APIs + Data + Config)

Objetivo: OWASP A03 (Injection), A02 (Crypto), A05 (Misconfiguration), A01-data (Data Exposure).

### Tarea 3.1 — Revisión de endpoints API (`app/api/*/route.ts`)

- Listar todos los handlers `route.ts` bajo `app/api/`
- Verificar que cada handler valide input con Zod antes de procesar
- Buscar SQL injection: ¿hay raw queries? ¿uso seguro de Prisma (`where`, `data` parametrizado)?
- Buscar command injection: ¿hay `exec`, `spawn`, `eval`? (ya se buscó previamente, re-verificar)
- Buscar XSS: ¿algún endpoint refleja input sin sanitizar? ¿hay uso de `dangerouslySetInnerHTML`?
- Verificar que errores no expongan stack traces ni información interna en producción

### Tarea 3.2 — Revisión de manejo de secretos

- Revisar `lib/auth.ts`: `AUTH_SECRET` viene de env
- Revisar `.env.example`: ¿documenta todas las variables necesarias? (`AUTH_SECRET`, `DATABASE_URL`, `SMTP_PASSWORD`, `CLAVE_ELIMINACION_MAESTRO`, `PUBLIC_DOMAIN`)
- Revisar que `*.db` y `.env*` estén en `.gitignore`
- Revisar que no haya secretos hardcodeados en código fuente (grep: `password`, `secret`, `key`, `token` en lib/ app/)
- Revisar `data/admin/configuracion.ts`: ¿ya no tiene `smtpPassword` ni `claveEliminacionMaestro`?

### Tarea 3.3 — Revisión de headers y CSP

- Revisar `next.config.mjs`: headers de seguridad presentes (HSTS, X-Frame-Options, etc.)
- Revisar `proxy.ts` (middleware/edge): CSP report-only con nonce
- Verificar que CSP NO está en enforcement (debe ser report-only)
- Verificar que `frame-src` incluye YouTube para visor de mensajes
- Verificar que no hay dominios hardcodeados sin env
- Revisar `scripts/check-headers.mjs` o similar si existe

### Tarea 3.4 — Data Exposure en localStorage y logs

- Revisar `lib/store.ts`: ¿se persiste PII sensible en localStorage? (el store persiste TODO,
  incluyendo personas con RUT, etc. — esto es expected por diseño offline-first, pero documentar)
- Revisar que eventos de auditoría no logeen passwords ni tokens
- Revisar que `/api/csp-report` no logee datos sensibles
- Revisar que errores de API no incluyan SQL queries o nombres de tablas

### Tarea 3.5 — Hallazgos y fixes

- Documentar hallazgos con severidad y ubicación exacta.
- Aplicar fixes pequeños inline.
- Crear change openspec `revision-seguridad-apis` si hay cambios sustanciales.

## Verificación obligatoria antes de reportar

```bash
cd k0mp4ss_fe/apps/web
npx tsc --noEmit
npm run lint
npm test
```

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado (HECHA/PARCIAL + motivo).
2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes archivados.
4. Números: STORE_VERSION, tests X/Y, tsc/eslint OK, hallazgos por severidad.
5. Desviaciones vs el prompt.
6. Pendientes heredados a la(s) ventana(s) siguiente(s).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`.
