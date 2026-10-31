## Why

El módulo IR del NSGC gestiona activos, insumos, EPP y accesos físicos del condominio, vinculando la Estructura Física (EF) con el Personal (PE). Es el primer cambio de la Sesión 3 y resuelve la referencia pendiente que GE dejó documentada en su tipología de insumos (`materialSolicitado` texto libre → ahora existe catálogo maestro).

## What Changes

- Nueva capability **IR-inventario-recursos**: catálogo unificado de recursos (infraestructura, mobiliario, insumos con stock crítico, EPP y llaves/credenciales), flujo trazable de solicitudes de insumo con comodín de artículo no catalogado, entregas de EPP individuales y control "quién tiene qué" para accesos.
- Colecciones nuevas en ST: `activosIR` (recurso con categoría, ubicación EF vía microSector/unidad, responsable MP, stock y umbral crítico, proveedor/garantía/factura como metadatos D1), `solicitudesInsumoIR` (folio SI-*, tipificación quién/qué/dónde, ciclo pendiente→entregada, comodín pendiente→aprobada_creada|sustituida|rechazada) y `entregasEPP` (registro individual fecha/talla/estado + renovación).
- Acciones repository: `saveRecursoIR`, `removeRecursoIR`, `cambiarEstadoRecursoIR`, `saveSolicitudInsumoIR`, `resolverComodinIR`, `entregarSolicitudInsumoIR`, `registrarEntregaEPP`, `asignarAccesoIR`, `devolverAccesoIR`; todas retornan `StoreResult`.
- Stock crítico: al entregar se descuenta stock; al cruzar el umbral definido se emite evento `IR_STOCK_LOW` + notificación a administración (alarma de reposición en dashboard).
- Eventos AM: `IR_STOCK_LOW`, `IR_DELIVERY_EPP`, `IR_ASSET_REPAIR` (+ `IR_COMODIN_ALERTA` para la alerta crítica del comodín). Data cuantificable: consumo por área, ratio de pérdida/baja, % personal con EPP vigente.
- Ingreso de recursos (compras): campos proveedor/factura/garantía como metadatos D1 (nombre/tipoMime/tamaño/URL); la vinculación contable a egresos FI queda como referencia pendiente (`cargoFIReferencia:"pendiente"` hasta Ventana 6).
- Bump `STORE_VERSION` 15 → 16 con migrate aditivo.
- UI `/inventario/recursos` (ruta ya enlazada en sidebar como "Recursos y EPP"): pestañas Catálogo / Solicitudes / EPP / Accesos.

## Capabilities

### New Capabilities
- `IR-inventario-recursos`: Catálogo de activos e insumos con stock crítico, solicitudes trazables con comodín, EPP individual y control de accesos físicos.

### Modified Capabilities
(ninguna)

## Impact

- Código: `k0mp4ss_fe/apps/web/lib/store.ts` (+3 colecciones, +9 acciones, migrate v16), `k0mp4ss_fe/apps/web/lib/schemas.ts` (+6 esquemas), `k0mp4ss_fe/apps/web/app/inventario/recursos/page.tsx` (nueva), `k0mp4ss_fe/apps/web/app/admin/qa-lab/page.tsx` (fase nueva).
- Specs: nueva carpeta `openspec/specs/IR-inventario-recursos/`.
- Depende de: EF (microSectores/unidades), MP (personas como responsables/solicitantes), MA (unidadesMedida/categoriasInsumos). Vinculación plena con PE (ficha laboral) es referencia pendiente; cargo FI pendiente hasta Ventana 6.
