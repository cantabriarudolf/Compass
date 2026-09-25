# PI - Portal Inmobiliario

> 🔌 **Datos:** este módulo persiste en la base de datos vía API REST; ver endpoints `/api/pi`. La fuente de verdad es Prisma/Servidor.

Este módulo permite habilitar una vitrina digital dentro del sistema para promover la venta o arriendo de unidades del condominio de forma segura y centralizada.

## 1. Funcionamiento y Exposición

Si un **Propietario** en el [Maestro de Personas (MP)](<MP - Maestro de Personas.md>#32-estado-de-la-propiedad-trigger-inmobiliario) cambia el selector de estado de su unidad a **"En Arriendo"** o **"En Venta"**, los datos de la unidad se publican automáticamente en esta vitrina.

### Funcionalidades de la Vitrina:
- **Catálogo Visual:** Listado tipo "grilla" o "tarjetas" mostrando una foto principal, el precio, tipo de operación y características básicas (dormitorios/baños).
    - **Etiquetas de Estado:** Las propiedades pueden mostrar etiquetas distintivas como *"Disponibilidad Inmediata"* o *"Próximamente Disponible"* según el estado definido por el propietario en `MP`.
- **Ficha Detallada:** Al hacer clic, se muestra la galería de imágenes completa, la URL del mapa interactivo, las condiciones contractuales y la descripción.
- **Filtros de Búsqueda:** Poder filtrar por (Venta/Arriendo), rango de precio y cantidad de dormitorios.

## 2. Roles y Privacidad

- **Visibilidad:** Este portal puede ser configurado para que lo vean solo los residentes actuales (para promover a referidos) o habilitar una URL pública externa.
- **Contacto Seguro:** Un botón de "Me Interesa" que envía un correo o notificación al Propietario o Corredor a cargo, sin revelar datos personales de inmediato en la web.

## 3. Integración con Auditoría y Métricas (AM)

Métricas para evaluar el movimiento inmobiliario del edificio:
- **Evento:** `PI_PROPERTY_LISTED`, `PI_PROPERTY_UNLISTED`, `PI_LEAD_CONTACT`.
- **Data Cuantificable:** Días que una propiedad permanece publicada antes de cambiar su estado.
- **Métrica:** Tiempo promedio de vacancia (días que tarda en arrendarse o venderse), cantidad de consultas o "leads" generados por la plataforma.
