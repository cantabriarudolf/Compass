# AGENTS.md — Compass

Plataforma web de gestión para comunidades edificadas (Next 16 + TypeScript). Este es un
proyecto MADURO en un monorepo: el arnés opencode se adoptó como equipo de agentes
multi-modelo (no es base fundacional — el detector de greenfield dio falso positivo en
monorepos, lección registrada en el linaje).

## Dónde está la verdad del proyecto

- **Estado vivo / frontera**: `openspec/BACKLOG-100.md` — léelo PRIMERO en cualquier ventana nueva
- **Especificaciones por capacidad**: `openspec/specs/` (31 módulos; `project.md` y `agents.md` son contexto maestro)
- **Changes activos/archivados**: `openspec/changes/` (workflow openspec: propose → apply → archive)
- **Concierge de ventanas nuevas**: comando `/inicio` — lee el repo y presenta dónde estamos
- **Documentación NSGC**: `Data/NSGC/docs/` (manuales por módulo, avances de desarrollo, trazabilidad)

## Stack y rutas de código

- Todo el código vive en `k0mp4ss_fe/` (monorepo): app en `apps/web`, UI compartida en `packages/ui`
- Next.js 16 (App Router, Turbopack) · TypeScript estricto · Prisma + SQLite en dev (`DATABASE_URL` en `apps/web/.env`)
- Auth.js credentials + rate limit persistente · Tailwind v4 + shadcn/ui vía `@workspace/ui/components`
- Estado del cliente: zustand persist (`lib/store.ts`, STORE_VERSION + migraciones idempotentes)
- Tests: Vitest (unit/integración, `test/`) + Playwright (e2e, `e2e/` — lanes crud/flujo/smoke/auth)
- Cualquier comando de build/test: `workdir k0mp4ss_fe/apps/web`

## Convenciones críticas

- **Terminología RG §4**: el término oficial es **"comunidad"**; "condominio" está en desuso y no debe introducirse en ningún archivo
- **Workflow openspec**: toda feature/fix → change openspec con proposal/specs/design/tasks; archivar tras CI verde
- **NSGC pre-push**: antes de pushear, skill `nsgc-prepush` (manuales de módulo + avance + mocks si toca)
- **STORE_VERSION**: cambios al store llevan bump + migración idempotente + tests
- **Commits**: automáticos al cerrar cada trabajo, sin pedir confirmación; estilo convencional en español (ver `git log`). Commitear solo los archivos del cambio; la suciedad ajena del worktree queda fuera
- **Delegación pesada**: implementaciones grandes → subagente (no inline) para preservar la ventana; orquestador verifica contra el change

## Datos que NUNCA deben salir a modelos free

- `apps/web/.env*` (secrets, DATABASE_URL, AUTH_SECRET)
- `apps/web/prisma/dev.db` y backups (`Data/NSGC/backups/`)
- La línea base financiera real del owner (xlsx fuente, montos 2023-2024, datos de personas reales)
- Credenciales de GitHub/Google Cloud (checklist C3 en BACKLOG-100), tokens, cualquier secret

<!-- arnes-opencode:inicio -->
## Arnés opencode (equipo de agentes multi-modelo)

- Arranque recomendado: `bash arnes-opencode/start.sh hibrido` (preflight + perfil activo)
- Roles disponibles: @arquitecto @codificador @lector @revisor-fin @revisor-codigo @documentador
- Si un subagente falla con errores de modelo: NO reintentar a ciegas; correr el doctor (`/doctor`)
- Contexto de ESTE proyecto:
  - Stack y rutas de código: ver sección "Stack y rutas de código" arriba (`k0mp4ss_fe/apps/web`)
  - Convenciones críticas: ver sección homónima arriba (openspec + RG §4 + nsgc-prepush)
  - Rutas de documentación: `openspec/specs/` · `openspec/BACKLOG-100.md` · `Data/NSGC/docs/`
  - Datos que NUNCA deben salir a modelos free: ver sección homónima arriba
<!-- arnes-opencode:fin -->
