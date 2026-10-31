## Context

Actualmente los datos del condominio están orientados exclusivamente a la infraestructura física (Unidades y Estacionamientos). El objetivo de este diseño es establecer la arquitectura subyacente para gestionar individuos bajo el concepto de "Identidad Única". Esto significa que los datos civiles de una persona existirán solo una vez en la base de datos, pero el sistema le habilitará módulos adicionales ("extensiones") dependiendo de si es residente, miembro de la directiva, o personal laboral.

## Goals / Non-Goals

**Goals:**
- Diseñar un modelo de datos donde la `Persona` actúe como nodo central (RUT como ancla).
- Estructurar el almacenamiento de datos específicos de rol (ej. Ficha Médica para Personal, Firma para Directiva) sin saturar el objeto base.
- Establecer las bases técnicas para el "Trigger Inmobiliario" y los bloqueos de privacidad (Consentimiento de Propietario).

**Non-Goals:**
- Desarrollo del módulo de remuneraciones (solo se dejará la estructura de datos lista).
- Integración real con portales inmobiliarios de terceros (solo se dejará el flag de estado para consumo de APIs).

## Decisions

- **Arquitectura Base + Extensiones:** Se utilizará un modelo compositivo. El objeto `Persona` contendrá `rut`, `nombre`, y `contacto`. Las lógicas de negocio vivirán en objetos/tablas separadas como `ExtensionLaboral`, `VinculoUnidad`, `ExtensionGobernanza` que harán referencia al RUT.
- **Frontend Modular (Atomic Design):** El perfil de la persona en la interfaz gráfica se construirá usando Tabs. El motor de renderizado verificará los roles activos de la persona y solo inyectará los componentes (ej. `<TabLaboral />`) si la persona posee la extensión correspondiente.
- **Gestión de Vulnerabilidades:** Las condiciones especiales (ej. Electrodependiente) se almacenarán en el nodo central de la `Persona` (no en un rol específico), garantizando que las alertas visuales (`⚠️`) aparezcan en cualquier contexto donde se liste a la persona.
- **Privacidad Delegada:** Se añadirá una propiedad `permiteVerFinanzas: boolean` en la relación `VinculoUnidad`, por defecto en `false`, para controlar la UI del Residente.

## Risks / Trade-offs

- **[Riesgo: Complejidad en Consultas a BD]** -> Reconstruir el perfil completo de un usuario con múltiples roles puede ser costoso. -> **Mitigación:** En la capa de Mocks de TypeScript, modelaremos las extensiones como objetos anidados dentro de un gran tipo `PersonaDetalle`. En una futura BDD, se resolverá mediante joins tipados (Prisma `include`).
- **[Riesgo: Filtración de Privacidad]** -> Mostrar datos equivocados a un residente. -> **Mitigación:** Todo endpoint/componente que muestre finanzas deberá exigir explícitamente la validación del flag de consentimiento en la capa de acceso a datos (no ocultarlo solo por CSS).
