# 🎫 17 - Gestión de Solicitudes (GE)

El motor de tickets de la administración: tipifica todo requerimiento formal (insumos, grabaciones CCTV y buzón ciudadano), automatiza el workflow de estados y mide el SLA de resolución.

## 🚀 Funcionalidad Principal

Cada solicitud entra como ticket con folio único `GE-####` y estado Nuevo; el sistema avanza los estados solo (En Revisión al abrir, Requiere Acción ↔ En Proceso según quién responda), notifica al solicitante en cada paso y deja historial para calcular horas de resolución.

## 🛠️ Secciones

- **Panel de Control**: contadores por estado (Nuevo, En Revisión, Requiere Acción Vecino, En Proceso, Resuelto, Cerrado) + SLA promedio de resolución en horas derivado del historial.
- **Bandeja de entrada**: grilla con los 10 tickets más recientes (ID, tipo, fecha, unidad, estado breve) y filtros por rango de fechas, unidad, solicitante y tipo de gestión.
- **Detalle del ticket**: trazabilidad completa — comentarios de administración/solicitante, historial de estados con timestamps y resolución final. Abrir el detalle marca automáticamente En Revisión (primera lectura).
- **Formularios por tipología**:
  - *Insumos*: área de destino obligatoria + material solicitado (catálogo pendiente a **IR**).
  - *Grabaciones CCTV*: fecha/hora del suceso + justificación extendida (mín. 20 caracteres); el residente autocompleta su unidad; si registra el conserje, la vinculación a unidad/residente es obligatoria.
  - *Buzón*: selector de mensaje del buzón CO (FK validada) que hereda asunto y descripción.

## 💡 Tips de Oro

- **Workflow sin manos**: abrir → En Revisión; admin pide datos → Requiere Acción Vecino (+alerta al vecino); vecino contesta → En Proceso (+aviso a administración); resolver → notificación final con la solución; cerrar → SLA registrado.
- **Matriz estricta**: los saltos inválidos se rechazan (ej. cerrar un ticket Nuevo); el cierre solo desde Resuelto.
- **Folio único**: `GE-{secuencial}` generado por el store; ignora cualquier folio entrante en alta.
- **Grabaciones sin unidad no existen**: la regla obliga a vincular unidad/residente incluso cuando lo pide el personal de conserjería.
- **Referencia pendiente IR**: los insumos hoy usan texto libre auditado; cuando exista **IR - Inventario y Recursos** se endurecerá al catálogo real.
- **Auditoría**: `GE_TICKET_CREATED`, `GE_TICKET_STATE_CHANGE`, `GE_TICKET_RESOLVED`.

## 🔗 Dependencias

- Solicitantes/unidades de **MP**, **EF** y **VU** (vínculos vigentes para autocompletar).
- Tickets tipo buzon enlazados a `mensajesBuzonCO` de **CO - Comunicación Vecinos**.
- Notificaciones automáticas con `notify()` (**ST**, D3).

(End of file)
