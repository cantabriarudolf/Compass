# 🏠 27 - Portal Inmobiliario (PI)

Acá publicás las unidades de la comunidad que están en arriendo o venta, para que vecinos e interesados externos puedan encontrarlas y contactarse sin revelar datos personales.

## 🚀 Funcionalidad Principal

Vitrina digital que se alimenta sola: cuando un propietario marca su unidad "En Arriendo" o "En Venta" en **VU - Vinculación de Unidades**, la publicación se genera automáticamente; al cambiar el estado, se despublica.

## 🛠️ Secciones

- **Catálogo**: grilla de publicaciones activas con filtros por operación (venta/arriendo), rango de precio y dormitorios.
- **Ficha de la Publicación**: galería de imágenes (por URL/metadatos), precio en CLP o UF, mapa, descripción y condiciones contractuales.
- **"Me Interesa" (Leads)**: formulario de contacto que deja un lead en el sistema y avisa al propietario en su bandeja, sin mostrar teléfono ni email del dueño. El correo del aviso va a la **casilla de recepción de la comunidad** (`ConfiguracionGlobal.smtpRecepcion`, CF) —el propietario no tiene dirección propia— y deja su constancia en `entregas_notificacion`; sin casilla queda `pendiente` con `MOTIVO_SIN_CASILLA_COMUNIDAD`, nunca `enviado` en falso.
- **Visibilidad**: configurable por administración — solo residentes de la comunidad o acceso público.

## 💡 Tips de Oro

- **Trigger VU**: no crees publicaciones a mano; nacen del estado inmobiliario del vínculo del propietario.
- **Fotos sin peso muerto**: las imágenes van por referencia (URL + metadatos), nunca incrustadas (decisión D1).
- **Bandeja primero, correo a la casilla de la comunidad**: el lead deja su aviso en la bandeja interna y su copia por correo va a la casilla de recepción de la comunidad, no al vecino (decisión D3 revisada en `saldar-f45-f48` S2); sin casilla el intento queda `pendiente` y la pantalla no lo finge.
- **Auditoría**: cada publicación/despublicación/lead genera eventos `PI_PROPERTY_LISTED`, `PI_PROPERTY_UNLISTED` y `PI_LEAD_CONTACT`.
- **Identidad contra el padrón completo**: el catálogo resuelve el rótulo de cada unidad y la ficha imprime el nombre del propietario leyendo el padrón entero de personas y unidades de la comunidad — alguien fuera de la primera página ya no aparece como id crudo.

## 🔗 Dependencias

- Consume estados inmobiliarios de **VU - Vinculación de Unidades** y datos de unidades de **EF - Estructura Física**.
- La bandeja de notificaciones es transversal (**ST - Capa de Datos Persistente**, decisión D3) y la entrega del aviso va por el puente único con su constancia en `entregas_notificacion`; la dirección de la copia la resuelve la casilla de recepción de **CF**.
- El aviso de "En Venta" también alimenta reportes futuros de **RE - Reportería y Dashboards**.
