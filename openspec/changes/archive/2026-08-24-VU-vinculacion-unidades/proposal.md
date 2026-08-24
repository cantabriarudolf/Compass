## Why

El módulo de Identidad (Maestro de Personas) y el Inventario (Estructura Física) ya existen, pero están desconectados. Es imperativo establecer una relación legal y operativa robusta entre los habitantes/dueños y la infraestructura física para habilitar la automatización de cobros de gastos comunes, gestionar el control de acceso de manera efectiva y mantener un censo en vivo de la comunidad.

## What Changes

- Implementación del formulario dinámico (sub-maestro) de "Vinculación de Unidades" dentro de la pestaña correspondiente en la Ficha de Persona.
- Capacidad de asignar roles específicos por vínculo: Propietario, Arrendatario, Copropietario/Familiar u Ocupante.
- Soporte para "Vinculación Múltiple" (ej. una persona siendo dueña de un departamento y dos estacionamientos).
- Integración de los "Triggers Inmobiliarios" (Próxima Vacancia, En Venta) y "Privacidad Delegada" directamente en la configuración del vínculo creado.

## Capabilities

### New Capabilities
- `VU-vinculacion-unidades`: Flujo completo de creación, edición y término de vínculos entre una Persona y múltiples Unidades Físicas (Departamentos, Estacionamientos, etc.), definiendo el rol legal u operativo en cada uno, incluyendo permisos derivados (Propietario, Arrendatario, Copropietario/Familiar, Ocupante), privacidad financiera delegada y triggers inmobiliarios.

### Modified Capabilities

- Ninguna (se construirá la interfaz final para specs parcialmente definidos en `MP-maestro-personas` pero no se modifican requerimientos previos, solo se amplían a su propia entidad).

## Impact

- **UI**: La pestaña "Unidades Vinculadas" en `/comunidad/personas/[id]` pasará de ser de sólo lectura a un sub-maestro interactivo.
- **Data Layer**: Necesitará funciones robustas para enlazar `unidades` (de `estructura.ts`) con `personas` (de `personas.ts`).
- **Dependencias Lógicas**: Desbloquea completamente la viabilidad de implementar el Módulo de Finanzas (Cobranza de Gastos Comunes) y Operaciones (Control de Acceso).
