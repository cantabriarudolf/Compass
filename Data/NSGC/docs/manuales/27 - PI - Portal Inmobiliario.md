# 🏠 27 - Portal Inmobiliario (PI)

Acá publicás las unidades de la comunidad que están en arriendo o venta, para que vecinos e interesados externos puedan encontrarlas y contactarse sin revelar datos personales.

## 🚀 Funcionalidad Principal

Vitrina digital que se alimenta sola: cuando un propietario marca su unidad "En Arriendo" o "En Venta" en **VU - Vinculación de Unidades**, la publicación se genera automáticamente; al cambiar el estado, se despublica.

## 🛠️ Secciones

- **Catálogo**: grilla de publicaciones activas con filtros por operación (venta/arriendo), rango de precio y dormitorios.
- **Ficha de la Publicación**: galería de imágenes (por URL/metadatos), precio en CLP o UF, mapa, descripción y condiciones contractuales.
- **"Me Interesa" (Leads)**: formulario de contacto que deja un lead en el sistema y notifica al propietario por correo simulado (`email_simulado`), sin mostrar teléfono ni email del dueño.
- **Visibilidad**: configurable por administración — solo residentes de la comunidad o acceso público.

## 💡 Tips de Oro

- **Trigger VU**: no crees publicaciones a mano; nacen del estado inmobiliario del vínculo del propietario.
- **Fotos sin peso muerto**: las imágenes van por referencia (URL + metadatos), nunca incrustadas (decisión D1).
- **Bandeja, no buzón real**: las notificaciones de leads son simuladas (decisión D3); revisa la bandeja interna del sistema.
- **Auditoría**: cada publicación/despublicación/lead genera eventos `PI_PROPERTY_LISTED`, `PI_PROPERTY_UNLISTED` y `PI_LEAD_CONTACT`.

## 🔗 Dependencias

- Consume estados inmobiliarios de **VU - Vinculación de Unidades** y datos de unidades de **EF - Estructura Física**.
- La bandeja de notificaciones es transversal (**ST - Capa de Datos Persistente**, decisión D3).
- El aviso de "En Venta" también alimenta reportes futuros de **RE - Reportería y Dashboards**.
