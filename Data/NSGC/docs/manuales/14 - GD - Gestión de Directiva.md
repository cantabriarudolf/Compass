# 📜 14 - Gestión de Directiva (GD)

La memoria formal de la comunidad: registro de reuniones de directiva con asistencia, redacción de actas, aprobación con firmas y publicación controlada.

## 🚀 Funcionalidad Principal

Llevar el ciclo completo del acta: se crea como borrador, los miembros de la directiva vigente la aprueban hasta quórum 100%, y al completarse se publica notificando formalmente a todos los propietarios.

## 🛠️ Secciones

- **Reuniones y Actas**: fecha, hora, lugar, tabla de temas y minuta de cada sesión.
- **Asistencia**: presentes y ausentes (miembros con cargo de directiva) más invitados puntuales.
- **Flujo de Aprobación**: monitor de firmas pendientes; el acta pasa de "Borrador" a "Publicada" solo cuando aprueba el 100% de la directiva vigente.
- **Adjuntos**: soporte documental por referencia (acta escaneada, imágenes) sin incrustar archivos (decisión D1).
- **Privacidad**: actas visibles para propietarios y administración; los residentes acceden solo si el dueño activó `residenteVeActas` en **AD - Gestión Administrativa**.

## 💡 Tips de Oro

- **Quórum 100%**: una sola firma faltante mantiene el acta en borrador; usa el monitor para recordar quién falta.
- **Aviso al Visor materializado**: la publicación nace con `avisoCVReferencia="pendiente"`; cuando el **CV - Visor de Mensajes** difunde el acta, la referencia se marca con el id del aviso creado (sin republicaciones duplicadas). La notificación simulada a propietarios es inmediata (D3).
- **PDF futuro**: la generación del PDF del acta quedó reservada para **CT - Certificados** (pdfmake, decisión D2); hoy el contenido vive en el sistema.
- **Auditoría**: creación, asistencia y aprobación generan eventos `GD_ACTA_CREATED`, `GD_ASISTENCIA_REG` y `GD_ACTA_APPROVED`.

## 🔗 Dependencias

- Usa las firmas de `datosGobernanza` registradas en **AD - Gestión Administrativa**.
- Respeta los controles de visibilidad de actas (`controlesPropiedades`) de AD.
- Notifica vía la bandeja simulada transversal (**ST - Capa de Datos Persistente**, D3).
