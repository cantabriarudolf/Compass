> **Este archivo ES tu prompt.** Ventana P6 (CIERRE) de la serie produccion.
> Léelo completo (incluido `00-plan.md` de la serie) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie produccion)

Estado previo: Compass es un proyecto Next.js 16 para gestión de comunidades edificadas. STORE_VERSION=27. Tests: 517 unit (vitest) + 86 e2e (playwright). Lint: 0 warnings. CI: GitHub Actions con unit+e2e+deploy. Hosting target: Vercel. Database: SQLite dev.

Método del proyecto: por cada cambio → openspec-propose → implementar con openspec-apply-change → validar → commitear (conventional español) → sincronizar specs mains y archivar con openspec-archive-change → skill nsgc-prepush antes de cualquier push.

Reglas permanentes: dato de dominio solo vía acciones del store (repository + StoreResult); mocks de data/ son solo seed; D1 media por referencia (sin base64/Blob); secretos jamás en localStorage ni código; cada cambio de esquema del store = bump STORE_VERSION + migrate + test.

Verificación por ventana: cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint (0 errores) && npm test (suite completa verde) + openspec validate --all sin fallos.
`next build` puede fallar por red (Google Fonts): ignóralo salvo ventana de deploy.
No commitear Untitled.md. Si tu contexto se agota: cierra la tarea en curso + commit + deja el estado exacto en openspec/SERIE-PRODUCCION/00-plan.md.

## Arranque: verificación de la ventana anterior (P5)

1. git status (tree limpio) y git status -sb y git log --oneline -15.
2. openspec validate --all → sin fallos.
3. cd k0mp4ss_fe/apps/web && npm test → suite completa verde.
4. Contrasta con openspec/SERIE-PRODUCCION/00-plan.md:
   - Filas P1-P5 HECHAS y todo OK → marca tu fila P6 EN CURSO y continúa.
   - HECHA pero algo falla → ARREGLA primero, anótalo en la Bitácora, y solo después empieza tu alcance.
   - PARCIAL → completa ESE alcance antes del tuyo.
5. Nunca marques tu fila EN CURSO si lo anterior no está cerrado.

## Alcance de esta ventana (P6 — Documentación operativa + Cierre QA)

### Tarea 1: README de deploy

1. Crea `k0mp4ss_fe/apps/web/README-DEPLOY.md` con:
   - **Requisitos previos**: Node 20+, cuenta Vercel, PostgreSQL (cuando se migre), dominio (opcional)
   - **Variables de entorno obligatorias**: lista con descripción de cada una
   - **Deploy manual**: pasos con `vercel --prod`
   - **Deploy automático**: explica que push a `main` dispara CI/CD
   - **Rollback**: cómo revertir un deploy en Vercel (dashboard o CLI)
   - **Health check**: URL `/api/health` para verificar estado post-deploy
   - **Primer arranque**: `npm run seed:authz` para crear admin inicial (SOLO en dev/staging)

### Tarea 2: Runbook básico

1. Crea `docs/runbook-operaciones.md` (en `k0mp4ss_fe/apps/web/docs/` o `Data/NSGC/docs/runbooks/`):
   - **Escenario: BD no responde** → pasos de diagnóstico (check health, logs, connection string)
   - **Escenario: 500 en producción** → dónde ver logs (pino JSON → Vercel logs)
   - **Escenario: rate limit activado** → cómo limpiar `RateLimitAttempt` en BD
   - **Escenario: necesito backup urgente** → `npm run backup:db` (solo SQLite dev; documentar que prod usa backups del proveedor PostgreSQL)
   - **Escenario: deploy falló** → check GitHub Actions logs, Vercel dashboard

### Tarea 3: Guía de troubleshooting para developers

1. Crea `docs/TROUBLESHOOTING.md`:
   - `npm run build` falla por Google Fonts → workaround (modo offline o skip)
   - Tests e2e fallan por timeout → aumentar `testTimeout` en playwright.config
   - `prisma generate` no corre → verificar `DATABASE_URL`
   - Hooks de pre-commit lentos → cómo saltar (`--no-verify` para emergencias)
   - Error "Unauthorized" en APIs → checklist de auth (token, sesión, roles)

### Tarea 4: QA integral de cierre

1. Verificación completa del repo post-serie:
   - `git status` limpio
   - `git log --oneline -20` (todos los commits de P1-P6 deben estar presentes)
   - `openspec validate --all` sin fallos
   - `cd k0mp4ss_fe/apps/web && npx tsc --noEmit` → 0 errores
   - `npm run lint` → 0 warnings
   - `npm test` → 517/517 unit verdes
   - `npm run test:e2e` → 86/88 e2e (los 2 skipped son conocidos)
2. Actualiza `openspec/SERIE-PRODUCCION/00-plan.md`:
   - Marca TODAS las filas P1-P6 como HECHAS
   - Añade entrada en Bitácora por cada ventana con fecha, commit hash y resumen
3. Actualiza `openspec/BACKLOG-100.md`:
   - Añade sección "Mejoras de infraestructura de producción (SERIE-PRODUCCION P1-P6)" con estado HECHO
   - Lista lo que queda pendiente post-serie (PostgreSQL, 2FA, cifrado, Sentry, CSP enforcement)

### Tarea 5: Commit final y cierre

1. Commitea los docs con mensaje convencional: `docs(ops): README deploy, runbook, troubleshooting (cierre SERIE-PRODUCCION)`
2. Push con nsgc-prepush.
3. Guarda memoria en engram: `mem_save` con tipo "decision", título "SERIE-PRODUCCION completada — infraestructura de producto mínima viable".

## Reporte final estandarizado (OBLIGATORIO — este es el cierre de la serie)

1. Ventana y estado: P6 HECHA/PARCIAL + motivo.
2. Commits: hash + subject y push sí/no.
3. Specs creadas/modificadas + changes archivados.
4. Números: STORE_VERSION, tests X/Y, tsc/eslint OK, lint 0, commits totales de la serie.
5. Desviaciones vs el prompt.
6. **Pendientes post-serie (requieren decisión del owner):**
   - Migración SQLite → PostgreSQL (elige proveedor)
   - Cifrado de datos sensibles en reposo
   - 2FA/MFA
   - Sentry (crea cuenta)
   - Política de privacidad y consentimiento
   - CSP enforcement (tras 7 días telemetría)
7. Última línea exacta: `BITACORA_ENTRY: P6 — Cierre serie: docs ops, QA integral, BACKLOG-100 actualizado (commit <hash>)`.
