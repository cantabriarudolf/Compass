# AD - Gestión Administrativa (Panel del Administrador)

Este módulo centraliza las herramientas de gestión directa del administrador, organizadas en "cajones" operativos para facilitar el control de la comunidad y los recursos humanos.

## 1. Cajón de Comunidad

Gestión de los actores principales del condominio y sus permisos de información.

### 1.1 Propietarios (Dueños Legales)
- **Perfil de Identidad:** Nombre, Apellido, RUT, Teléfono, Email y Fotografía.
- **Controles de Privacidad y Comunicación:**
    - **Botón "Notificar a Residentes":** Permite al propietario habilitar/deshabilitar manualmente si el residente de su unidad puede ver reportes de morosidad detallados o actas de asamblea (vinculado a la lógica de `MP` y `GD`).
    - **Botón "Gestión de Alertas Residentes":** Opción para desactivar o silenciar las notificaciones automáticas que le llegan al residente (ej: llegada de visitas, recepción de paquetería, confirmación de reservas) en casos de conflicto o término de contrato.

### 1.2 Residentes (Habitantes)
- **Perfil de Identidad:** Nombre, Apellido, RUT, Teléfono, Email y Fotografía.
- **Vinculación:** Asociación directa a la Unidad (Torre/Número) que habita actualmente (vinculado a `VU`).

### 1.3 Directiva (Comité de Administración)
- **Perfil de Identidad:** Nombre, Apellido, RUT, Teléfono, Email y Fotografía.
- **Atributos de Poder:**
    - **Cargo:** Definición del rol dentro del comité (Presidente, Tesorero, Secretario, Director).
    - **Firma Digitalizada:** Carga de imagen de la firma para la aprobación formal de actas en el módulo [Gestión de Directiva (GD)](<GD - Gestión de Directiva.md>).

## 2. Cajón de Recursos Humanos

Gestión integral del capital humano que presta servicios en el condominio.

### 2.1 Maestro de Personal
- **Acceso:** Centralización de las fichas de todos los trabajadores (Conserjes, Aseo, Seguridad, Mantención).
- **Detalle Técnico:** Los requerimientos contractuales, previsionales y operativos de este cajón se encuentran detallados en el módulo [PE - Personal y Servicios](<PE - Personal y Servicios.md>).

## 3. Integración con Auditoría y Métricas (AM)
- **Evento:** `AD_OWNER_CONFIG_CHANGE`, `AD_DIRECTIVA_SIGN_UPLOAD`.
- **Data Cuantificable:** Número de propietarios que activan/desactivan visibilidad de actas/morosidad a residentes; cantidad de firmas digitalizadas de directiva subidas.
- **Métrica:** Cantidad de propietarios que comparten información con sus residentes, rotación de cargos en la directiva.
