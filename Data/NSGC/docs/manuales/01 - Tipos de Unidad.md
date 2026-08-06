# 📋 01 - Tipos de Unidad (TU)

Este módulo es el "corazón técnico" del sistema. Aquí es donde definís las plantillas (blueprints) de las propiedades para que después no tengái que escribir los mismos datos una y otra vez.

## 🚀 Funcionalidad Principal
La herramienta permite crear modelos base (ej: "Depto Tipo A", "Local Estándar") que definen el metraje y los cobros base. Todas las unidades que amarrís a este tipo heredarán estas métricas automáticamente.

## 🛠️ Operaciones
- **Crear Tipos**: Definí el nombre, metraje cuadrado y el monto base de Gasto Común.
- **Deshabilitar (Soft Delete)**: Si un modelo ya no se ocupa, no lo borrí (pa' no echar a perder el historial). Simplemente dale al icono del "Ojo Tachado" para desactivarlo. Los tipos inactivos ya no aparecerán cuando querái crear unidades nuevas.
- **Categorización**: Cada tipo se asocia a una categoría física (Depto, Casa, Estacionamiento, etc.) para que el sistema sepa cómo tratarlo.

## 💡 Tips de Oro
- **Metraje Estricto**: Asegúrate que el metraje sea el correcto aquí, porque en la ficha de la unidad va a quedar bloqueado por seguridad.
- **Historial**: Si te equivocaste en un tipo que ya está siendo usado, edítalo con cuidado; el cambio se verá reflejado en todas las propiedades amarradas a ese modelo.

## 📊 Vínculo con Auditoría y Métricas (AM)
Toda acción administrativa realizada en este módulo (especialmente cambios en el tarifario base) debe ser contabilizada y visibilizada en el **Módulo AM**. Los indicadores de recaudación proyectada de este módulo alimentan el Dashboard de Gestión Operativa, transformando la ejecución técnica en valor cuantificable para la comunidad.
