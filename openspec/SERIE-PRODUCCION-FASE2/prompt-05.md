> **Este archivo ES tu prompt.** Ventana P5 de la serie produccion-fase2.
> Léelo completo (incluido `00-plan.md` de la serie) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie produccion-fase2)

Estado previo: Compass, Next.js 16, PostgreSQL en Neon. Tests: 552+ unit. CI/CD completo. Cifrado de datos sensibles implementado.

Método: openspec-propose → apply → archive → commit → nsgc-prepush.
Reglas: secretos jamás en localStorage; cambio de esquema store = bump STORE_VERSION + migrate + test.
Verificación: tsc 0 errores, lint 0 errores, npm test verde, openspec validate OK.

## Arranque: verificación de la ventana anterior (P4)

1. git status (tree limpio) y git status -sb y git log --oneline -12.
2. openspec validate --all → sin fallos.
3. cd k0mp4ss_fe/apps/web && npm test → suite completa verde.
4. Contrasta con openspec/SERIE-PRODUCCION-FASE2/00-plan.md:
   - Filas P1-P4 HECHAS y todo OK → marca tu fila P5 EN CURSO y continúa.
   - HECHA pero algo falla → ARREGLA primero.
   - PARCIAL → completa ESE alcance antes del tuyo.
5. Nunca marques tu fila EN CURSO si lo anterior no está cerrado.

## Alcance de esta ventana (P5 — Sentry + CSP enforcement)

### Tarea 1: Integrar Sentry

1. El owner debe crear cuenta en https://sentry.io y obtener DSN. Si no tiene DSN, esta tarea se saltea y se documenta como pendiente.
2. Instalar `@sentry/nextjs`:
   ```bash
   npm install @sentry/nextjs
   ```
3. Configurar Sentry:
   - Crear `sentry.client.config.ts`: init con DSN, sample rate 100% en dev, 10% en prod
   - Crear `sentry.server.config.ts`: init con DSN
   - Crear `sentry.edge.config.ts`: init con DSN
   - Actualizar `next.config.mjs` con `withSentryConfig` (envolver el export)
4. En `instrumentation.ts` (creado en SERIE-PRODUCCION P3): añadir captura de excepciones no manejadas vía Sentry
5. En `lib/logger.ts`: cuando level es "error" o "fatal", enviar a Sentry (`Sentry.captureMessage` o `captureException`)
6. Redactar PII antes de enviar a Sentry: nunca enviar emails, RUT, nombres completos

### Tarea 2: CSP enforcement

1. Actualmente CSP está en modo Report-Only (`proxy.ts` setea `Content-Security-Policy-Report-Only`).
2. Cambiar a modo enforce:
   - En `proxy.ts`: cambiar `Content-Security-Policy-Report-Only` → `Content-Security-Policy`
   - Mantener la misma política: `script-src 'self' 'nonce' 'strict-dynamic' 'unsafe-inline' 'unsafe-eval' https:`
3. IMPORTANTE: Antes de activar enforcement, verificar que no hay violations en los logs de CSP:
   - Revisar `api/csp-report` logs (pino) de los últimos 7 días
   - Si hay violations frecuentes, arreglar antes de enforce
   - Si no hay violations (o son mínimas/aceptables): proceder con enforcement
4. Añadir `report-uri` que apunte a `/api/csp-report` (ya existe)
5. Documentar en comentarios que CSP está en enforce y cómo revertir a Report-Only si algo se rompe.

### Tarea 3: Source maps para Sentry

1. Configurar upload de source maps en build:
   - En `next.config.mjs` (dentro de `withSentryConfig`): `sourceMapsUploadOptions`
   - O usar `sentry-cli` en CI
2. Documentar que los source maps solo se suben en producción.

### Tarea 4: Validación final

1. `npx tsc --noEmit` → 0 errores
2. `npm test` → suite completa verde
3. `npm run lint` → 0 errores
4. `openspec validate --all` → sin fallos
5. Si Sentry está configurado: verificar que envía eventos de test (puedes hacer un error deliberado en dev y verificar en dashboard de Sentry)

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado: P5 HECHA/PARCIAL + motivo.
2. Commits: hash + subject y push sí/no.
3. Specs creadas/modificadas + changes archivados.
4. Números: STORE_VERSION, tests X/Y, tsc/eslint OK.
5. Desviaciones vs el prompt.
6. Pendientes heredados.
7. Última línea exacta: `BITACORA_ENTRY: P5 — Sentry + CSP enforcement (commit <hash>)`.
