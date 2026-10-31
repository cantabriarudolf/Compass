## 1. Fase especial

- [x] 1.1 Añadir `LAB: 'Fase 5'` en `k0mp4ss_fe/apps/web/lib/dev-dashboard.ts:66` (`PHASES` y `PHASE_ORDER`).
- [x] 1.2 Añadir fila `LAB - Mejoras Lab` en `Data/NSGC/docs/manuales/01 - Plan de Avance.md` (Fase 5) y `03 - Mapa de Desarrollo y Trazabilidad.md` (Orden 28).

## 2. Spec backlog

- [x] 2.1 Crear `openspec/specs/LAB-mejoras/spec.md` vía delta `LAB-mejoras` con requirements de `Vínculos en nueva ventana` (implementado en `qa-lab` `k0mp4ss_fe/apps/web/app/admin/qa-lab/page.tsx:1`) y `Screenshots automatizados` (Playwright + GitHub Actions a `Data/NSGC/backups/screenshots/` - futuro).
- [x] 2.2 Añadir vínculos `target="_blank"` en `qa-lab` `Cómo va quedando` (`COMO_LLEGAR` → `href` real) como primera entrega de la fase.

## 3. Validación

- [x] 3.1 `openspec validate lab-fase-mejoras --strict` sin errores.
