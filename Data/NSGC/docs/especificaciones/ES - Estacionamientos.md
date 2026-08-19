# ES - Estacionamientos (CRUD)

Administración de las plazas de aparcamiento del condominio.

## 1. Atributos Requeridos
- **Número de Estacionamiento:** Identificador único.
- **Ubicación:** Texto libre (ej: "Subterráneo -1, Sector Norte"). El filtro rápido del módulo usa el maestro **Ubicaciones de Estacionamiento** del módulo [MA - Maestros Administrativos](<MA - Maestros Administrativos.md>) (`ubicacionesEstacionamiento`).
- **ID Unidad Principal:** (Opcional) Vínculo con el departamento o local al que pertenece.
- **Macro-Sector:** (Opcional) Sector físico donde se ubica la plaza (`EF`). Permite filtrar y agrupar estacionamientos por torre/sector.
- **Asignado A:** Etiqueta visual legible de la asignación actual (ej: "Depto 204 (Torre A)", "Disponible"). Derivada automáticamente de la unidad vinculada.
- **Estado de Ocupación:** Vínculo al maestro `ESTADOS_OCUPACION` (Vacante, En Uso, En Arriendo, En Venta, En Mantención).
- **Metraje:** Superficie asignada (si aplica para el prorrateo).
- **Prorrateo Propio:** Coeficiente si el estacionamiento tributa de forma independiente.

## 2. Historial de Asignaciones (Trazabilidad)

Un estacionamiento puede cambiar de dueño o ser arrendado independientemente de la unidad. El sistema debe llevar un registro histórico:
- **Tramos Temporales:** Toda asignación (a una unidad o persona) debe tener fecha de inicio y término.
- **Cambio de Asignación:** Al reasignar un estacionamiento, el tramo anterior se cierra automáticamente.

## 3. Integración con Auditoría y Métricas (AM)

Registro de asignaciones, cambios de dueño y liberaciones de plazas:
- **Evento:** `ES_ASSIGN_CREATED`, `ES_ASSIGN_CHANGED`, `ES_ASSIGN_RELEASED`.
- **Data Cuantificable:** Cantidad de plazas ocupadas vs disponibles, cambios de asignación por periodo.
- **Métrica:** Tasa de ocupación de estacionamientos, rotación de asignaciones, ingresos por estacionamientos arrendados.
