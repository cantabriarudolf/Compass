# 📺 16 - CO - Visor de Mensajes

El canal visual de alta visibilidad proyectado en pantallas de conserjería, recepción o ascensores: carrusel público con rotación automática, avisos con tipología y caducidad, plantillas rápidas ante emergencias y difusión de actas de directiva.

## 🚀 Funcionalidad Principal

El panel (`/comunidad/visor`) administra lo que se proyecta; el visor público (`/visor-mensajes`, overlay fullscreen glassmorphism) rota infinitamente los avisos publicados respetando la duración individual de cada uno, con reloj/fecha en vivo, identidad de la comunidad y una sección transversal con las reservas RA confirmadas de los próximos 7 días. Los cambios del panel se reflejan en el visor sin recargar (store reactivo).

## 🛠️ Secciones

- **Avisos**: ciclo estricto Borrador (editable/eliminable) → Publicado (no eliminable) → Archivado (histórico auditable, inmutable). Tipología coloreada (Información/Azul, Éxito/Verde, Advertencia/Naranja, Peligro/Rojo), duración en segundos (≥3), caducidad automática `expiresAt`, tags y Vista Previa fiel al visor. Multimedia excluyente: imagen por URL remota (D1, jamás base64/Blob) XOR video YouTube (watch/Shorts/youtu.be), ambos con modo pantalla completa.
- **Plantillas**: mensajes rápidos NSGC sembrados (Hidropack, Portón, Corte programado, Piscina habilitada) — solo administración las define/desactiva; personal de servicio las **Activa ahora** y nace un aviso publicado al instante (aprobación implícita del maestro).
- **Actas GD**: lista de actas publicadas por quórum con estado de su referencia; el botón *Publicar en Visor* crea el aviso desde el acta y marca `avisoCVReferencia` con el id del aviso (idempotente).
- **Configuración**: check global "exigir visto bueno" (CF) para mensajes creados por terceros habilitados (flag `permiteCreacionManualCV` en MP); desactivarlo asume la responsabilidad operativa.

## 💡 Tips de Oro

- **Caducidad sin manos**: un aviso publicado con `expiresAt` vencida sale del carrusel solo (`caducarAvisosCV`, idempotente) con evento de expiración automática.
- **Publicado no se borra**: la única salida es Archivar; así el histórico queda para auditoría y métricas (`CV_DRAFT_CREATED/PUBLISHED/EDITED/ARCHIVED`).
- **VB por defecto**: si un tercero habilitado crea un mensaje, nace Borrador "espera VB" hasta que administración lo publique; con el check global apagado publica directo.
- **Actas sin doble aviso**: republicar un acta ya publicada falla citando el id del aviso existente — la referencia quedó materializada.
- **Proyección**: abre `/visor-mensajes` en el monitor y usa pantalla completa del navegador; el reloj y la cola se actualizan solos.

## 🔗 Dependencias

- Actas Publicadas de **GD** (`publicarActaEnCV` consume `avisoCVReferencia:"pendiente"`).
- Reservas confirmadas de **RA** (sección "Próximas reservas", 7 días).
- Flags de **MP** (habilitación creación manual) y check de **CF** (visto bueno).
- Media por referencia D1 (**ST**) y notificaciones `notify()`.
