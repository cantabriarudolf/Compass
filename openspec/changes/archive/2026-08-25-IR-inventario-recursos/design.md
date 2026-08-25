## Context

Dependencias resueltas: EF (microSectores/unidades para ubicación), MP (personas como responsable/solicitante — la vinculación laboral plena con PE llega en S6 y queda documentada como pendiente), maestros MA (`unidadesMedida`, `categoriasInsumos`). GE dejó `detalleInsumos.materialSolicitado` como texto libre con nota "catálogo pendiente a IR"; este change introduce el catálogo pero NO reescribe GE (los tickets históricos conservan su texto; el endurecimiento es hacia adelante). Sin sesión real, "el trabajador pide el insumo" se simula con selector de solicitante como en GD/GE.

## Goals / Non-Goals

**Goals:**
- Catálogo único de recursos con 4 naturalezas: infraestructura, mobiliario, insumo (stock + umbral crítico) y acceso (llaves/credenciales).
- Gestión operativa trazable del consumo: quién pidió, qué tipo, para qué ubicación; cierre con entrega que descuenta stock.
- Comodín de artículo no catalogado con las 3 salidas administrativas del NSGC (aprobar y crear / sustituir / rechazar).
- EPP por individuo con ciclo de renovación; llaves con asignación vigente "quién tiene qué".

**Non-Goals:**
- Vinculación contable real a egresos FI → referencia pendiente (`cargoFIReferencia:"pendiente"`).
- Ficha laboral del responsable (PE, Ventana 7): hoy se apunta a MP.
- Alerta automática al fin de turno de conserjería (requiere turnos PE): la detección de llaves no devueltas es una vista de asignaciones vencidas.

## Decisions

- **Colección unificada `activosIR {id, codigo IR-A-*, nombre, categoria infraestructura|mobiliario|insumo|acceso, marca?, modelo?, fichaTecnicaUrl? (D1), microSectorId? (EF), unidadId? (EF, obligatoria para acceso-llave), responsablePersonaId? (MP), estadoActivo disponible|en_uso|reparacion|baja, esInsumo derivado de categoria, unidadMedidaId? (MA), stock, esCritico, umbralCritico?, proveedor?, numeroFactura?, facturaUrl? (D1), garantiaHasta? (fecha), talla? (EPP), renovacionMeses? (EPP), cargoFIReferencia literal "pendiente" opcional}`.** Un solo catálogo simplifica grilla/filtros; los campos opcionales se validan por categoría en el store (no en Zod) para mantener un esquema único.
- **`solicitudesInsumoIR {id, folio SI-*, solicitantePersonaId, recursoInsumoId? (FK activosIR), comodin? {descripcionArticulo, cantidad, justificacion}, estadoComodin no_comodin|pendiente|aprobada_creada|sustituida|rechazada, cantidad, areaDestino (texto EF-friendly), estado pendiente|entregada|rechazada, fechaSolicitud, entregaFecha?, rechazoJustificacion?}`.** La solicitud normal exige recurso existente con stock suficiente al entregar; el comodín exige descripción+cantidad+justificación y dispara alerta crítica.
- **`resolverComodinIR(id, decision)`:** `aprobada_creada` crea automáticamente el artículo en `activosIR` (nombre = descripción del comodín) y liga la solicitud; `sustituida` exige `recursoSustitutoId` válido; `rechazada` exige justificación. Las tres cierran el estado del comodín y notifican al solicitante.
- **Stock crítico:** umbral fijado al crear si `esCritico`; `entregarSolicitudInsumoIR` valida stock ≥ cantidad, descuenta, y si queda ≤ umbral emite `IR_STOCK_LOW` + notify administración. Idempotente por evento: solo dispara al cruzar.
- **`entregasEPP {id, recursoId (FK categoria epp), personaId, fechaEntrega, talla?, estado nuevo|usado|renovar, proximaRenovacion? (fecha = fechaEntrega + renovacionMeses)}`.** Evento `IR_DELIVERY_EPP` por entrega; % personal con EPP vigente deriva de entregas con `proximaRenovacion >= hoy`.
- **Accesos:** `asignarAccesoIR(recursoId, personaId)` deja asignación vigente {personaId, fecha}; `devolverAccesoIR` la cierra. Vista "no devueltas" = accesos con asignación vigente de fecha anterior a hoy (fin de turno simulado).
- **Estados del activo:** `cambiarEstadoRecursoIR` audita `IR_ASSET_REPAIR` al pasar a reparación y evento de baja al pasar a baja (pérdida/robo/fin de vida útil → alimenta ratio de pérdida AM).
- **Rank 6**: depende de `personas`(1)+`microSectores`(2)+`unidades`(2)+maestros(0). Seed vacío.
- **Migrate v16**: agrega las 3 colecciones vacías aditivas.

## Risks / Trade-offs

- [Catálogo unificado] Campos opcionales por naturaleza → aceptado: validaciones por categoría centralizadas en el store evitan 4 colecciones espejo.
- [GE texto libre] Tickets GE antiguos no retro-ligan al catálogo → aceptado: dominios distintos (gestión vs inventario); cruce futuro por nombre.
- [Referencias pendientes FI/PE] Campos documentados con patrón literal `"pendiente"` igual que GD→CV.

## Migration Plan

Aditiva (colecciones vacías v16). Sin transformación de datos v15.

## Open Questions

Ninguna — categorías, flujo de solicitud y salidas del comodín fijados por la spec NSGC de IR.
