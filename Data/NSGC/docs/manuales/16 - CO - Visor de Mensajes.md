# 📺 16 - CO - Visor de Mensajes

El canal visual de alta visibilidad proyectado en pantallas de conserjería, recepción o ascensores: carrusel público con rotación automática, avisos con tipología y caducidad, plantillas rápidas ante emergencias y difusión de actas de directiva.

## 🚀 Funcionalidad Principal

El panel (`/comunidad/visor`) administra lo que se proyecta; el visor público (`/visor-mensajes`, overlay fullscreen glassmorphism) rota infinitamente los avisos publicados respetando la duración individual de cada uno, con reloj/fecha en vivo, identidad de la comunidad y una sección transversal con las reservas RA confirmadas de los próximos 7 días. Los avisos se leen de la API (hook `useAvisosCV`) y la caducidad de los vencidos es una acción de API que el visor ejecuta solo.

## 🛠️ Secciones

- **Avisos**: ciclo estricto Borrador (editable/eliminable) → Publicado (no eliminable) → Archivado (histórico auditable, inmutable). Tipología coloreada (Información/Azul, Éxito/Verde, Advertencia/Naranja, Peligro/Rojo), duración en segundos (≥3), caducidad automática `expiresAt`, tags y Vista Previa fiel al visor. Multimedia excluyente: imagen por URL remota (D1, jamás base64/Blob) XOR video YouTube (watch/Shorts/youtu.be), ambos con modo pantalla completa.
- **Plantillas**: mensajes rápidos NSGC sembrados (Hidropack, Portón, Corte programado, Piscina habilitada) — solo administración las define/desactiva; personal de servicio las **Activa ahora** y nace un aviso publicado al instante (aprobación implícita del maestro).
- **Actas GD**: lista de actas publicadas por quórum y difusión al visor **POR REFERENCIA** (SERIE-FASE2 §V6): el visor guarda `actaId` + visibilidad y **resuelve el contenido al leer** desde el libro de actas — nunca copia minuta, cuerpo ni adjuntos. El botón *Publicar en Visor* publica el acta (solo si está Publicada en GD; un borrador o una desestimada responde 409 y un acta de otra comunidad 404), es idempotente y audita `CV_ACTA_PUBLICADA`; *Despublicar* revierte la visibilidad y audita `CV_ACTA_DESPUBLICADA` con quién y cuándo. La tarjeta muestra fecha, hora, lugar, nº de temas y asistentes con el **documento enmascarado**, y lleva el texto obligatorio *"Versión informativa — el documento oficial es el libro de actas"* — nunca morosidad ni sanciones individualizadas (Ley 19.628 vigente; 21.719 diferida).
- **Acceso por rol (permiso `cv`)**: el visor es de los 5 roles — administrador, comité, residente, conserjería y mantención lo miran. Publicar y editar avisos es tarea del **comité** y **administración**; residente, conserjería y mantención entran solo a ver. Un aviso publicado con `expiresAt` vencida se archiva vía API (`PUT /api/cv/avisos/[id]`), nunca contra el almacenamiento local del navegador.
- **Notificaciones filtradas**: la bandeja entrega a cada rol solo lo suyo, decidido en el servidor — administrador y comité ven la comunidad completa; conserjería, residente y mantención solo lo dirigido a su persona o a su rol (las dirigidas a otro vecino no se listan, y pedirla por id responde "no encontrada"). El destinatario marca leída SU notificación (`notificaciones:propias`); nadie puede firmar la lectura de otro. Al marcarla queda registrada la **fecha de la primera lectura** (`fechaLectura`); volver a marcarla no mueve esa fecha — el dato es auditable. Es la base de la métrica honesta **enviados / leídos** (no existe "tasa de apertura": SMTP no informa aperturas y el píxel de tracking se descartó por Ley 19.628/21.719).
- **Configuración**: check global "exigir visto bueno" (CF) para mensajes creados por terceros habilitados (flag `permiteCreacionManualCV` en MP); desactivarlo asume la responsabilidad operativa.

## 💡 Tips de Oro

- **Caducidad sin manos**: un aviso publicado con `expiresAt` vencida sale del carrusel solo: el visor lo archiva por la API (`PUT /api/cv/avisos/[id]`) — una pasada al montar y luego cada 30 s — con evento de expiración automática.
- **Publicado no se borra**: la única salida es Archivar; así el histórico queda para auditoría y métricas (`CV_DRAFT_CREATED/PUBLISHED/EDITED/ARCHIVED`).
- **VB por defecto**: si un tercero habilitado crea un mensaje, nace Borrador "espera VB" hasta que administración lo publique; con el check global apagado publica directo.
- **Actas sin doble copia**: republicar un acta ya publicada es idempotente (no duplica fila ni evento) y el contenido se lee siempre del libro GD — si el acta se desestima en GD, deja de mostrarse en el visor por referencia vieja.
- **Despublicar es reversible y auditado**: despublicar no borra nada del acta; se puede volver a publicar y esa transición vuelve a auditarse.
- **Proyección**: abre `/visor-mensajes` en el monitor y usa pantalla completa del navegador; el reloj y la cola se actualizan solos.

## 🔗 Dependencias

- Actas Publicadas de **GD** (`POST|GET /api/cv/actas` y `POST /api/cv/actas/[actaId]/despublicar` leen y referencian `actas_gd`; el residente solo ve si el control `residenteVeActas` de AD está **vigente**).
- Reservas confirmadas de **RA** (sección "Próximas reservas", 7 días).
- Flags de **MP** (habilitación creación manual) y check de **CF** (visto bueno).
- Media por referencia D1 (**ST**) y notificaciones `notify()`.
