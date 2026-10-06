# 🧭 HERMES — puente

La instrucción de agentes para Compass vive en **`AGENTS.md`** (raíz del repo). Ese es el único
archivo que hay que mantener y el que las herramientas cargan como contexto.

Este archivo existe porque Hermes / OpenCode lo buscan por convención en la raíz. Su contenido
real está en `AGENTS.md`.

Puntos de entrada útiles para trabajo autónomo:

- **Estado vivo del proyecto**: `openspec/BACKLOG-100.md`
- **Formato de specs y deltas**: `openspec/CONVENCION-DELTAS.md`
- **Documentación operativa (manuales NSGC)**: `Data/NSGC/docs/manuales/` (índice en `00-index.md`)
- **Código**: monorepo en `k0mp4ss_fe/` (`apps/web`, `packages/ui`); build y tests con workdir
  `k0mp4ss_fe/apps/web`

> Histórico (2026-10-06): este archivo decía "Next.js 14+" (el proyecto está en Next 16), mandaba a
> documentación raíz en `docs/` (la real vive en `Data/NSGC/docs/`) y listaba rutas de otra máquina.
