# 🚗 03 - Estacionamientos (ES)

Módulo diseñado pa' llevar el control quirúrgico del parking. Olvídate de las listas en Excel; acá tenís una tabla de alta densidad que aguanta cientos de registros sin despeinarse.

## 🚀 Funcionalidad Principal
Gestionar el inventario de plazas, su ubicación exacta y a quién pertenecen.

## 🛠️ Herramientas Clave
- **Vínculo Granulizado**: Al crear o editar una plaza, podís amarrarla a un departamento usando un selector triple (Torre -> Piso -> Depto). Así es imposible equivocarse de vecino.
- **Filtros Pro**:
    *   Filtra por **Macro-Sector** pa' ver solo los estacionamientos de una torre específica.
    *   Filtra por **Estado** pa' pillar rápido cuáles están libres pa' las visitas.
- **Ubicación Detallada**: Tenís un campo de texto libre pa' poner cosas como "Detrás del pilar 4" o "Cerca de la salida de emergencia".

## 💡 Manejo de Escala
La vista de tabla está optimizada para condominios grandes. Si necesitái buscar una plaza específica o una unidad, dale al buscador y te va a filtrar todo al tiro.

## 📊 Vínculo con Auditoría y Métricas (AM)
Toda acción administrativa realizada en este módulo (asignaciones, cambios de dueño, liberaciones de plazas) debe ser contabilizada y visibilizada en el **Módulo AM**. La tasa de ocupación y el historial de rotación de parking alimentan el Dashboard de Gestión Operativa, transformando la ejecución técnica en valor cuantificable para la comunidad.
