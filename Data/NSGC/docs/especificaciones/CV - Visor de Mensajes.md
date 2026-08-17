# CV - Visor de Mensajes (Carrusel Público)

> 🔌 **Datos:** este módulo persiste en la capa de datos (ST) — ver [ST - Capa de Datos Persistente](<ST - Capa de Datos Persistente.md>).

El objetivo de este módulo es proveer un canal de comunicación visual, dinámico y de alta visibilidad para los residentes y el personal, diseñado específicamente para ser proyectado en pantallas ubicadas en áreas comunes (como la recepción, conserjería o ascensores).

## 1. Gestor de Avisos (Panel de Administración)

El sistema actúa como el panel de control central para gestionar lo que se proyecta en las pantallas de la comunidad.

### Funcionalidades:
- **Gestión Integral (CRUD):** Creación, edición, archivado y eliminación de avisos.
- **Tipología y Urgencia:** Clasificación visual de avisos según su impacto:
    - *Información (Azul):* Comunicados generales (ej. "Reunión de Comité").
    - *Éxito (Verde):* Tareas completadas (ej. "Mantenimiento de Piscina Finalizado").
    - *Advertencia (Naranja):* Precauciones (ej. "Portón en mantención").
    - *Peligro/Urgente (Rojo):* Avisos críticos (ej. "Corte de Luz Programado").
- **Soporte Multimedia Excluyente:** Integración de contenido visual de apoyo:
    - *Imágenes:* Subida de imágenes locales (soporte base64/archivos pesados).
    - *Videos:* Enlaces a YouTube (incluyendo formato estándar y YouTube Shorts).
    - *Modo Pantalla Completa:* Opción de expandir la imagen o reproducir el video ocupando la totalidad del visor para mayor impacto visual.
- **Control de Tiempo y Vigencia:**
    - *Duración Dinámica:* Control en segundos de cuánto tiempo permanece el aviso en pantalla durante su ciclo en el carrusel.
    - *Caducidad Automática:* Fecha de expiración (`expires_at`) para que el aviso deje de mostrarse sin intervención manual una vez superada la fecha.
- **Etiquetado (Tags):** Sistema de tags personalizados para organización interna (ej. "mantención", "directiva").
- **Previsualización en Tiempo Real:** Botón de "Vista Previa" que permite al administrador ver exactamente cómo se renderizará el aviso en el visor público (incluyendo el layout, colores y multimedia) antes de confirmar su publicación.
- **Ciclo de Vida y Estados:**
    - **Borrador:** Estado inicial donde el aviso puede ser editado o eliminado definitivamente.
    - **Publicado:** Aviso visible en el carrusel. No permite eliminación directa; una vez cumplida su fecha de expiración o si el administrador decide finalizarlo anticipadamente, el aviso pasa a estado **Archivado**.
    - **Archivado:** Estado de cierre que retira el aviso de la vista pública pero conserva su data para auditoría e histórico.

## 2. Maestro de Mensajes Rápidos (Plantillas Operativas)

La interfaz permite la carga instantánea de situaciones recurrentes para actuar con rapidez ante emergencias o avisos rutinarios.

### Jerarquía y Flujo de Trabajo:
- **Creación de Plantillas (Exclusivo Administrador):** Solo el rol de Administración puede definir, redactar y configurar los parámetros (color, duración sugerida, multimedia) de las plantillas maestras.
- **Activación (Personal de Servicio):** Una vez aprobadas por la administración, el Personal de Servicio (ej. Conserjes) puede activar estas plantillas para responder a eventos del día a día (ej. "Portón fuera de servicio", "Ascensor en mantención") sin necesidad de redactar contenido nuevo.
- **Mensajes Manuales (Restricción de Acceso):**
    - Por defecto, la creación de mensajes manuales (texto libre) es una facultad de la **Administración**.
    - **Habilitación Especial:** El sistema permite otorgar el permiso de "Creación Manual" de forma individual a trabajadores, miembros de la directiva o residentes específicos mediante un check de autorización en su perfil de usuario.
    - **Control de Supervisión (Visto Bueno):** Por defecto, todo mensaje creado por un usuario con habilitación especial requiere el **Visto Bueno (VB)** de la Administración para ser publicado. Existe un check de configuración global (habilitado por defecto) que impone esta restricción; si el Administrador decide desactivarlo, asume la responsabilidad operativa de los contenidos publicados directamente por terceros.

### Categorías de Plantillas Rápidas:
- **Falla de Servicios:** "Problemas con sistema Hidropack - Técnicos en camino." (Alerta Roja).
- **Control de Acceso:** "Portón principal en mantención - Acceso restringido." (Alerta Naranja).
- **Cortes Programados:** "Corte de luz programado para este [FECHA] de [HORA] a [HORA]." (Alerta Roja).
- **Habilitación de Áreas:** "Mantenimiento de piscinas finalizado. Habilitada para uso." (Alerta Verde).

## 3. Visor Carrusel (Interfaz Pública)

Una interfaz independiente, reactiva y autónoma (`/visor-mensajes`) optimizada para monitores sin interacción humana.

### Flujo de Visualización:
- **Rotación Automática:** Ciclo infinito de avisos activos respetando los tiempos de duración individuales asignados.
- **Identidad Gráfica Institucional:** Integración del nombre y logo del sistema o comunidad, con un diseño moderno (fondos dinámicos, glassmorphism, animaciones suaves).
- **Integración Transversal (Módulo de Espacios Comunes):** Lectura automática e inserción en el carrusel de las reservas aprobadas para los próximos 7 días, mostrando qué espacio está reservado y en qué horario.
- **Widgets de Utilidad:** Visualización permanente de la hora y fecha en tiempo real.
- **Tolerancia a Fallos:** Capacidad de actualizar su estado y datos frescos automáticamente desde el servidor al iniciar la vista, garantizando la persistencia de la sesión mediante el token de autenticación global.
- **Sincronización en Tiempo Real (Auto-actualización):** Actualización automática de la información en pantalla. Si se añade un nuevo mensaje, se modifica una duración o se altera el estado de un aviso desde el panel de administración, los cambios se aplican en el visor sin necesidad de refrescar o recargar el sitio web manualmente.

## 4. Integración con Auditoría y Métricas (AM)

Cada operación sobre los mensajes está sujeta a auditoría básica y control de visibilidad.

- **Evento:** `CV_DRAFT_CREATED`, `CV_PUBLISHED`, `CV_EDITED`, `CV_ARCHIVED`.
- **Data Cuantificable:** Total de avisos publicados, número de avisos activos simultáneos, avisos expirados automáticamente, duración promedio de vigencia.
- **Métrica:** Tasa de avisos publicados vs archivados, tiempo promedio de permanencia de un aviso activo, cantidad de activaciones de plantillas por personal de servicio.
