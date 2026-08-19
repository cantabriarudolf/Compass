# 📋 05 - TU - Tipos de Unidad

Módulo maestro de plantillas técnicas: define los modelos base de las propiedades (metraje y monto base de gasto común) que las unidades heredan al vincularse.

## 🚀 Funcionalidad Principal
Crear, editar, activar/desactivar tipos de unidad y actualizar su tarifario base con fecha de vigencia e impacto proyectado.

## 🛠️ Operaciones
- **Crear Tipo**: Nombre, Categoría, Metraje (m²), Monto Base GC ($) y Descripción (opcional).
- **Categoría**: se selecciona desde el maestro de **Tipos de Propiedad** del módulo [MA - Maestros Administrativos](<10 - MA - Maestros Administrativos.md>). Para agregar una categoría nueva (ej: "Bodega de Vino"), créala primero en Administración → Maestros Administrativos → Tipos de Propiedad; aparecerá acá automáticamente.
- **Actualizar Tarifario**: el Calculador de Impacto muestra unidades afectadas, variación unitaria, impacto mensual y proyección anual antes de guardar. El nuevo monto queda programado con su fecha de vigencia y Finanzas (FI) aplica el reajuste de deuda a morosos.
- **Desactivar (Soft Delete)**: el tipo no se elimina si tiene unidades vinculadas; se desactiva con el "Ojo Tachado" y deja de aparecer en formularios nuevos.

## 📊 Vínculo con Auditoría y Métricas (AM)
Cada alta emite `TU_CREATE` y cada cambio de monto base `TU_UPDATE_VALUE` (con % de variación); las unidades afectadas e impacto en recaudación teórica alimentan el Dashboard Operativo.
