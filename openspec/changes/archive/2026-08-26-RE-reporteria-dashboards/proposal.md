# RE-reporteria-dashboards

## Why

El módulo RE del NSGC consolida la información de todos los subsistemas (Finanzas, Operaciones, Estructura) para presentarla de forma digerible: dashboards por perfil, generador de reportes por bloques y segmentación granular de distribución. Es la tercera pieza de la ventana 8 (Sesión 7) y el último módulo pendiente de la serie NSGC junto a CT; cierra el ciclo del sumidero AM (tasa huérfanos ya especificada en ST).

## What Changes

- Nueva capability **RE-reporteria-dashboards**: Centro de Mando de administración/comité con métricas demográficas (ratio ocupación propietarios vs arrendatarios, unidades con condiciones especiales), operativas (eficiencia de turnos desde cierres PE, visitas pre-agendadas confirmadas), centro de gestiones (embudo cuantitativo GE: total, tasa resolución, nuevas/pendientes, en revisión, en proceso, solucionadas, dadas en conocimiento) y financieras (recaudación por fondo vs meta, diferencia de caja, termómetro de gastos fijos recurrentes).
- **Generador de reportes personalizados**: bloques extraíbles (resumen gastos del mes, historial novedades bitácora, estado morosidad general, consumo de insumos IR) + **segmentación granular EF+MP+tenencia** (edificio/piso/unidad × administrador/personal/directiva/residente × propietarios/arrendatarios) que resuelve destinatarios exactos.
- Distribución materializada como bandeja in-app simulada (`notify()` D3, respeta gate AD); `RE_DASHBOARD_VIEW` auditado por vista; tasa huérfanos (ST) visible en el mando.
- Colección nueva en ST (rank 99 `RE/AM`): `reportesRE` con bloques snapshot, segmento declarado y destinatarios resueltos.
- Acciones repository: `registrarVistaDashboardRE`, `generarReporteRE` (snapshot de bloques), `distribuirReporteRE` (resuelve segmentación → notify masivo), `removeReporteRE` (solo TEST). Helpers puros en `lib/reporteria-utils.ts`.
- Eventos AM: `RE_DASHBOARD_VIEW`, `RE_REPORT_GENERATED`, `RE_REPORT_DISTRIBUTED`.
- Bump `STORE_VERSION` 24 → 25 con migrate aditivo (colección vacía).
- UI `/admin/reporteria` bajo Sistema ("Reportería y Dashboards"): pestañas Centro de Mando / Reportes y Segmentación.

## Capabilities

### New Capabilities
- `RE-reporteria-dashboards`: dashboards consolidados por perfil, generador de reportes por bloques y motor de distribución con segmentación granular.

### Modified Capabilities
- `ST-capa-datos-persistente`: colección `reportesRE` rank 99, bump v25 aditivo.
- `AM-auditoria-metricas`: catálogo de eventos RE con data cuantificable.
- `RP-roles-permisos`: matriz RE — administración/comité ve mando completo; residente solo datos de su unidad vía reportes distribuidos.
- `UI-navegacion-lateral`: nueva entrada "Reportería y Dashboards" (`/admin/reporteria`) bajo Sistema.

## Impact

- Código: nuevo `lib/reporteria-utils.ts` (agregaciones puras), `lib/store.ts` (+1 colección, +4 acciones, migrate v25), página `/admin/reporteria`, sidebar, qa-lab fase final.
- Specs: nueva carpeta `openspec/specs/RE-reporteria-dashboards/`; deltas MODIFIED sobre ST/AM/RP/UI-navegacion-lateral.
- Depende de: MP/VU/EF (demografía), PE (turnos), GE (embudo), FI (caja/fondos/morosidad), IR (consumo insumos), CO (plantillas no requeridas), AM/ST (tasa huérfanos), ST (`notify()`).
- Tests afectados: nueva suite `test/store-reporteria.test.ts`; sin cambios en suites previas.
