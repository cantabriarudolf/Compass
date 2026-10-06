# AGENTS.md — Compass

Plataforma web de gestión para comunidades edificadas (Next 16 + TypeScript). Este es un
proyecto MADURO en un monorepo (el detector de greenfield dio falso positivo en
monorepos — no usarlo como base fundacional).

## Dónde está la verdad del proyecto

- **Estado vivo / frontera**: `openspec/BACKLOG-100.md` — léelo PRIMERO en cualquier ventana nueva
- **Especificaciones por capacidad**: `openspec/specs/` (31 módulos; `project.md` y `agents.md` son transversales, no módulos). **La instrucción de agentes vive SOLO en este `AGENTS.md`**: `openspec/specs/agents.md` y `HERMES.md` son puentes que apuntan acá para no duplicar reglas
- **Changes activos/archivados**: `openspec/changes/` (workflow openspec: propose → apply → archive)
- **Ventana nueva**: leer `openspec/BACKLOG-100.md` + `git status -sb` + `git log --oneline -5` y presentar dónde estamos
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
- **Deltas de spec**: formato canónico y las 3 trampas que rompen el archive → `openspec/CONVENCION-DELTAS.md`. Antes de archivar correr `node openspec/scripts/check-delta-coverage.mjs` (el `validate`, incluso `--strict`, NO detecta esos errores)
- **NSGC pre-push**: antes de pushear, skill `nsgc-prepush` (manuales de módulo + avance + mocks si toca)
- **STORE_VERSION**: cambios al store llevan bump + migración idempotente + tests
- **Commits**: automáticos al cerrar cada trabajo, sin pedir confirmación; estilo convencional en español (ver `git log`). Commitear solo los archivos del cambio; la suciedad ajena del worktree queda fuera
- **Delegación pesada**: implementaciones grandes → subagente (no inline) para preservar la ventana; orquestador verifica contra el change

## Estilo y convenciones de código

- **React**: componentes funcionales y hooks. **TypeScript**: tipado fuerte.
- **Componentes**: chicos y reutilizables; si son globales van en `packages/ui`.
- **Nombres**: carpetas y rutas en español, sin acentos ni espacios, `kebab-case`; variables y código en inglés técnico.
- **Estética**: diseño moderno (colores vivos, dark mode, transiciones suaves).
- **Sin placeholders**: datos realistas o generados, nunca "lorem ipsum".

## Datos que NUNCA deben salir a modelos free

- `apps/web/.env*` (secrets, DATABASE_URL, AUTH_SECRET)
- `apps/web/prisma/dev.db` y backups (`Data/NSGC/backups/`)
- La línea base financiera real del owner (xlsx fuente, montos 2023-2024, datos de personas reales)
- Credenciales de GitHub/Google Cloud (checklist C3 en BACKLOG-100), tokens, cualquier secret
