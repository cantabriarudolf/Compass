# CRUD de Estacionamientos

Administración de las plazas de aparcamiento del condominio.

## 1. Atributos Requeridos
- **Número de Estacionamiento:** Identificador único.
- **Ubicación:** (Superficie, Subterráneo).
- **ID Unidad Principal:** (Opcional) Vínculo con el departamento o local al que pertenece.
- **Metraje:** Superficie asignada (si aplica para el prorrateo).
- **Prorrateo Propio:** Coeficiente si el estacionamiento tributa de forma independiente.

## 3. Historial de Asignaciones (Trazabilidad)

Un estacionamiento puede cambiar de dueño o ser arrendado independientemente de la unidad. El sistema debe llevar un registro histórico:
- **Tramos Temporales:** Toda asignación (a una unidad o persona) debe tener fecha de inicio y término.
- **Cambio de Asignación:** Al reasignar un estacionamiento, el tramo anterior se cierra automáticamente.

## 5. Vínculo con Auditoría y Métricas (AM)
Toda acción administrativa realizada en este módulo (asignaciones, cambios de dueño, liberaciones de plazas) debe ser contabilizada y visibilizada en el **Módulo AM**. La tasa de ocupación y el historial de rotación de parking alimentan el Dashboard de Gestión Operativa, transformando la ejecución técnica en valor cuantificable para la comunidad.
