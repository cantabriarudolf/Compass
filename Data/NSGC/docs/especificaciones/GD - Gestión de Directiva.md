# GD - Gestión de Directiva y Actas

Este módulo provee las herramientas necesarias para la gobernanza del condominio, facilitando la toma de decisiones, el registro legal de asambleas y la comunicación formal entre el Comité y los Propietarios.

## 1. Gestión de Reuniones y Actas

Permite al administrador o secretario del comité organizar y documentar las sesiones de trabajo.

### Registro de Reunión:
- **Datos Básicos:** Fecha, hora, lugar y tabla de temas a tratar.
- **Control de Asistencia:**
    - Marcación de **Presentes** y **Ausentes** de los miembros de la directiva.
    - Registro de invitados especiales (ej: asesores legales, proveedores).
- **Redacción de Minuta:** Campo de texto enriquecido para documentar acuerdos, discusiones y tareas asignadas.
- **Soporte Documental:** Opción para subir el acta escaneada (PDF) o imágenes de registros físicos.

## 2. Flujo de Aprobación de Actas

Para garantizar la validez de lo redactado, el sistema impone un flujo de revisión.

- **Estado de Aprobación:** El acta permanece en estado "Borrador de Directiva" hasta que los miembros la validen.
- **Botonera de Aprobación:** Cada miembro de la directiva tiene un botón para "Aprobar Acta".
- **Monitor de Firmas Pendientes:** Vista que indica claramente quiénes de la directiva aún no han aprobado el documento.
- **Publicación Automática:** Una vez que el acta cuenta con la aprobación del 100% (o quorum definido) de la directiva:
    - Se publica automáticamente en la sección de avisos del [Visor de Mensajes (CV)](<CV - Visor de Mensajes.md>).
    - Se envía una notificación por correo electrónico a todos los **Propietarios** con el acta adjunta o link de descarga.

## 3. Privacidad y Roles (Propietario vs Residente)

El sistema hace una distinción estricta de privilegios basada en la relación legal con la propiedad.

- **Visibilidad Restringida:** Por defecto, la información de Actas de Asamblea y Reuniones de Directiva es **invisible para los Residentes (Arrendatarios)**. Solo los Propietarios tienen acceso a este repositorio documental.
- **Check de Autorización (Dueño):** El Propietario tiene un check en su panel: *"Permitir que mis residentes vean las actas y reportes"*. Al quitar este check (que está bloqueado por defecto), el propietario acepta compartir esta información con sus arrendatarios.

## 4. Integración con Auditoría y Métricas (AM)
- **Evento:** `GD_ACTA_CREATED`, `GD_ACTA_APPROVED`, `GD_ASISTENCIA_REG`.
- **Data Cuantificable:** Número de actas aprobadas, días promedio de aprobación, porcentaje de asistencia a reuniones de directiva.
- **Métrica:** Tiempo promedio de aprobación de actas, tasa de cumplimiento de quórum de directiva, cantidad de actas publicadas en el visor.
