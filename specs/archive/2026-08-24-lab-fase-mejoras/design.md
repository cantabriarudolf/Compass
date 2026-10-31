## Context

`qa-lab` `k0mp4ss_fe/apps/web/app/admin/qa-lab/page.tsx:1` ya tiene pestañas `Qué se probó` / `Cómo va quedando` y `PHASES` llega hasta `Fase 4` `k0mp4ss_fe/apps/web/lib/dev-dashboard.ts:66`. Las mejoras pedidas (vínculos en nueva ventana, screenshots Playwright + GitHub Actions) son transversales y no deben ensuciar `Fase 0..4` del core de la comunidad.

## Goals / Non-Goals

**Goals:**
- Dejar fase y spec donde ir apilando mejoras del lab sin bloquear `enhance-rg-st-seed-gears` / `qa-lab`.
- Primera mejora especificada: vínculos `target="_blank"` en `Cómo va quedando` (ya acordado).

**Non-Goals:**
- No implementar screenshots/iframe ahora (solo dejarlo especificado como requisito futuro).

## Decisions

- **Fase 5** separada (no `Fase 0b`) para que `dev-dashboard` y `01 - Plan` muestren `LAB-mejoras` como `Pendiente/En Proceso` sin mover `RG/ST`.
- **Capability `LAB-mejoras`** en vez de `DEV-qa-lab` para que quede claro que es backlog de mejoras, no el lab inicial `qa-lab` (11/11).

## Risks / Trade-offs

- Fase vacía si no se llena — mitigado dejando al menos 2 requirements concretos (vínculos + screenshots futuros) y checklist en `tasks.md`.
