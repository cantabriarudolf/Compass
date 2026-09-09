> **Este archivo ES tu prompt.** Ventana P3 de la serie produccion.
> Léelo completo (incluido `00-plan.md` de la serie) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie produccion)

Estado previo: Compass es un proyecto Next.js 16 para gestión de comunidades edificadas. STORE_VERSION=27. Tests: 517 unit (vitest) + 86 e2e (playwright). Lint: 0 warnings. CI: GitHub Actions con unit+e2e. CD: no existe. Hosting target: Vercel. Database: SQLite dev.

Método del proyecto: por cada cambio → openspec-propose → implementar con openspec-apply-change → validar → commitear (conventional español) → sincronizar specs mains y archivar con openspec-archive-change → skill nsgc-prepush antes de cualquier push.

Reglas permanentes: dato de dominio solo vía acciones del store (repository + StoreResult); mocks de data/ son solo seed; D1 media por referencia (sin base64/Blob); secretos jamás en localStorage ni código; cada cambio de esquema del store = bump STORE_VERSION + migrate + test.

Verificación por ventana: cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint (0 errores) && npm test (suite completa verde) + openspec validate --all sin fallos.
`next build` puede fallar por red (Google Fonts): ignóralo salvo ventana de deploy.
No commitear Untitled.md. Si tu contexto se agota: cierra la tarea en curso + commit + deja el estado exacto en openspec/SERIE-PRODUCCION/00-plan.md.

## Arranque: verificación de la ventana anterior (P2)

1. git status (tree limpio) y git status -sb y git log --oneline -8.
2. openspec validate --all → sin fallos.
3. cd k0mp4ss_fe/apps/web && npm test → suite completa verde.
4. Contrasta con openspec/SERIE-PRODUCCION/00-plan.md:
   - Filas P1-P2 HECHAS y todo OK → marca tu fila P3 EN CURSO y continúa.
   - HECHA pero algo falla → ARREGLA primero, anótalo en la Bitácora, y solo después empieza tu alcance.
   - PARCIAL → completa ESE alcance antes del tuyo.
5. Nunca marques tu fila EN CURSO si lo anterior no está cerrado.

## Alcance de esta ventana (P3 — Monitoreo básico)

### Tarea 1: Health check endpoint `/api/health`

1. Crea `app/api/health/route.ts` que retorne JSON:
   ```json
   {
     "status": "ok",
     "timestamp": "2026-09-08T...",
     "version": "1.0.0",
     "checks": {
       "database": "ok",
       "auth": "ok"
     }
   }
   ```
2. El check de database debe hacer una query liviana (ej. `prisma.$queryRaw` SELECT 1).
3. El check de auth debe verificar que `AUTH_SECRET` esté configurado.
4. No debe requerer autenticación (público, read-only).
5. Cache: `export const revalidate = 0` o `dynamic = 'force-dynamic'`.
6. Tests: al menos 2 casos (OK, DB fail simulado).

### Tarea 2: Logging estructurado básico

1. Instala `pino` y `pino-pretty` (dev) como dependencias.
2. Crea `lib/logger.ts` con instancia de pino configurada:
   - En desarrollo: pretty print
   - En producción: JSON estructurado (para ingestion en log aggregator)
   - Niveles: trace, debug, info, warn, error, fatal
   - Campos base: timestamp, level, msg, service: "compass"
3. Reemplaza los `console.warn` existentes en:
   - `app/api/fi/route.ts` (`[authz] ...`)
   - `app/api/admin/usuarios/route.ts`
   - `app/api/backup/route.ts`
   - `app/api/auditoria/route.ts`
   - `app/api/csp-report/route.ts`
   Por `logger.warn()` o `logger.info()` según severidad.
4. IMPORTANTE: redacta PII en logs. No loguees emails, RUT, nombres completos. Si el log actual incluye `${usuario.email}`, cámbialo por `${usuario.id}` o un hash.

### Tarea 3: Instrumentación básica

1. Crea `instrumentation.ts` en la raíz de `apps/web/` (al lado de `next.config.mjs`):
   - `register()` que inicialice el logger
   - `onRequest()` que loguee request method + path + status (sin PII)
2. Configura `next.config.mjs` para soportar `instrumentation` (si Next.js 16 lo requiere).

### Tarea 4: Rate limit en health check

1. El endpoint `/api/health` debe tener rate limit básico (ej. 60 req/min por IP) para evitar DoS accidental.
2. Reutiliza `lib/rate-limit.ts` si es posible, o crea un middleware simple.

### Tarea 5: Validación final

1. `npx tsc --noEmit` → 0 errores
2. `npm test` → suite completa verde
3. `npm run lint` → 0 warnings
4. `openspec validate --all` → sin fallos
5. Verifica que `/api/health` responde correctamente en dev.

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado: P3 HECHA/PARCIAL + motivo.
2. Commits: hash + subject y push sí/no.
3. Specs creadas/modificadas + changes archivados.
4. Números: STORE_VERSION, tests X/Y, tsc/eslint OK.
5. Desviaciones vs el prompt.
6. Pendientes heredados a la(s) ventana(s) siguiente(s).
7. Última línea exacta: `BITACORA_ENTRY: P3 — Monitoreo: health check, pino logger, instrumentación, redacción PII (commit <hash>)`.
