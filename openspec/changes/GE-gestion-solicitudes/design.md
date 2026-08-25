## Context

Dependencias resueltas: personas/unidades/vínculos (MP/EF/VU) para solicitante y unidad, `mensajesBuzonCO` (CO, implementado en esta misma sesión antes que GE) para tickets tipo buzon, `notify()` con canal `email_simulado` (PI) y gate AD de alertas. Ruta `/operaciones/solicitudes` ya enlazada en sidebar. Sin sesión real (mock-first), la "autocompleción del residente" se simula con selector de vista por rol como en GD.

## Goals / Non-Goals

**Goals:**
- Motor de tickets único para insumos/grabaciones/buzón con workflow automático auditable.
- Bandeja eficiente: 10 más recientes por defecto, filtros y detalle trazable.
- SLA medible desde datos (fechas + historial), sin cálculos externos.

**Non-Goals:**
- Catálogo de insumos/materiales: el módulo IR no existe aún → referencia pendiente (`insumoReferencia` libre + área destino obligatoria). Se resolverá cuando IR aterrice.
- Asignación de responsables/colas de trabajo por usuario (sin auth real hasta AU).
- Grabación/descarga real de video CCTV: la resolución es un link/texto.

## Decisions

- **Colección única `solicitudesGE {id, folio, tipo, titulo, descripcion, solicitantePersonaId?, unidadId?, estado, fechaCreacion, comentarios[] {id, autorRol, texto, fecha}, detalleGrabaciones? {fechaSuceso, horaSuceso, justificacion}, detalleInsumos? {areaDestino, materialSolicitado}, mensajeBuzonId?, resolucion?, fechaCierre?, historialEstados[] {de?, a, fecha}}`.** Un registro por ticket; el historial embebido evita segunda colección y alimenta SLA.
- **Estados**: `nuevo | en_revision | requiere_accion_vecino | en_proceso | resuelto | cerrado` (NSGC §1.4). Transiciones centralizadas en un helper interno `transicionar()` que valida la matriz permitida, agrega historial, notifica al solicitante y audita `GE_TICKET_STATE_CHANGE`.
- **Folio**: `GE-<secuencia>` análogo al BUZ de CO; único por construcción.
- **Apertura**: `abrirSolicitudGE(id)` marca primera lectura admin → `en_revision`; idempotente si ya está más adelante.
- **Buzón↔GE**: el ticket tipo buzon nace desde GE referenciando `mensajeBuzonId` (FK validada); hereda asunto/cuerpo. El ciclo ciudadano visible del vecino queda en CO (folio BUZ); el operativo vive aquí — vocabularios distintos por diseño NSGC, clave de cruce = folio/FK.
- **Grabaciones**: si `solicitantePersonaId` tiene vínculo activo se autocompleta unidad; si registra personal sin unidad → error "debe vincular unidad/residente". Justificación mínima 20 caracteres (texto extendido).
- **Rank 6**: depende de `personas`(1)+`unidades`(2)+`vinculos`(3)+`notificaciones`(4)+`mensajesBuzonCO`(CO). Seed vacío.
- **Migrate v15**: agrega `solicitudesGE: []` aditivo.

## Risks / Trade-offs

- [Doble ciclo CO/GE] Riesgo de divergencia de estados → aceptado: dominios distintos (ciudadano vs operacional); documentado en ambos specs.
- [Historial embebido] Crece con el ticket → aceptado: tickets son de vida corta; MAX_EVENTOS protege eventos AM.
- [Referencia pendiente IR] Insumos sin catálogo → campo texto libre auditado; se endurecerá con IR.

## Migration Plan

Aditiva (colección vacía v15). Sin transformación de datos v14.

## Open Questions

Ninguna — workflow y estados fijados por NSGC §1.4.
