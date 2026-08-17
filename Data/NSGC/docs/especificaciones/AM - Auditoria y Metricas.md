# AM - Auditoría y Métricas

> 🔌 **Datos:** este módulo persiste en la capa de datos (ST) — ver [ST - Capa de Datos Persistente](<ST - Capa de Datos Persistente.md>).

Este módulo tiene como objetivo centralizar el registro de todas las acciones significativas realizadas en el sistema, permitiendo la generación de reportes, KPIs de gestión y trazabilidad completa de la operación.

## 1. Registro Universal de Eventos (The Event Log)

Cada acción gatillada por un usuario o por el sistema de forma automática debe generar un registro con la siguiente estructura:

- **Timestamp:** Fecha y hora exacta del evento.
- **Usuario:** Quién realizó la acción (Administrador, Conserje, Vecino, Sistema).
- **Categoría/Módulo:** Identificador del origen (Finanzas, Personal, Reservas, Comunicaciones).
- **Tipo de Acción:** Acción específica (Emisión, Pago, Notificación, Registro, Eliminación).
- **ID de Referencia:** Vínculo al objeto afectado (ID de la liquidación, ID del residente, etc.).
- **Descripción:** Detalle legible por humanos (ej: "Se emitió certificado de residencia para Unidad 402").
- **Valor Cuantificable:** Si aplica (ej: monto pagado, cantidad de insumos pedidos, tiempo de respuesta).

## 2. Tipificación de Eventos (Ejemplos)

Para que la información sea medible, los eventos deben estar categorizados:

### Gestión de Personal (PE)
- Registro de inicio/fin de turno.
- Pago de liquidaciones de sueldo.
- Registro de horas extra.

### Gestión Financiera (FI)
- Emisión de Gasto Común mensual.
- Recepción y validación de pagos.
- Registro de gastos/egresos del condominio.

### Comunicación y Documentación (CO/AM)
- Envío de notificaciones masivas.
- Emisión de certificados (Residencia, Gastos Comunes al día).
- Descarga de reportes por parte de copropietarios.
- **Cambios en Políticas de Supervisión:** Registro de activación/desactivación de filtros de seguridad (ej. quitar el requisito de Visto Bueno para el Visor de Mensajes).

### Operación y Amenidades (EF/VU)
- Reserva y pago de Quinchos/Salones.
- Registro de visitas en conserjería.
- Recepción de encomiendas.
- Solicitud y entrega de insumos de mantención.

## 3. Panel de Incumplimientos y Tareas Huérfanas (Accountability)

El sistema no solo registra lo que se hace, sino que **monitorea activamente lo que se omite**. Cualquier estado temporal que no llegue a su estado final dentro de un tiempo esperado generará una alerta de negligencia o ineficiencia administrativa:

- **Turnos No Cerrados:** Si un turno finaliza su horario y no registra el Cierre de Turno (`PE`), se levanta una alerta crítica de "Operación No Reportada".
- **Visitas/Contratistas Fantasmas:** Si un residente agendó una visita o contratista para un día, y la conserjería nunca marcó su ingreso o anulación, la tarea queda huérfana. Esto expone si el conserje está ignorando el pre-agendamiento.
- **Gestiones Estancadas:** Solicitudes de insumos (`IR`) o tickets de reclamo (`CO`) que superan el SLA (Acuerdo de Nivel de Servicio) sin ser procesados.
- **Propósito:** Obligar a la administración y al personal a cerrar los ciclos, ya que estos "ciclos abiertos" se visibilizan directamente en el Dashboard del Comité.

## 4. Métricas y KPIs Sugeridos

A partir de los registros y las tareas huérfanas, el módulo proyecta:
- **Tasa de Eficiencia Operativa:** Porcentaje de turnos cerrados a tiempo vs. turnos abandonados.
- **Productividad:** Cantidad de gestiones resueltas (entrega de insumos, resolución de tickets).
- **Uso de Amenidades:** Frecuencia de arriendo y recaudación (`RA`).
- **Nivel de Servicio:** Tiempo de respuesta ante solicitudes y reclamos.
- **Velocidad de Recaudación (Curva de Pagos):** Análisis de la velocidad de ingreso de dinero por días del mes, semanas o rangos específicos. Permite al administrador planificar los egresos basándose en la temporalidad real de la liquidez disponible.

## 5. Reglas de Integridad
- **Inmutabilidad:** Los registros de auditoría no pueden ser editados ni eliminados, ni siquiera por el administrador.
- **Persistencia:** Los logs deben mantenerse por un periodo mínimo de 5 años para efectos legales y de rendición de cuentas.
- **Aceptación de Riesgo:** Cualquier acción que desactive una medida de control por defecto (como el VB de mensajes) debe generar un log de sistema de alta prioridad, vinculando explícitamente al administrador que ejecutó el cambio como responsable legal de las consecuencias de dicha omisión de control.

## 6. Visibilización de la Utilidad (Value Aesthetics)

Para evitar que la alta automatización del sistema haga "invisible" el esfuerzo administrativo, el módulo AM debe proyectar indicadores de valor proactivos:

- **Cuantificación del Trabajo Automatizado:** Mostrar el volumen de datos procesados (ej: "83 propiedades auditadas", "100 plazas de parking monitoreadas").
- **Impacto Económico en Tiempo Real:** Visualizar cómo las decisiones administrativas (ej: reajuste de precios en `TU`) afectan la recaudación proyectada de la comunidad.
- **Contador de Acciones de Gestión:** Visibilizar el número de intervenciones administrativas exitosas (emisiones, registros, validaciones) para resaltar la actividad de la administración frente a los copropietarios.
- **Propósito:** Transformar el software de una simple herramienta de registro a un panel de resultados que demuestre la utilidad y proactividad del servicio prestado.
