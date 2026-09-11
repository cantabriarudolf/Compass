# Serie Producción Fase 2 — Plan y Estado Canónico

> Toda ventana DEBE leer este archivo al iniciar (bloque ARRANQUE), marcar su fila EN CURSO
> y actualizarla antes del push final. La Bitácora es el registro durable de la serie.
> Objetivo: llevar Compass de "infraestructura mínima" a "producto seguro y compliant".

| Ventana | Alcance | Estado | Commit final |
|---|---|---|---|
| P1 | Infraestructura Neon PostgreSQL: lib/prisma.ts, .env.example, backup migraciones | HECHA (parcial) | 7fe4b9c |
| P2 | Password policy + JWT 24h + invalidación de sesiones | HECHA | e45bcb2 |
| P3 | 2FA/TOTP con Google Authenticator | HECHA | 6a9d205 |
| P4 | Cifrado de datos sensibles en reposo (AES-256) | HECHA | 5efa23b |
| P5 | Sentry + CSP enforcement | HECHA | 7a5bf36 |
| P6 | Política de privacidad + derechos ARCO + cierre | pendiente | — |

**MÁXIMO: 6 ventanas.**

**Post-serie:**
- Pen-test dinámico
- Auditoría de seguridad externa (recomendado)
- Registro como encargado de datos (Ley 21.719)

**Base de hechos:**
- STORE_VERSION: 27
- Tests: 551/552 unit (vitest), 86 e2e (playwright), 11 lint warnings
- CI/CD: GitHub Actions con unit + e2e + deploy a Vercel
- Hosting: Vercel (vercel.json, output standalone)
- Database: SQLite dev (dev.db) → **Neon PostgreSQL en prod** (esta serie)
- Auth: Auth.js credentials + bcrypt + rate limit persistente
- Stack: Next.js 16.1.6 + React 19 + Prisma 6 + Tailwind v4 + shadcn/ui
- Logging: pino estructurado
- Health check: /api/health
- Pre-commit: husky + lint-staged

## Pre-requisitos del owner (antes de P1)
- [x] Crear cuenta en https://neon.tech
- [x] Crear proyecto y base de datos
- [x] Copiar DATABASE_URL (connection string) y guardarla segura
- [ ] Configurar DATABASE_URL en Vercel dashboard (cuando exista el proyecto)

## Nota importante sobre P1

**P1 quedó PARCIAL intencionalmente.** La estrategia final es:
- **Dev/Test**: SQLite (file:./dev.db) — mantiene velocidad y compatibilidad
- **Producción**: Neon PostgreSQL — configura DATABASE_URL en Vercel dashboard

**Lo que se hizo en P1:**
- ✅ `lib/prisma.ts` usa `datasourceUrl: process.env.DATABASE_URL` (funciona con cualquier provider)
- ✅ `@prisma/extension-accelerate` instalado (para connection pooling en prod)
- ✅ `.env.example` actualizado con ejemplo PostgreSQL/Neon
- ✅ Migraciones SQLite respaldadas en `prisma/migrations-sqlite-backup/`
- ✅ Helper `test/lib/create-sqlite-test-schema.ts` para tests con schema temporal

**Lo que queda PENDIENTE (post-serie o P7):**
- [ ] Script de migración de datos SQLite → PostgreSQL
- [ ] Scripts backup/restore reescritos para PostgreSQL
- [ ] CI actualizado para usar PostgreSQL en job de deploy
- [ ] Cambio de provider en `prisma/schema.prisma` al momento del deploy a producción

## Bitácora
- [2026-09-09] P1 HECHA (parcial): Infraestructura Neon PostgreSQL preparada. lib/prisma.ts con datasourceUrl, .env.example actualizado, migraciones respaldadas, Accelerate instalado. SQLite se mantiene para dev/tests. Commit 7fe4b9c.
- [2026-09-09] P2 HECHA: Password policy + JWT 24h + invalidación de sesiones (tokenVersion). Commit e45bcb2.
- [2026-09-10] P3 HECHA: 2FA/TOTP con Google Authenticator + backup codes. 6 rutas API, challenge JWE 5min, sesión Auth.js real al verificar. UI login 2FA diferida (solo API). Commit 6a9d205.
- [2026-09-10] P4 HECHA: Cifrado AES-256-GCM en reposo. lib/crypto + extensión Prisma opt-in, rutas 2FA re-cableadas (secretos cifrados), script migración idempotente. Rollout global y blind index pendientes. Commit 5efa23b.
- [2026-09-10] P5 HECHA: Sentry code-complete (pendiente DSN owner) + CSP en enforcement con report-uri. Fix time-bomb fechas test reservas. Commit 7a5bf36.
