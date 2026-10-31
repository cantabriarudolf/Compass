# RP-roles-permisos (delta del change RE-reporteria-dashboards)

## ADDED Requirements

### Requirement: Matriz de Permisos del Módulo RE
La matriz de permisos MUST definir el acceso a Reportería y Dashboards por rol:
- **Administrador Maestro / administración**: ver todas las vistas del Centro de Mando; crear, distribuir y eliminar reportes; configurar cualquier segmentación.
- **Directiva / Comité**: lectura del Centro de Mando (demográfico, operativo, gestiones y financiero); sin distribución.
- **Conserjería / Seguridad (personal)**: acceso al Reporte Diario operativo (PE); sin acceso al Centro de Mando financiero.
- **Propietario / Residente**: únicamente los reportes distribuidos hacia él vía bandeja simulada; sin acceso al generador.

Cualquier permiso no listado SHALL denegarse conforme a Menor Privilegio, registrando `RP_PERMISSION_DENIED`.

#### Scenario: Comité consulta sin distribuir
- **WHEN** un miembro del comité abre el Centro de Mando
- **THEN** visualiza las métricas pero las acciones de generar/distribuir reportes le resultan denegadas

#### Scenario: Residente recibe solo lo distribuido
- **WHEN** la administración distribuye un reporte segmentado que incluye al residente
- **THEN** este lo encuentra en su bandeja de notificaciones sin acceder al generador ni al historial global
