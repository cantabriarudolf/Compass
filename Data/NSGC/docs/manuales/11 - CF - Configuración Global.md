# ⚙️ 11 - Configuración Global (CF)

Acá configurás los parámetros base que rigen todo GECOS: quién es la comunidad, cómo se calculan los gastos comunes, cómo se envían los correos y las reglas de notificación.

## 🚀 Funcionalidad Principal

Centralizar la identidad legal, la imagen corporativa y los parámetros operativos del condominio.

## 🛠️ Secciones

- **Identidad Legal**: Nombre de la comunidad, RUT, dirección, datos del administrador y logo. El logo y el nombre se muestran en el header y la barra lateral.
- **Parametrización del Gasto Común**: Elegís si el GC es fijo por tipo de unidad o variable por prorrateo, y definís el día de corte y el límite de meses para aviso de corte.
- **Correo SMTP**: Servidor, puerto, usuario, contraseña y seguridad para enviar notificaciones automáticas.
- **Reglas y Opt-in de Notificaciones**: Activá o desactivá los envíos automáticos de correo por módulo.
- **Parámetros Operativos y Seguridad**: Días mes comercial, días de vacaciones por mes, jornada semanal estándar y clave de eliminación maestra.

## 💡 Tips de Oro

- **Logo**: Subí una imagen PNG o JPG. El sistema la convierte a base64 para mostrarla en la interfaz. Si no hay logo, aparece el icono por defecto de GECOS.
- **Validaciones**: Los valores numéricos tienen rangos válidos (ej: día de corte 1-31). Si te pasás, el formulario te lo indica antes de guardar.
- **Auditoría**: Cada cambio en esta pantalla genera el evento `CF_UPDATE_PARAM` en **AM - Auditoría y Métricas**.

## 🔗 Dependencias

- La identidad visual se consume desde **UI - Interfaz Principal** y **UI - Navegación Lateral**.
- Los cálculos de GC usan estos parámetros en **FI - Finanzas y Morosidad**.
- Las notificaciones dependen de la configuración SMTP y de **CO - Comunicación Vecinos**.
