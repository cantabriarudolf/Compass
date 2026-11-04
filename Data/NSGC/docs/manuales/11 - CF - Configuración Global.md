# ⚙️ 11 - Configuración Global (CF)

Acá configurás los parámetros base que rigen todo GECOS: quién es la comunidad, cómo se calculan los gastos comunes, cómo se envían los correos y las reglas de notificación.

## 🚀 Funcionalidad Principal

Centralizar la identidad legal, la imagen corporativa y los parámetros operativos de la comunidad.

## 🛠️ Secciones

- **Identidad Legal**: Nombre de la comunidad, RUT, dirección, datos del administrador y logo. El logo y el nombre se muestran en el header y la barra lateral.
- **Parametrización del Gasto Común**: Elegís si el GC es fijo por tipo de unidad o variable por prorrateo, y definís el día de corte y el límite de meses para aviso de corte.
- **Reglamento del cobro (bloque nuevo)**: de acá sale con qué números se calcula el gasto común. Se declara una **versión** con el instrumento que la funda (reglamento de copropiedad o acta de asamblea, más su referencia), el **período desde el que rige** y los parámetros: forma de contribución, días de pago, % del fondo de reserva, tasa y tope de mora, cuotas y preaviso de corte, interruptor de IPC y si el recargo de reserva va **encima del presupuesto aprobado o dentro de él**. Las versiones no se editan ni se borran: se agrega una nueva, y lo ya emitido queda como estaba. La pantalla muestra qué versión rige hoy y si habilita la emisión; una comunidad que no declaró nada **no puede emitir** el gasto común.
- **Correo SMTP**: Servidor, puerto, usuario y seguridad para enviar notificaciones automáticas. **La contraseña (`SMTP_PASSWORD`) ya no se edita en el cliente**: es variable de entorno del servidor (C2-final, `lib/schemas.ts` sin `smtpPassword`, `.env.example` documenta `SMTP_PASSWORD`). En la UI ves "Gestionado por el servidor" sin input editable.
- **Reglas y Opt-in de Notificaciones**: Activá o desactivá los envíos automáticos de correo por módulo.
- **Parámetros Operativos y Seguridad**: Días mes comercial, días de vacaciones por mes y jornada semanal estándar. **La clave de eliminación maestra (`CLAVE_ELIMINACION_MAESTRO`) también vive solo en el servidor** (C2-final, sin `claveEliminacionMaestro` en el store). En la UI ves "Gestionado por el servidor" sin input editable.

## 🔐 Secretos por Entorno (C2-final — Plataforma P3)

Desde `STORE_VERSION` 26 los secretos **no existen** en `ConfiguracionGlobalSchema` (`k0mp4ss_fe/apps/web/lib/schemas.ts:1174`) ni en `data/admin/configuracion.ts` ni en `compass-store` (migrate v26 borra `smtpPassword`/`claveEliminacionMaestro` del persistido v25, patrón v8). El `partialize` persiste `configuracion` tal cual. El servidor los lee vía `process.env.SMTP_PASSWORD` / `CLAVE_ELIMINACION_MAESTRO` (ver `k0mp4ss_fe/apps/web/.env.example:14`). No versionar valores reales.

## 💡 Tips de Oro

- **Logo**: Subí una imagen PNG o JPG. El sistema la convierte a base64 para mostrarla en la interfaz. Si no hay logo, aparece el icono por defecto de GECOS.
- **Validaciones**: Los valores numéricos tienen rangos válidos (ej: día de corte 1-31, cuotas de corte y preaviso de 1 para arriba). Si te pasás, el formulario te lo indica antes de guardar. El bloque del reglamento valida con el mismo esquema que la API y no usa restricciones nativas del navegador: un valor suyo no puede frenar el guardado del resto de la configuración.
- **Día de corte vs días de pago**: el día de corte de acá ya solo se usa para las multas; el vencimiento del gasto común sale de los **días de pago** declarados en la versión del reglamento (emisión + esos días).
- **Auditoría**: Cada cambio en esta pantalla genera el evento `CF_UPDATE_PARAM` en **AM - Auditoría y Métricas** (sin incluir secretos).
- **Store v26**: si tenías un `compass-store` v25 con secretos, al recargar migra automáticamente y los limpia.

## 🔗 Dependencias

- La identidad visual se consume desde **UI - Interfaz Principal** y **UI - Navegación Lateral**.
- Los cálculos de GC usan estos parámetros en **FI - Finanzas y Morosidad**.
- Las notificaciones dependen de la configuración SMTP y de **CO - Comunicación Vecinos**.

*Actualizado: 02/11/2026 — cobro paramétrico: versión del reglamento del cobro declarada por la comunidad*
