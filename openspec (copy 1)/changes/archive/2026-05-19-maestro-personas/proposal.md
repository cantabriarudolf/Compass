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
- `identidad-base`: Gestión del CRUD central de personas anclado al RUT con datos de contacto universales.
- `extensiones-rol`: Lógica dinámica que expone u oculta campos de datos (laborales, unidades, gobernanza) dependiendo de los roles activos de la persona.
- `alertas-vulnerabilidad`: Sistema de etiquetado de condiciones especiales con impacto directo en la UX/UI para protocolos de emergencia.
- `privacidad-delegada`: Reglas de visibilidad de información financiera y administrativa controladas mediante el consentimiento del Propietario hacia el Residente.
- `trigger-inmobiliario`: Control de estado de ocupación de la propiedad que activa flujos de venta/arriendo externos.
- `auditoria-personas`: Trazabilidad estricta (`MP_CREATE`, `MP_VIEW_FICHA`) sobre quién accede o modifica datos sensibles.

### Modified Capabilities

## Impact

- **Frontend**: Rutas para el CRUD maestro y rediseño de las vistas de perfil para soportar "Extensiones" modulares.
- **Seguridad y Permisos (`RP`)**: El motor de permisos deberá leer las tablas de extensión vinculadas al RUT para decidir qué paneles mostrar.
- **Integraciones**: Comunicación con el módulo de Auditoría y Métricas (`AM`) para la recolección de logs, y con el Portal Inmobiliario (`PI`) para la actualización de estados de propiedades.
