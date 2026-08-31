> **Este archivo ES tu prompt.** Ventana 3 de la serie **menu-100**. Lee
> `openspec/SERIE-MENU-100/00-plan.md` (ARRANQUE + base de hechos) y verifica en la Bitácora
> que P1 y P2 estén HECHAS (git); si no, detente y repórtalo.

## Alcance P3 — change `ui-resumen-dashboard`: `/dashboard` (Resumen de Inicio)

**Objetivo:** la landing "Resumen" del grupo Inicio (hoy placeholder). Página de resumen
gerencial para el admin: KPIs clave del store + accesos rápidos.

1. **openspec-propose** `ui-resumen-dashboard`: capability `UI-interfaz-principal` (delta
   ADDED requirement "Resumen de Inicio": al navegar `/dashboard` el admin ve un resumen con
   indicadores clave y navegación rápida; read-only).
2. **Implementar:** `app/dashboard/page.tsx` (client, patrón `/admin/metricas`). KPIs desde
   `useCompassStore` (elige 6-8 reales y útiles; ej. ocupación desde
   `maestros.estadosOcupacion`+unidades, morosidad FI, eventos recientes `eventos`,
   encomiendas pendientes `encomiendasPE` sin retiro, visitas del día) + grid de accesos
   rápidos a los módulos principales. Card por KPI con link al módulo fuente. Badge/estética
   consistente con el resto. Quitar `/dashboard` de `RUTAS_PENDIENTES`.
3. **e2e** `e2e/crud/dashboard.spec.ts` (read-oriented): goto `/dashboard`, afirmar heading +
   KPIs renderizados con datos del seed (al menos 4 cards con números no vacíos) + links
   rápidos presentes + 0 pageerror. Ojo: `/` (home) ya existe — esta ruta es distinta.

## Verificación

`npx tsc --noEmit` (0) · `npm run lint` (0 errores) · `npx vitest run` (425/425 REAL) ·
`npx playwright test e2e/crud/dashboard.spec.ts` verde · `openspec validate --all` ·
commit · nsgc-prepush · push · archive · Bitácora P3 HECHA con hash.
