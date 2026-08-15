## Why

El sistema requiere centralizar la información de todas las personas naturales vinculadas al condominio para evitar la duplicidad de datos y garantizar una **Identidad Única** anclada al RUT. Esto resuelve el problema de tener a una misma persona registrada múltiples veces bajo distintos roles, permitiendo gestionar de forma segura sus datos personales, preferencias de privacidad, vulnerabilidades en emergencias y habilitando "extensiones de datos" dinámicas según el rol que desempeñen (Propietario, Residente, Personal, etc.).

## What Changes

- Implementación del modelo de Identidad Única base (RUT, Nombre, Contacto, Fotografía).
- Creación de un sistema de "Tablas de Extensión" que se activan según los roles asignados a la persona (Datos Laborales, Gobernanza, Vinculación de Unidades, Empresa Externa).
- Implementación del Maestro de Condiciones Especiales (Vulnerabilidad) con alertas visuales (⚠️, ♿) en grillas y fichas de detalle.
- Controles de privacidad granulares donde el Propietario debe dar consentimiento explícito para que el Residente vea actas o reportes financieros.
- Implementación de un "Trigger Inmobiliario" (selector de disponibilidad de unidad) que alimenta al Portal Inmobiliario (PI).
- Integración de logs de auditoría obligatorios para visualizar o modificar fichas personales, cumpliendo con la normativa de protección de datos.

## Capabilities

### New Capabilities
- `MP-maestro-personas`: Gestión central de personas anclada al RUT, incluyendo el CRUD de identidad única, extensiones dinámicas por rol, condiciones especiales (vulnerabilidad), controles de privacidad delegada, trigger inmobiliario y auditoría de accesos.

### Modified Capabilities

## Impact

- **Frontend**: Rutas para el CRUD maestro y rediseño de las vistas de perfil para soportar "Extensiones" modulares.
- **Seguridad y Permisos (`RP`)**: El motor de permisos deberá leer las tablas de extensión vinculadas al RUT para decidir qué paneles mostrar.
- **Integraciones**: Comunicación con el módulo de Auditoría y Métricas (`AM`) para la recolección de logs, y con el Portal Inmobiliario (`PI`) para la actualización de estados de propiedades.
