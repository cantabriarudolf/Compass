# Serie Producción — Plan y Estado Canónico

> Toda ventana DEBE leer este archivo al iniciar (bloque ARRANQUE), marcar su fila EN CURSO
> y actualizarla antes del push final. La Bitácora es el registro durable de la serie.
> Objetivo: llevar Compass de "NO listo para producción" a "infraestructura de producto mínima viable".

| Ventana | Alcance | Estado | Commit final |
|---|---|---|---|
| P1 | Quick wins mecánicos: unificar hoyISO*() + adoptar generarId() + limpiar lint warnings | HECHA | 39f3cdc |
| P2 | Configuración producción: vercel.json, output standalone, env guard mejorado | HECHA | 52c83a7 |
| P3 | Monitoreo básico: health check endpoint, logging estructurado (pino), instrumentación | HECHA | 125d86d |
| P4 | Calidad de código: pre-commit hooks, extender coverage, npm audit documentado | EN CURSO | — |
| P5 | Pipeline CD: GitHub Actions job de deploy a Vercel | pendiente | — |
| P6 | Documentación operativa: README de deploy, runbook básico, guía troubleshooting | pendiente | — |

**MÁXIMO: 6 ventanas.**

**Post-serie (requiere decisión del owner):**
- Migración SQLite → PostgreSQL (elige proveedor: Vercel Postgres, Supabase, Neon)
- Cifrado de datos sensibles en reposo (estrategia: AES-256 por campo vs TDE de BD)
- 2FA/MFA (elige método: TOTP app, SMS, email)
- Sentry (crea cuenta)
- Política de privacidad y consentimiento (contenido legal)
- CSP enforcement (requiere 7 días telemetría + dominio real)

**Base de hechos:**
- STORE_VERSION: 27
- Tests: 552 unit (vitest), 86 e2e (playwright), 13 lint warnings (heredados de proxy.ts/e2e/scripts)
- CI: GitHub Actions (unit + e2e) en `.github/workflows/ci.yml`
- CD: NO EXISTE
- Hosting target: Vercel
- Database: SQLite dev → PostgreSQL prod (pendiente)
- Auth: Auth.js credentials + bcrypt + rate limit persistente
- Stack: Next.js 16.1.6 + React 19 + Prisma 6 + Tailwind v4 + shadcn/ui

## Bitácora
- [2026-09-09] P1 HECHA: Unificación hoyISO*() en lib/date-utils.ts + 27 repeticiones de ID reemplazadas por generarId() + tests nuevos (date-utils, id-utils) + lint limpio (commit 39f3cdc)
- [2026-09-09] P2 HECHA: vercel.json con config mínima + output standalone + env-guard endurecido (isWriteApiEnabled más restrictivo, helpers isProduction/isDevelopment/requireEnv) + tests env-guard + @next/bundle-analyzer (commit 52c83a7)
- [2026-09-09] P3 HECHA: /api/health con check BD + pino logger estructurado + instrumentation.ts + redacción PII en logs de APIs (commit 125d86d)
