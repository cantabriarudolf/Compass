# Serie Producción Fase 2 — Plan y Estado Canónico

> Toda ventana DEBE leer este archivo al iniciar (bloque ARRANQUE), marcar su fila EN CURSO
> y actualizarla antes del push final. La Bitácora es el registro durable de la serie.
> Objetivo: llevar Compass de "infraestructura mínima" a "producto seguro y compliant".

| Ventana | Alcance | Estado | Commit final |
|---|---|---|---|
| P1 | Migración SQLite → Neon PostgreSQL: schema, pooling, datos, scripts | pendiente | — |
| P2 | Password policy + JWT 24h + invalidación de sesiones | pendiente | — |
| P3 | 2FA/TOTP con Google Authenticator | pendiente | — |
| P4 | Cifrado de datos sensibles en reposo (AES-256) | pendiente | — |
| P5 | Sentry + CSP enforcement | pendiente | — |
| P6 | Política de privacidad + derechos ARCO + cierre | pendiente | — |

**MÁXIMO: 6 ventanas.**

**Post-serie:**
- Pen-test dinámico
- Auditoría de seguridad externa (recomendado)
- Registro como encargado de datos (Ley 21.719)

**Base de hechos:**
- STORE_VERSION: 27
- Tests: 552 unit (vitest), 86 e2e (playwright), 13 lint warnings
- CI/CD: GitHub Actions con unit + e2e + deploy a Vercel
- Hosting: Vercel (vercel.json, output standalone)
- Database: SQLite dev → **Neon PostgreSQL** (esta serie)
- Auth: Auth.js credentials + bcrypt + rate limit persistente
- Stack: Next.js 16.1.6 + React 19 + Prisma 6 + Tailwind v4 + shadcn/ui
- Logging: pino estructurado
- Health check: /api/health
- Pre-commit: husky + lint-staged

## Pre-requisitos del owner (antes de P1)
- [ ] Crear cuenta en https://neon.tech
- [ ] Crear proyecto y base de datos
- [ ] Copiar DATABASE_URL (connection string) y guardarla segura
- [ ] Configurar DATABASE_URL en Vercel dashboard (cuando exista el proyecto)

## Bitácora
(vacía — cada ventana añade antes del push: `- [fecha] P<n> HECHA: resumen (commit hash)`)
