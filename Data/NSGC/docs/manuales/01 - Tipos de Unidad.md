# 📋 01 - Tipos de Unidad (TU)

Este módulo es el "corazón técnico" del sistema. Aquí es donde definís las plantillas (blueprints) de las propiedades para que después no tengái que escribir los mismos datos una y otra vez.

## 🚀 Funcionalidad Principal
La herramienta permite crear modelos base (ej: "Depto Tipo A", "Local Estándar") que definen el metraje y los cobros base. Todas las unidades que amarrís a este tipo heredarán estas métricas automáticamente.

## 🛠️ Operaciones
- **Crear Tipos**: Definí el nombre, metraje cuadrado y el monto base de Gasto Común.
- **Deshabilitar (Soft Delete)**: Si un modelo ya no se ocupa, no lo borrí (pa' no echar a perder el historial). Simplemente dale al icono del "Ojo Tachado" para desactivarlo. Los tipos inactivos ya no aparecerán cuando querái crear unidades nuevas.
- **Categorización**: Cada tipo se asocia a una categoría física (Depto, Casa, Estacionamiento, etc.) para que el sistema sepa cómo tratarlo.

## ⚠️ Aviso de Duplicados (D5 — Plataforma P3)

Repetidos **permitidos** (D5): el sistema no bloquea nombres duplicados, pero te avisa.

- Al guardar un tipo con un **nombre ya existente** (comparación case-insensitive, sin contar el propio en edición), la UI muestra un diálogo advisory: *"Ya existe un tipo de unidad con ese nombre. ¿Deseas continuar? (D5: repetidos permitidos, es solo un aviso)"* con Confirmar/Cancelar.
- Si confirmás, se persiste igual (`saveTipoUnidad` del store sigue permitiendo repetidos); si cancelás, el guardado se aborta sin mutar. El aviso vive solo en el formulario (`k0mp4ss_fe/apps/web/app/inventario/tipos/page.tsx:86`), no en el store, así que llamadas directas a `saveTipoUnidad` desde código/tests siguen funcionando.

## 💡 Tips de Oro
- **Metraje Estricto**: Asegúrate que el metraje sea el correcto aquí, porque en la ficha de la unidad va a quedar bloqueado por seguridad.
- **Historial**: Si te equivocaste en un tipo que ya está siendo usado, edítalo con cuidado; el cambio se verá reflejado en todas las propiedades amarradas a ese modelo.
- **Repetidos**: usá el aviso D5 para evitar crear "Depto Tipo A" dos veces por error, pero sabé que podís confirmar si es intencional (ej: variante temporal).

## 📊 Vínculo con Auditoría y Métricas (AM)
Toda acción administrativa realizada en este módulo (especialmente cambios en el tarifario base) debe ser contabilizada y visibilizada en el **Módulo AM**. Los indicadores de recaudación proyectada de este módulo alimentan el Dashboard de Gestión Operativa, transformando la ejecución técnica en valor cuantificable para la comunidad.

*Actualizado: 27/08/2026 — P3 D5 aviso duplicados por nombre (no bloqueante)*
