# RE-reporteria-dashboards Tasks

## 1. Store (ST) y utilidades

- [x] 1.1 Helpers puros `lib/reporteria-utils.ts`: `metricasDemograficasRE` (ocupación propietarios/arrendatarios, unidades con condiciones especiales), `metricasOperativasRE` (turnos cerrados hoy vs jornadas maestro, visitas pre-agendadas confirmadas), `embudoGestionesGE` (total histórico, tasa resolución, nuevas/pendientes, en revisión, en proceso, solucionadas, dadas en conocimiento), `saludCajaFI` (recaudación por fondo, diferencia caja ingresos netos vs egresos, termómetro gastos fijos recurrentes), `resolverSegmentacionRE` (EF edificio/piso/unidad × perfiles MP/RP × tenencia VU → personaIds únicos)
- [x] 1.2 Schema `ReporteRESchema`: titulo, bloques[] (`gastos_mes|bitacora_seguridad|morosidad|consumo_insumos`), segmento snapshot (macroSectorIds/microSectorIds/unidadIds/perfiles/tenencia), destinatariosPersonaId[] resueltos, payloadSnapshot de bloques, fechaGeneracion, distribuidoA count
- [x] 1.3 Acciones repository con `StoreResult`: `registrarVistaDashboardRE` (evento por vista), `generarReporteRE` (FKs del segmento válidas; snapshot inmutable), `distribuirReporteRE` (resuelve segmentación al momento de distribuir; notify masivo con gate AD; idempotente), `removeReporteRE` (solo TEST)
- [x] 1.4 Colección `reportesRE` (rank 99); bump `STORE_VERSION` 24→25 migrate aditivo
- [x] 1.5 Eventos AM: `RE_DASHBOARD_VIEW`, `RE_REPORT_GENERATED`, `RE_REPORT_DISTRIBUTED` con data cuantificable
- [x] 1.6 Tasa huérfanos ST visible en el Centro de Mando (dangling FK sobre colecciones TEST/core)

## 2. UI

- [x] 2.1 `/admin/reporteria/page.tsx`: Centro de Mando (tarjetas demográficas, pulso operativo, embudo GE, salud de caja con recaudación por fondo/caja, diferencia de caja, termómetro gastos fijos verde/rojo) / Reportes y Segmentación (selector de bloques + segmentación granular con preview de destinatarios, generar/distribuir, historial)

## 3. QA Lab

- [x] 3.1 Seeds TEST: vistas dashboard auditadas, reporte TEST con 2 bloques + segmentación Torre TEST×Residentes×Propietarios → destinatarios resueltos y distribución notificada; limpieza inversa

## 4. Validación

- [x] 4.1 tsc + eslint 0 errores + suite vitest verde completa
- [x] 4.2 openspec validate --all sin errores
