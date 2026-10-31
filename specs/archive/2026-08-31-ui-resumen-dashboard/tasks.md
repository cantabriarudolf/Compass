## 1. Vista Resumen (read-only) en /dashboard

- [ ] 1.1 Crear `k0mp4ss_fe/apps/web/app/dashboard/page.tsx` (client, patrón `/admin/metricas`): skeleton si `!hasHydrated`; `useCompassStore` para 7 KPIs reales verificados en `lib/store.ts` (ej. unidades totales, unidades ocupadas en-uso, personas totales, residentes con vínculo vigente propietario/arrendatario, tipos de unidad, macro+micro sectores, estados ocupación/fondos FI); grid de `Card` por KPI con valor numérico no vacío, label, badge/estética y `Link` al módulo fuente; grid de accesos rápidos a ≥4 módulos principales (Estructura, Residentes, Bitácora, Finanzas/Métricas etc.) con `Link`.
- [ ] 1.2 Verificar heading "Resumen" + ≥4 KPI cards con números no vacíos del seed y links rápidos; estilos `Card`/`Badge` del patrón app.

## 2. Sidebar — habilitar navegación

- [ ] 2.1 Quitar `"/dashboard"` de `RUTAS_PENDIENTES` en `k0mp4ss_fe/apps/web/components/app-sidebar.tsx` y verificar que el item "Resumen" navega sin badge "Próximamente".

## 3. e2e read-oriented

- [ ] 3.1 Crear `k0mp4ss_fe/apps/web/e2e/crud/dashboard.spec.ts`: `page.goto("/dashboard")`, afirmar heading "Resumen", ≥4 KPI cards con números no vacíos (regex \d), links rápidos presentes (≥4 links a módulos), `expect(errores).toEqual([])` con `page.on("pageerror")`; patrón residentes/logs con timeout 30s; ruta `/dashboard` distinta de `/`.

## 4. Validación y archivo

- [ ] 4.1 `npx tsc --noEmit` 0 errores · `npm run lint` 0 errores · `npx vitest run` 425/425 · `npx playwright test e2e/crud/dashboard.spec.ts` verde · `openspec validate --all` sin errores · commit · nsgc-prepush · push · `openspec archive ui-resumen-dashboard --yes` (verificar `git status` limpio tras archive) · Bitácora 00-plan.md P3 HECHA.
