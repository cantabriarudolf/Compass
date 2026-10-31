# Proposal: am-logs-bd — /admin/logs lee la BD vía GET /api/auditoria

## Why

`/admin/logs` hoy lee `store.eventos` (localStorage, ventana máx 500). La retención real de 5 años exige capa de datos; P2 ya provee la BD (`EventoAuditoria`), `POST /api/auditoria/sync` con debounce 2s y `GET /api/auditoria` paginado con filtros server-side. Falta migrar la vista a la BD manteniendo la UX exacta (búsqueda debounced, filtros categoria/tipoAccion, orden desc, export CSV, paginación, badge solo lectura) y adaptar el e2e a fuente BD.

## What Changes

- **Vista `app/admin/logs/page.tsx`**: reemplaza fuente `useCompassStore(s=>s.eventos)` por fetch a `GET /api/auditoria?categoria=&tipoAccion=&q=&page=&pageSize=50` con estado de carga. Mantiene: búsqueda con debounce 200 ms (param `q`), selects categoria/tipoAccion, orden desc (API ya ordena), export CSV del set cargado (BOM + encabezado `timestamp,usuario,categoria,tipoAccion,referenciaId,descripcion`), badge "solo lectura · pista inmutable", cero mutaciones, skeleton y empty state "Sin eventos para la búsqueda o filtros actuales.", paginación server-side (anterior/siguiente + contador "X de Y eventos en BD" donde Y=total del response).
- **Alimentación de selects**: valores presentes en la página actual de resultados (derivados de `eventos` del response) — documentado en design.md; alternativa GET sin filtros inicial si se agota la página, fallback vacío.
- **e2e `e2e/crud/logs.spec.ts`**: tras generar 2 eventos reales (flip switch `/admin/gestion`), poll UI hasta ver filas `AD_OWNER_CONFIG_CHANGE` ≥2 con descripciones de las 2 transiciones (expect.poll/waitFor timeout generoso) en vez de afirmar "2 de 2 eventos" exacto; filtros/búsqueda/export igual pero con contador laxo ("X de Y eventos en BD") y export ≥2 filas AD_OWNER_CONFIG_CHANGE.
- Delta sobre capability `AM-auditoria-metricas`: requirement "Logs de Auditoría" pasa a MODIFIED — escenarios Log Viewer/Log Export ahora sobre capa persistente con paginación server-side; Log Immutability y Retention sin cambios.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `AM-auditoria-metricas`: MODIFIED requirement "Logs de Auditoría" — Viewer y Export sobre `GET /api/auditoria` (BD, retención 5 años) con paginación server-side, búsqueda `q` y filtros `categoria`/`tipoAccion` mapeados a query params; Immutability y Retention sin cambios.

## Impact

- `k0mp4ss_fe/apps/web/app/admin/logs/page.tsx` — reescritura de fuente de datos a fetch BD.
- `k0mp4ss_fe/apps/web/e2e/crud/logs.spec.ts` — adaptación a BD y a posible ruido de otras corridas.
- Sin cambios en `lib/store.ts`, `lib/auditoria-sync.ts`, ni APIs (ya existentes).
- Sin migración Prisma.
