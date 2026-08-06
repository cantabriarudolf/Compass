## ADDED Requirements

### Requirement: Habilitación dinámica de extensiones
El sistema SHALL mostrar u ocultar paneles de información específica (ej. Datos Laborales, Gobernanza) en la ficha de la persona basándose en los roles vinculados a su identidad.

#### Scenario: Visualización de empleado
- **WHEN** el administrador abre la ficha de una persona con el rol `Personal`
- **THEN** se renderiza la pestaña de "Datos Laborales" (AFP, Previsión)

#### Scenario: Visualización de copropietario puro
- **WHEN** el administrador abre la ficha de una persona que solo tiene el rol `Propietario`
- **THEN** la pestaña de "Datos Laborales" no es visible
