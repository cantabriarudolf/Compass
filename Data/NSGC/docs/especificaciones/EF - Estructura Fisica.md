# EF - Estructura Física (Edificios, Pisos y Unidades)

Este módulo centraliza la configuración de la infraestructura del condominio, manteniendo la jerarquía necesaria para la operación.

## 1. Jerarquía de Datos (Agnóstica Vertical/Horizontal)

Para que el sistema sea universal y soporte tanto edificios como condominios de casas, la estructura debe ser abstracta en la base de datos, pero permitir **"Etiquetas Personalizables"** en la interfaz de usuario.

### Nivel 1: Macro-Sector (Edificio / Torre / Manzana / Etapa / Calle)
- **Atributos:** ID, **Etiqueta Visual** (Ej: "Torre", "Manzana"), Nombre/Código (Ej: "A", "1", "Los Pinos"), Descripción.
- **Regla:** Es el contenedor raíz de toda la estructura.

### Nivel 2: Micro-Sector (Piso / Nivel / Pasaje / Bloque)
- **Atributos:** ID, Vínculo a Macro-Sector, **Etiqueta Visual** (Ej: "Piso", "Pasaje"), Número/Nombre (Ej: "1", "Norte").
- **Regla:** En condominios verticales (edificios) es obligatorio. En condominios horizontales (casas) **puede ser opcional** (ej: Una "Manzana" puede contener "Casas" directamente sin necesidad de un "Pasaje" intermedio).

### Nivel 3: Unidades (Departamentos / Casas / Locales)
- **Atributos:** 
    - **Etiqueta Visual:** (Ej: "Depto", "Casa", "Local").
    - Número de unidad (Ej: 101, 14-B).
    - Vínculo a Micro-Sector (o directo a Macro-Sector si aplica).
    - **Vínculo a [Tipo de Unidad](<TU - Tipos de Unidad.md>):** Determina el metraje y monto base por defecto.
    - Metraje y Coeficiente de Copropiedad (Prorrateo): Heredado del Tipo, pero editable por unidad.
    - **Rol de Avalúo (SII):** Identificador tributario de la propiedad.
    - **Servicios Básicos (Agua, Luz, Gas):**
        - Registro de Código de Cliente por cada servicio.
        - Registro de Número de Medidor por cada servicio.
    - **Estado de Ocupación / Disponibilidad:** Alineado al maestro `ESTADOS_OCUPACION` (data/maestros.ts): **Vacante, En Uso, En Arriendo, En Venta, En Mantención**.
    - **Flag Comercial:** Marca para tratamiento diferenciado de GC.
    - **Datos Inmobiliarios (Tabla Anexa Recomendada):** Para no sobrecargar el maestro base, los detalles para corretaje se manejarán en una tabla vinculada:
        - Valor Comercial (Venta).
        - Canon de Arriendo.
        - Condiciones (Meses de garantía, mascotas permitidas, etc.).
        - Características Físicas: Cantidad de dormitorios, baños, estacionamientos, año de construcción.
        - Ubicación: URL de Google Maps.
        - Galería: Subida de múltiples imágenes.
- **Regla:** La unidad es el nodo final donde se radican los cobros y los vínculos con personas.

## 2. Reglas de Integridad y Validación
- **Eliminación en Cascada Protegida:** No se puede eliminar un Macro-Sector si contiene unidades ocupadas o con deuda.
- **Unicidad:** La combinación de [Macro-Sector] + [Micro-Sector] + [Unidad] debe ser única en todo el sistema.
- **Jerarquía Flexible:** Toda unidad debe estar contenida en un Macro-Sector. El Micro-Sector es el único nivel que puede declararse como "No Aplica" en la configuración inicial del condominio.

## 3. Integración con Auditoría y Métricas (AM)

La modificación de la infraestructura física debe ser rastreable para evitar desajustes en cobros:
- **Evento:** `EF_CREATE_UNIT`, `EF_UPDATE_METRAJE`, `EF_DELETE_TORRE`.
- **Data Cuantificable:** Variación en el total de metros cuadrados del condominio, cantidad de unidades creadas.
- **Métrica:** Ratio de ocupación (Unidades ocupadas vs totales), crecimiento de la infraestructura, enrolamiento de servicios por unidad.
