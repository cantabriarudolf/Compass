> **Este archivo ES tu prompt.** Ventana 3 de la serie **frontera**. Lee
> `openspec/SERIE-FRONTERA/00-plan.md` y verifica en la Bitácora que P1 y P2 estén HECHAS
> (git); si no, detente y repórtalo.

## Alcance P3 — change `am-logs-bd`: `/admin/logs` lee la BD

**Objetivo:** la vista `/admin/logs` pasa a consultar `GET /api/auditoria` (BD, retención
real 5 años) manteniendo exactamente la UX actual: búsqueda, filtros categoria/tipoAccion,
orden timestamp desc, paginación y export CSV. La fuente local (`store.eventos`, tope 500)
deja de ser la fuente de la vista (sigue existiendo como ventana del cliente y alimenta la
sync de P2).

1. **openspec-propose** `am-logs-bd`: capability `AM-auditoria-metricas` (delta MODIFIED del
   requirement "Logs de Auditoría" — escenarios Log Viewer/Log Export ahora sobre la capa
   de datos persistente con paginación server-side; Log Immutability y Retention sin cambios).
2. **Implementar** en `app/admin/logs/page.tsx`:
   - Reemplazar la fuente `useCompassStore(s => s.eventos)` por fetch a
     `/api/auditoria?categoria=&tipoAccion=&q=&page=&pageSize=50` con estado de carga.
   - Los selectores de `categoria`/`tipoAccion` ahora se alimentan de los valores presentes
     en la página actual de resultados (o de un GET sin filtros inicial — decisión tuya,
     documenta en design.md). Búsqueda con debounce 200ms igual que hoy (param `q`).
   - Paginación server-side: botones anterior/siguiente con `total` del response (la UI de
     "X de Y eventos" pasa a "X de Y eventos en BD").
   - Export CSV: del set cargado de la página actual (mantener formato BOM + encabezado
     `timestamp,usuario,categoria,tipoAccion,referenciaId,descripcion`).
   - Skeleton de carga y empty state ("Sin eventos para la búsqueda o filtros actuales.").
     Mantener badge "solo lectura · pista inmutable" y cero botones de mutación.
3. **e2e** — adaptar `e2e/crud/logs.spec.ts` a la fuente BD: el test genera 2 eventos reales
   (flip de switch en /admin/gestion), espera el sync (el debounce + POST — poll del GET/
   UI hasta ver "2 de ... eventos" con timeout generoso), luego filtros/búsqueda/export
   igual que hoy (ajusta el contador exacto si la BD ya tiene eventos previos de otras
   corridas: usa filtros que acoten a los 2 eventos generados, p. ej. tipoAccion
   AD_OWNER_CONFIG_CHANGE + búsqueda por texto único del test). Añadir afirmación de
   paginación si `pageSize` lo permite. 0 pageerror.
4. **No romper**: los tests unitarios de la vista no existen (era client-only); la suite
   existente debe seguir verde.

## Verificación

`npx tsc --noEmit` (0) · `npm run lint` (0 errores) · `npx vitest run` (total REAL) ·
`npx playwright test e2e/crud/logs.spec.ts` verde · `openspec validate --all` · commit ·
nsgc-prepush · push · archive (git status limpio) · Bitácora P3 HECHA con hash.
