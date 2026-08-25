## Context

Dependencias resueltas: EF (unidades/microSectores), MP (personas como responsable interno), IR (`activosIR` — el hidropack/ascensor del §6 de la spec NSGC es un activo de infraestructura IR), `notify()` (PI). FI no existe → origenFondos y estadoPago son campos declarativos sin movimiento contable real, con `cargoFIReferencia:"pendiente"` (mismo patrón que IN). El "histórico por zona/equipo crítico" (§6) deriva de filtrar trabajos por unidad/activo.

## Goals / Non-Goals

**Goals:**
- Registro único de intervenciones: correctivas, mantenciones preventivas y obras, con ubicación precisa EF y/o equipo IR.
- Prevención automatizada: periodicidad por equipo crítico y generación automática del siguiente registro al finalizar.
- Financiera declarativa: costo total, origen de fondos y estado de pago; facturas/presupuestos/fotos como metadatos D1.
- Garantías de proveedores con vigencia y alertas previas a expiración para inspección final.
- Proyectos estratégicos con cuota extraordinaria sugerida (presupuesto/plazo).

**Non-Goals:**
- Movimiento contable real en fondos (FI, Ventana 6): origen de fondos queda documental.
- Calendario visual mensual completo: el tablero es una vista ordenada por próximos vencimientos (lista).
- Histórico de cumplimiento del proveedor estructurado: campo texto + garantías asociadas bastan hoy.

## Decisions

- **`trabajosMT {id, folio MT-*, titulo, descripcion tecnica, unidadId? (EF), microSectorId? (EF), activoIRId? (IR), responsablePersonaId? (MP interno) o proveedor {nombre, contacto?}, prioridad baja|media|alta|emergencia, estado planificado|en_curso|finalizado|cancelado, fechaProgramada?, fechaInicio?, fechaTermino?, costoTotal, origenFondos gasto_comun|fondo_reserva|fondo_especial|pendiente_definir, estadoPago pendiente|parcial|pagado, garantiaInicio?/garantiaFin?, alertaGarantiaEnviada flag interno, evidencias[] D1 {tipo foto_antes|foto_despues|presupuesto|factura + metadatos}, preventivo {periodicidadMeses}? , cargoFIReferencia literal "pendiente" opcional}`.** Al menos una ubicación (unidad o micro sector) es obligatoria; activoIRId opcional valida FK.
- **Preventivo**: `finalizarTrabajoMT(id, {fechaTermino, costoFinal})` marca Finalizado (`MT_WORK_FINISHED`) y si trae `preventivo.periodicidadMeses` clona automáticamente un nuevo trabajo Planificado con fechaProgramada = fechaTermino + periodicidad (`MT_PREVENTIVE_GENERATED`). Ciclos NSGC ejemplo: Hidropack mensual, CCTV/cerco semestral, ascensores mensual.
- **Garantías**: `verificarGarantiasMT()` escanea trabajos finalizados con garantiaFin dentro de los próximos 30 días o ya vencidos; dispara `MT_GUARANTEE_EXPIRED` + notify administración una sola vez (flag `alertaGarantiaEnviada`) — idempotente.
- **Pagos**: `actualizarPagoTrabajoMT(id, estadoPago)` transición pendiente→parcial→pagado sin retroceso directo (cancelar requiere volver a pendiente); documental hasta FI.
- **`proyectosMT {id, nombre, descripcion?, presupuestoEstimado, plazoMeses, fechaObjetivo?, estado planificado|en_ejecucion|completado|descartado}`.** Cuota sugerida = presupuestoEstimado / plazoMeses derivable (no se almacena); alarmas por vida útil quedan como fechaObjetivo consultable.
- **Rank 7**: depende de `personas`(1)+`microSectores`(2)+`unidades`(2)+`activosIR`(IR)+`notificaciones`(4). Seed vacío.
- **Migrate v18**: agrega las 2 colecciones vacías aditivas.

## Risks / Trade-offs

- [Financiera declarativa] Estado de pago puede divergir de FI al conectar → aceptado: migración futura reconciliará; hoy es fuente operativa.
- [Generación preventiva encadenada] Cada finalización crea 1 registro futuro → aceptado: evita job programado; el planificado vive visible en el tablero.
- [Tablero lista vs calendario] Lista ordenada cumple la necesidad NSGC de visualizar vencimientos del mes/trimestre → aceptado.

## Migration Plan

Aditiva (colecciones vacías v18). Sin transformación de datos v17.

## Open Questions

Ninguna — estados, prioridades y ciclos preventivos fijados por la spec NSGC de MT.
