## Why

El módulo MT del NSGC centraliza el registro, seguimiento y planificación financiera de trabajos, mantenciones preventivas y proyectos de infraestructura. Es el tercer cambio de la Sesión 3; su origen de fondos (GC / Fondo de Reserva / Fondo Especial) usa el patrón referencia pendiente a FI hasta la Ventana 6.

## What Changes

- Nueva capability **MT-mantenimiento-proyectos**: registro de trabajos y obras con ubicación EF (infraestructura o unidad), responsable interno/proveedor, garantías con alertas de expiración, gestión financiera (costo, origen de fondos, estado de pago), mantención preventiva con generación automática del próximo ciclo, tablero de próximos vencimientos y proyectos de largo plazo con cálculo de cuota sugerida.
- Colecciones nuevas en ST: `trabajosMT` (folio MT-*, descripción técnica, ubicación vía unidad EF o activo IR, responsable persona MP o proveedor externo, estado planificado|en_curso|finalizado|cancelado, prioridad baja|media|alta|emergencia, costo y origenFondos gasto_comun|fondo_reserva|fondo_especial con cargoFIReferencia pendiente, estadoPago pendiente|parcial|pagado, garantía inicio/fin, evidencias D1 fotos antes/después + presupuestos + facturas, config preventiva periodicidad) y `proyectosMT` (nombre, presupuesto estimado, plazoMeses, fechaObjetivo, cuotaSugerida derivable).
- Acciones repository: `saveTrabajoMT`, `removeTrabajoMT`, `iniciarTrabajoMT`, `finalizarTrabajoMT` (genera próximo preventivo automáticamente), `cancelarTrabajoMT`, `actualizarPagoTrabajoMT`, `verificarGarantiasMT` (alertas de expiración), `saveProyectoMT`, `removeProyectoMT`; todas retornan `StoreResult`.
- Preventivo: al finalizar un trabajo preventivo con periodicidad definida, el sistema crea automáticamente el siguiente registro planificado (fecha = término + intervalo) y audita `MT_PREVENTIVE_GENERATED`.
- Eventos AM: `MT_WORK_CREATED`, `MT_WORK_FINISHED`, `MT_GUARANTEE_EXPIRED`, `MT_PREVENTIVE_GENERATED`. Data cuantificable: costo por periodo, mantenciones ejecutadas vs programadas.
- Bump `STORE_VERSION` 17 → 18 con migrate aditivo.
- UI `/inventario/proyectos` (ruta ya enlazada en sidebar como "Mantenimiento"): pestañas Trabajos / Prevención / Proyectos.

## Capabilities

### New Capabilities
- `MT-mantenimiento-proyectos`: Registro de trabajos con garantías y pagos, prevención con ciclos automáticos y proyectos con proyección financiera.

### Modified Capabilities
(ninguna)

## Impact

- Código: `k0mp4ss_fe/apps/web/lib/store.ts` (+2 colecciones, +9 acciones, migrate v18), `k0mp4ss_fe/apps/web/lib/schemas.ts` (+3 esquemas), `k0mp4ss_fe/apps/web/app/inventario/proyectos/page.tsx` (nueva), `k0mp4ss_fe/apps/web/app/admin/qa-lab/page.tsx` (fase nueva).
- Specs: nueva carpeta `openspec/specs/MT-mantenimiento-proyectos/`.
- Depende de: EF (unidades/microsectores como ubicación), MP (responsables internos), IR (`activosIR` para vincular intervención a equipo crítico), PI (`notify()`). Origen de fondos FI es referencia pendiente documentada.
