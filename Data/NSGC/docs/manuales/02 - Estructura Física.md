# 🏗️ 02 - Estructura Física (EF)

Acá es donde armái el "esqueleto" del condominio. Podís mapear desde una torre gigante hasta un pasaje con casas, dándole un orden lógico a todo el inventario.

## 🚀 Funcionalidad Principal
Permite construir la jerarquía física en tres niveles:
1.  **Macro-Sector**: (Ej: Torre A, Manzana 1). Es la agrupación más grande.
2.  **Micro-Sector**: (Ej: Piso 5, Nivel -1). Es opcional; si tenís casas, te lo podís saltar.
3.  **Unidad**: La propiedad final (Depto 502, Casa 14).

## 📊 Ficha Técnica Premium
Cada unidad tiene una ficha ultra detallada que incluye:
- **Datos SII**: El Rol de Avalúo para temas de contribuciones.
- **Medidores**: Guardado de N° de Cliente y N° de Medidor para Agua, Luz y Gas. ¡Ideal para que no se te pierda ningún dato técnico!
- **Herencia**: El metraje se trae directo del "Tipo de Unidad" y no se puede editar aquí pa' que no queden inconsistencias.

## 🛠️ Navegación
Si el condominio tiene muchas torres, no te preocupís. El menú superior es navegable lateralmente para que podái saltar de una torre a otra sin que se te desarme la pantalla.

## 📊 Gráfico de Distribución por Estado
Arriba de la tabla de unidades se muestra un **gráfico de dona** que resume el estado de ocupación del alcance seleccionado (Vacante, En Uso, En Arriendo, En Venta, En Mantención).
- **Dinámico por selección**: se actualiza automáticamente al navegar entre edificios/torres (macro-sector) y pisos/sectores (micro-sector), o en Vista Global.
- **Interactivo**: al hacer clic en una sección del gráfico (o en su fila de la leyenda) se aplica el filtro rápido de ese estado en la tabla de unidades. El segmento seleccionado se resalta y el resto se atenúa; hacer clic de nuevo en el mismo segmento limpia el filtro.
- **Contenido**: el centro muestra el total de unidades del alcance; la leyenda acompaña cada estado con su conteo y porcentaje.
- **Colorimetría alineada**: los colores del gráfico usan el `hex` de los maestros `ESTADOS_OCUPACION` (gestionados en MA), manteniendo coherencia visual con las etiquetas de estado de la tabla. Un estado nuevo creado en MA obtiene su color automáticamente.
- **Categorías desde MA**: las opciones de categoría macro y micro (Torre, Piso, Nivel...) se leen del store y se configuran en el módulo Maestros (MA).

## 📊 Vínculo con Auditoría y Métricas (AM)
Toda acción administrativa realizada en este módulo (enrolamiento de medidores, creación de unidades, auditoría de superficie) debe ser contabilizada y visibilizada en el **Módulo AM**. Los indicadores de superficie total y enrolamiento de servicios alimentan el Dashboard de Gestión Operativa, transformando la ejecución técnica en valor cuantificable para la comunidad.
