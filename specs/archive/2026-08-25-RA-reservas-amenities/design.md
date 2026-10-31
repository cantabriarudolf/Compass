## Context

Dependencias resueltas: EF (micro sectores), MP (solicitantes con estado de cuenta), IR (activos mobiliarios como hidrolavadora/taladro) y `notify()` (PI). FI no existe → los cobros por tarifa, penalizaciones y garantías retenidas usan el patrón `cargoFIReferencia:"pendiente"` y alimentarán el Fondo Específico de Amenities en la Ventana 6. La validación de morosidad (§2 NSGC) exige consultar deuda en FI: sin fuente de deuda hoy, el gate queda especificado e inerte.

## Goals / Non-Goals

**Goals:**
- Maestro parametrizable de elementos reservables (espacios físicos y activos mobiliarios) con tarifa, garantía y reglas especiales.
- Prevención dura de overbooking: solapamiento horario bloqueado según stock concurrente del elemento.
- Ciclo completo de reserva: crear → confirmada → cancelada (con detección de tardía) / retención de garantía por daños.
- Auditoría cuantificable para AM/RE (uso por amenity, ingresos derivables, garantías retenidas).

**Non-Goals:**
- Lista de espera automática (opcional en NSGC): queda fuera; la cancelación solo libera el calendario.
- Movimiento contable real en el Fondo de Amenities (FI, Ventana 6).
- Gate activo de morosidad (requiere FI); se documenta su contrato para la conexión.
- Calendario visual mensual arrastrable: grilla cronológica ordenada por fecha/hora cumple el control anti-overbooking.

## Decisions

- **`elementosRA {id, nombre, tipo espacio_fisico|activo_mobiliario, microSectorId? (EF), activoIRId? (IR), franja bloques_horas|dia_completo, duracionBloqueHoras? 1..24, tarifaUso ≥0, garantiaRequerida ≥0, aforo?, stock?, anticipacionMinimaDias?, cancelacionTardiaDias?, penalizacionTardiaMonto?, activo}`.** Exige al menos una ubicación (micro sector EF o activo IR, FK validadas). `stock` aplica a activos idénticos disponibles simultáneamente (2 quinchos iguales); espacios usan capacidad implícita 1 con `aforo` informativo.
- **`reservasRA {id, folio RA-* auto, elementoId, solicitantePersonaId (MP activa), unidadId?, fecha AAAA-MM-DD, horaInicio/horaFin HH:MM, estado confirmada|cancelada, montoTarifa/montoGarantía snapshot al reservar, cancelacion {fecha, tardia, penalizacion}? , garantiaRetenida {monto, motivo}?, cargoFIReferencia literal "pendiente"?}`.**
- **Conflicto horario**: dos tramos [inicio, fin) se solapan si `inicioA < finB && inicioB < finA`; `dia_completo` ocupa 00:00–23:59. Se cuenta el total de reservas confirmadas solapadas en la fecha y se rechaza la nueva cuando `solapadas >= stock(≥1)`. Las canceladas no bloquean.
- **Anticipación mínima**: `fecha < hoy + anticipacionMinimaDias` → rechazo con mensaje claro (regla especial del elemento).
- **Cancelación tardía**: al cancelar, si faltan ≤ `cancelacionTardiaDias` días para la reserva se registra `tardia:true` y la `penalizacionTardiaMonto` como cargo pendiente a FI.
- **Garantías**: snapshot del monto requerido al crear la reserva; `retenerGarantiaRA(id, motivo)` marca la retención (activo dañado) con evento `RA_WARRANTY_RETAINED` y cargo pendiente al fondo de amenities. Alerta a conserjería vía notify al retener.
- **Rank 8**: depende de personas (1) + microSectores/unidades (2) + activosIR (IR) + notificaciones (4). Seed vacío.
- **Migrate v19**: agrega las 2 colecciones vacías aditivas.

## Risks / Trade-offs

- [Morosidad inerte] Un deudor podría reservar hasta conectar FI → aceptado: no existe fuente de deuda; el gate queda documentado en spec para Ventana 6.
- [Snapshot de tarifas] Editar la tarifa del elemento no re-precia reservas futuras → aceptado: cada reserva conserva el precio pactado al confirmar.
- [Conflicto por conteo] Con stock N, N+1 solicitudes simultáneas se resuelven primera-gana (orden de guardado) → aceptado: sin concurrencia real en cliente único.

## Migration Plan

Aditiva (colecciones vacías v19). Sin transformación de datos v18.

## Open Questions

(ninguna)
