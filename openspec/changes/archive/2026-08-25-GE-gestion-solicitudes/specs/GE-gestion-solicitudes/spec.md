## ADDED Requirements

### Requirement: Creación de Solicitudes Tipificadas
El sistema MUST permitir crear solicitudes mediante `saveSolicitudGE` retornando `StoreResult`, con tipos `insumos`, `grabaciones` y `buzon`. Toda solicitud nueva inicia en estado "Nuevo", genera folio único y gatilla notificación de confirmación de recepción al solicitante vía `notify()` más evento `GE_TICKET_CREATED`. La tipología grabaciones MUST autocompletar unidad/nombre cuando ingresa el residente y exigir vínculo a unidad/residente del maestro cuando lo registra el personal de conserjería; fecha y hora del suceso y justificación extendida son obligatorias. La tipología insumos exige área de destino (el catálogo de materiales queda como referencia pendiente al módulo IR).

#### Scenario: Ticket nuevo con confirmación
- **WHEN** se guarda una solicitud válida
- **THEN** queda en estado "Nuevo" con folio único
- **AND** el solicitante recibe notificación email_simulado de recepción
- **AND** AM registra `GE_TICKET_CREATED`

#### Scenario: Grabación sin justificación rechazada
- **WHEN** se intenta crear un ticket de grabaciones sin justificación o sin fecha/hora del suceso
- **THEN** retorna `{ok:false}` indicando los campos obligatorios

#### Scenario: Conserje debe vincular unidad/residente
- **WHEN** el personal registra una solicitud de grabaciones sin unidad asociada
- **THEN** retorna `{ok:false}` exigiendo la vinculación a una unidad/residente del maestro

#### Scenario: Ticket de buzón enlazado a CO
- **WHEN** se crea un ticket tipo "buzon" referenciando un mensaje del buzón CO
- **THEN** valida la FK contra `mensajesBuzonCO` y hereda asunto/descripción del mensaje

### Requirement: Workflow Automático de Estados
El ciclo de vida MUST transicionar sin depender exclusivamente del administrador: "Nuevo" → "En Revisión" automáticamente cuando un administrador abre/lee el ticket por primera vez (`abrirSolicitudGE`); "Requiere Acción Vecino" cuando la administración responde solicitando más datos (`responderSolicitudGE`); "En Proceso" cuando el solicitante contesta; "Resuelto" al entregar solución (`resolverSolicitudGE`) y "Cerrado" al finalizar (`cerrarSolicitudGE`). Cada transición relevante notifica automáticamente al solicitante y queda auditada como `GE_TICKET_STATE_CHANGE` con historial de estados.

#### Scenario: Apertura marca En Revisión
- **WHEN** un administrador abre por primera vez el detalle de un ticket "Nuevo"
- **THEN** el estado pasa automáticamente a "En Revisión" y se audita la transición

#### Scenario: Ida y vuelta requiere acción / en proceso
- **WHEN** la administración pide datos adicionales y luego el vecino responde
- **THEN** el estado va de "Requiere Acción Vecino" a "En Proceso" con notificaciones en ambas direcciones

#### Scenario: Resolución notifica cierre
- **WHEN** se resuelve el ticket con su solución
- **AND** se audita `GE_TICKET_RESOLVED` y se notifica al solicitante

### Requirement: Bandeja de Entrada con Grilla y Filtros
El sistema MUST presentar las gestiones en grilla con vista resumen de los registros más recientes (ID/folio, tipo, fecha, unidad, estado breve), vista de detalle con trazabilidad completa (comentarios y resoluciones) y motor de filtros por rango de fechas, número de unidad, nombre del solicitante y tipo de gestión.

#### Scenario: Filtro combinado
- **WHEN** el usuario filtra por rango de fechas y tipo "grabaciones"
- **THEN** la grilla muestra solo los tickets que cumplen ambos criterios ordenados del más reciente al más antiguo

#### Scenario: Detalle con trazabilidad
- **WHEN** se selecciona un registro de la grilla
- **AND** muestra comentarios, cambios de estado con fechas y resolución final

### Requirement: Dashboard de Control y Métricas SLA
El sistema MUST exponer un panel donde la administración vea el volumen de solicitudes segmentadas por estado (Nuevas, En Revisión/Proceso, Resueltas/Cerradas) y métricas de rendimiento: tiempo de resolución (SLA) en horas derivable desde fechas de creación/cierre y el historial de eventos.

#### Scenario: Volumen por estado
- **WHEN** la administración abre el panel de control
- **THEN** visualiza contadores por estado calculados desde `solicitudesGE`

#### Scenario: SLA promedio
- **WHEN** la reportería consulta rendimiento
- **THEN** puede derivar horas promedio de resolución por tipología desde fechas e historial

### Requirement: Integración con Auditoría y Métricas (AM)
El módulo SHALL emitir `GE_TICKET_CREATED`, `GE_TICKET_STATE_CHANGE` y `GE_TICKET_RESOLVED` como eventos inmutables con data cuantificable: cantidad de solicitudes por tipología, tiempo de resolución (SLA) en horas y tasa de resolución.

#### Scenario: Auditoría completa
- **WHEN** ocurre cualquier transición de estado o cierre
- **THEN** el evento registra folio, tipo y descripción legible sin mutar colecciones históricas
