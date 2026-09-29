## MODIFIED Requirements

### Requirement: Specs de flujo independientes del QA-Lab
Los specs `e2e/flujo/poblamiento` (MP/EF) y `e2e/flujo/personas` SHALL crear
sus propios datos TEST vía API BD con cleanup, sin depender del QA-Lab
"Poblar todo de una vez" (que escribe al store legacy mientras las páginas
migradas leen BD — causa estructural documentada para P4). Nombres/emails/
RUTs únicos por corrida (timestamp + DV válido) para que las reejecuciones
no colisionen.

#### Scenario: Persona y unidad propias visibles en su módulo
- **WHEN** se POSTea una persona/unidad TEST vía API y se visita su página
- **THEN** aparece en la grilla/tabla y el cleanup la elimina (sin residuos).

#### Scenario: Directorio crea desde la UI con email único
- **WHEN** admin crea una identidad desde "Crear Nueva Persona"
- **THEN** aparece en la grilla (RUT formateado con puntos por el formulario)
  y el cleanup vía API la elimina.
