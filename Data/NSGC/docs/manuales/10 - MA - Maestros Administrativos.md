# ⚙️ 10 - MA - Maestros Administrativos

Panel central de tablas de referencia: el "diccionario" de la comunidad. Todo lo que se configura acá alimenta los selectores y etiquetas de los demás módulos.

## 🛠️ Secciones
- **Estados de Ocupación**: estados de las unidades (Vacante, En Uso, En Arriendo, etc.) con clase de color y hex automático para la dona de Estructura Física.
- **Etiquetas Macro / Micro**: nombres de agrupaciones mayores (Torre, Manzana…) y menores (Piso, Nivel…). Alimentan Estructura Física (EF).
- **Tipos de Propiedad**: categorías de unidad (Depto, Casa, Local, Oficina, Bodega, Estacionamiento). Alimentan el campo **Categoría** de [TU - Tipos de Unidad](<05 - TU - Tipos de Unidad.md>) y la etiqueta de las unidades en EF.
- **Ubicaciones de Estacionamiento**: ubicaciones típicas de plazas (Superficie, Subterráneo -1, etc.). Alimentan el filtro de ubicación del módulo ES.
- **Estados Inmobiliarios**: estados de ocupación de la propiedad (Habitada, Próxima Vacancia, En Arriendo, Arrendada, En Venta). Alimentan el campo **Estado Ocupación Propiedad** del módulo VU.
- **Condiciones Especiales**: etiquetas de vulnerabilidad del Maestro de Personas (MP).
- **Directorio de Emergencia**: números críticos para residentes y personal.
- **Instituciones Bancarias**: bancos permitidos para cuentas y transferencias (FI).

## 🔌 Regla de Consumo
Las categorías y etiquetas son **solo etiquetas**: no crean sectores ni unidades reales. Los sectores concretos (ej: "Torre A", "Piso 3") se crean en Inventario → Estructura Física usando estas etiquetas.

## ⚠️ Seguridad de Datos
Aquí nada se borra de forma permanente: se desactiva para que no aparezca en formularios nuevos, manteniendo intacto el historial de lo ya registrado.

## 📊 Vínculo con Auditoría y Métricas (AM)
Todo cambio de maestro emite `MA_MAESTRO_CREATE`, `MA_MAESTRO_UPDATE` o `MA_MAESTRO_DELETE`, porque impacta la lógica de múltiples módulos.
