# Serie Producción — Plan y Estado Canónico

> Toda ventana DEBE leer este archivo al iniciar (bloque ARRANQUE), marcar su fila EN CURSO
> y actualizarla antes del push final. La Bitácora es el registro durable de la serie.
> Objetivo: llevar Compass de "NO listo para producción" a "infraestructura de producto mínima viable".

| Ventana | Alcance | Estado | Commit final |
|---|---|---|---|
| P1 | Quick wins mecánicos: unificar hoyISO*() + adoptar generarId() + limpiar lint warnings | pendiente | — |
| P2 | Configuración producción: vercel.json, output standalone, env guard mejorado | pendiente | — |
| P3 | Monitoreo básico: health check endpoint, logging estructurado (pino), instrumentación | pendiente | — |
| P4 | Calidad de código: pre-commit hooks, extender coverage, npm audit documentado | pendiente | — |
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
- Tests: 517 unit (vitest), 86 e2e (playwright), 12 lint warnings
- CI: GitHub Actions (unit + e2e) en `.github/workflows/ci.yml`
- CD: NO EXISTE
- Hosting target: Vercel
- Database: SQLite dev → PostgreSQL prod (pendiente)
- Auth: Auth.js credentials + bcrypt + rate limit persistente
- Stack: Next.js 16.1.6 + React 19 + Prisma 6 + Tailwind v4 + shadcn/ui

## Bitácora
(vacía — cada ventana añade antes del push: `- [fecha] P<n> HECHA: resumen (commit hash)`)
