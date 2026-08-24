## Why

`qa-lab` ya permite poblar y ver `Cómo va quedando`, pero los vínculos a las opciones aún son texto y no hay registro visual automático. Para no mezclarlo con el core de la comunidad, se necesita una **Fase especial de Mejoras del Lab** donde ir dejando las mejoras futuras (vínculos con `target="_blank"`, screenshots automatizados, previews) sin bloquear el flujo `enhance-rg-st-seed-gears` / `qa-lab`.

## What Changes

- Nueva **Fase 5 - Laboratorio y Automatización** en `k0mp4ss_fe/apps/web/lib/dev-dashboard.ts:66` (`PHASES`), `Data/NSGC/docs/manuales/01 - Plan de Avance.md` y `03 - Mapa de Desarrollo y Trazabilidad.md`.
- Nueva capability `LAB-mejoras` (`openspec/specs/LAB-mejoras/spec.md`) que actingá como backlog de esta fase.

## Capabilities

### New Capabilities
- `LAB-mejoras`: Fase especial para mejoras del Laboratorio QA - vinculos, screenshots y automatización

## Impact

- `k0mp4ss_fe/apps/web/lib/dev-dashboard.ts` (PHASES + ROUTES si aplica), `Data/NSGC/docs/manuales/01 - Plan de Avance.md`, `03 - Mapa`, `openspec/specs/LAB-mejoras/spec.md` al archivar. No toca `store` ni `qa-lab` existente.
