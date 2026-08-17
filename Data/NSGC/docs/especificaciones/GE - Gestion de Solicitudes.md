# GE - Gestión de Solicitudes

> 🔌 **Datos:** este módulo persiste en la capa de datos (ST) — ver [ST - Capa de Datos Persistente](<ST - Capa de Datos Persistente.md>).

Este módulo centraliza y tipifica todos los requerimientos formales (Tickets) que fluyen hacia la administración, ya sea desde el personal o desde los residentes, asegurando que nada quede en el aire.

## 1. Tipologías de Solicitudes (Gestiones)

### 1.1 Solicitud de Insumos y Materiales
- **Solicitante:** Personal de Servicio (Vinculado a `IR`).
- **Objetivo:** Pedir herramientas o consumibles especificando el área de destino.

### 1.2 Solicitud de Registro de Grabaciones (CCTV)
- **Solicitante:** Residente o Personal de Conserjería.
- **Lógica del Formulario:**
  - *Identificación:* Si el residente ingresa a la app, su unidad y nombre se autocompletan. Si el conserje hace la solicitud (ej: porque el vecino bajó al lobby a pedirlo), el sistema obliga al conserje a vincular la solicitud a una unidad/residente específico del maestro.
  - *Fecha y Hora del Suceso:* Interfaz de selección (DatePicker/TimePicker) nativa y responsiva, optimizada para uso ágil tanto en celular como en escritorio.
  - *Justificación:* Campo de texto extendido obligatorio para detallar el motivo y contexto.

### 1.3 Tickets del Buzón de Interacción Ciudadana
- **Fuente:** Registros provenientes del [Módulo de Comunicación (CO)](<CO - Comunicacion Vecinos.md>#3-buzon-de-interaccion-ciudadana-felicitaciones-sugerencias-y-reclamos).
- **Tratamiento:** Aunque nacen en el buzón, su ciclo de vida operativo (estados, tiempos de respuesta y cierre) es gestionado íntegramente por este motor de tickets para asegurar la trazabilidad y auditoría (AM).

### 1.4 Ciclo de Vida y Estados Automáticos (Workflow)
El sistema vela por la transición de estados sin depender exclusivamente de que el administrador los cambie a mano. Los cambios de estado automatizan las **notificaciones** al solicitante:
- **`Nuevo` (Ingresado):** Estado inicial al crear la solicitud. Gatilla notificación de confirmación de recepción.
- **`En Revisión`:** El sistema cambia automáticamente a este estado en el momento en que un administrador "Abre" o "Lee" el detalle del ticket por primera vez.
- **`Requiere Acción del Vecino`:** Si el administrador responde solicitando más datos (ej: "Por favor, indique a qué hora exacta fue el robo para ver las cámaras"), el estado cambia automáticamente y alerta al solicitante.
- **`En Proceso`:** Si el residente responde a la solicitud de información, el ticket vuelve automáticamente a estar del lado de la administración.
- **`Resuelto / Cerrado`:** Cuando se entrega la solución (ej: se sube un link con el video, o se marca el insumo como entregado). Gatilla notificación final.

## 2. Historial y Bandeja de Entrada (Grilla)

Para evitar la sobrecarga visual, el sistema organiza las gestiones en un formato tabular moderno.
- **Vista Resumen:** Una grilla que muestra por defecto los 10 registros más recientes con columnas clave (ID Ticket, Tipo, Fecha, Unidad, Estado Breve).
- **Vista de Detalle:** Al seleccionar un registro de la grilla, se abre una tarjeta o modal con la trazabilidad completa, comentarios y resoluciones.
- **Motor de Filtros:** Buscadores integrados para filtrar rápidamente por:
  - Rango de Fechas.
  - Número de Unidad.
  - Nombre del Solicitante.
  - Tipo de Gestión (Insumos vs Grabaciones).

## 3. Integración con Reportería (Dashboard de Solicitudes)

Cada vez que se oprime el botón "Enviar Solicitud", el sistema gatilla métricas de contabilización en tiempo real.
- **Dashboard de Control (Administrador):** Un panel dedicado donde el administrador ve el volumen de peticiones segmentadas por estado (Nuevas, En Proceso, Resueltas).
- **Métricas de Rendimiento (SLA):** El sistema expone gráficamente cuánto tiempo (en horas/días) se demora la administración en resolver las solicitudes, evidenciando cuellos de botella en la gestión.

## 4. Integración con Auditoría y Métricas (AM)

Cada cambio de estado o cierre de ticket debe quedar registrado para alimentar el dashboard de gestiones:
- **Evento:** `GE_TICKET_CREATED`, `GE_TICKET_STATE_CHANGE`, `GE_TICKET_RESOLVED`.
- **Data Cuantificable:** Cantidad de solicitudes por tipología, tiempo de resolución (SLA) en horas.
- **Métrica:** Tasa de resolución, tiempo promedio de respuesta por tipo de gestión.
