# 🏗️ 02 - Estructura Física (EF)

Acá es donde armái el "esqueleto" del condominio. Podís mapear desde una torre gigante hasta un pasaje con casas, dándole un orden lógico a todo el inventario.

## 🚀 Funcionalidad Principal
Permite construir la jerarquía física en tres niveles:
1.  **Macro-Sector**: (Ej: Torre A, Manzana 1). Es la agrupación más grande.
2.  **Micro-Sector**: (Ej: Piso 5, Nivel -1). Es opcional; si tenís casas, te lo podís saltar.
3.  **Unidad**: La propiedad final (Depto 502, Casa 14).

## 📝 Creación de Unidades
Al crear una unidad, el formulario hereda la selección actual de la página:
- Si elegiste un **Macro-Sector** y un **Sub-Sector** antes de apretar **Nueva Unidad**, ambos selectores se precargan.
- Si el Macro-Sector tiene **un solo Sub-Sector**, el formulario lo selecciona automáticamente.
- Si cambiás de Macro-Sector dentro del formulario, el Sub-Sector se limpia solo cuando no corresponde al nuevo sector; si el nuevo sector tiene un solo Sub-Sector, se selecciona solo.
- El botón **Registrar Unidad** se habilita una vez que ambos sectores y la categoría física estén seleccionados.

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

## ⚠️ Aviso de Duplicados (D5 — Plataforma P3)

Repetidos **permitidos** (D5): el sistema no bloquea, pero avisa.

- **Macro-sector**: al guardar con `nombre`+`etiqueta` ya existentes (case-insensitive, excluyendo propio en edición) la UI pide confirmación advisory: *"Ya existe un macro sector con ese nombre/etiqueta. ¿Deseas continuar? (D5: repetidos permitidos)"* (`k0mp4ss_fe/apps/web/app/inventario/estructura/page.tsx:93`).
- **Micro-sector**: al crear con `nombre`+`etiqueta` ya existentes **dentro del mismo `macroSectorId`** se pide el mismo confirm. Confirmar persiste, cancelar aborta. El store `saveMacroSector`/`saveMicroSector` siguen permitiendo repetidos si se llaman directo.

## 📊 Vínculo con Auditoría y Métricas (AM)
Toda acción administrativa realizada en este módulo (enrolamiento de medidores, creación de unidades, auditoría de superficie) debe ser contabilizada y visibilizada en el **Módulo AM**. Los indicadores de superficie total y enrolamiento de servicios alimentan el Dashboard de Gestión Operativa, transformando la ejecución técnica en valor cuantificable para la comunidad.

*Actualizado: 27/08/2026 — P3 D5 aviso duplicados EF por nombre/etiqueta (no bloqueante)*
