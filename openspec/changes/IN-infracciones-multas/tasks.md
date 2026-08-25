## 1. Store (ST)

- [x] 1.1 Declarar esquemas/tipos `TipoInfraccionIN`, `DanoDirectoIN`, `ComentarioInternoIN`, `ApelacionIN`, `InfraccionIN` en schemas.ts y colecciones `tiposInfraccionIN` (seed NSGC), `infraccionesIN` en `CompassData`; bump `STORE_VERSION` 16→17 con migrate aditivo
- [x] 1.2 Implementar `saveTipoInfraccionIN` y `removeTipoInfraccionIN` (bloqueo por uso)
- [x] 1.3 Implementar `saveInfraccionIN` (folio IN-*, tipo o daño directo excluyentes, FKs unidad/reportante/mensajeBuzon, antecedentes ≥20, evidencias D1, notify administración, `IN_REG_EVENT`)
- [x] 1.4 Implementar `apelarInfraccionIN` (descargos → apelada + `IN_APELACION`), `aplicarInfraccionIN` (monto del catálogo/costo directo; grave/gravísima exige respaldo directiva; cargoFIReferencia "pendiente" + `IN_APPLY_FINE` + notify propietario), `desestimarInfraccionIN` (justificación obligatoria)
- [x] 1.5 Implementar `comentarInfraccionIN` y `respaldarInfraccionIN` (valida miembro directiva activo)
- [x] 1.6 Tests de store IN (catálogo seed y bloqueo de eliminación, registro con folio/FKs/evidencias, cobro directo con respaldo obligatorio, ciclo apelación, respaldo directiva para graves, aplicación con monto y referencia pendiente FI, desestimación)

## 2. UI

- [x] 2.1 Crear `/finanzas/multas/page.tsx`: pestañas Catálogo / Registro / Panel Directiva + skeleton + rehydrated
- [x] 2.2 Catálogo: grilla de tipos con form alta/edición (categoría, sanción monto fijo vs % GC)
- [x] 2.3 Registro: bandeja con filtros estado/unidad/fechas, form de infracción (catálogo vs daño directo con adjuntos D1), conversión desde reclamo CO, detalle modal con trazabilidad
- [x] 2.4 Panel Directiva: contadores estado/categoría, montos comprometidos, comentarios internos y botón de respaldo para multas graves

## 3. Validación

- [x] 3.1 Lint + typecheck + suite verde completa
- [x] 3.2 openspec validate --changes sin errores
