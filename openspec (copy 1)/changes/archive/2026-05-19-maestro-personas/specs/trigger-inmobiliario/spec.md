## ADDED Requirements

### Requirement: Cambio de estado habitacional
El sistema SHALL permitir al propietario definir la situación de ocupación de su unidad (Habitada, En Arriendo, En Venta) para nutrir al Portal Inmobiliario.

#### Scenario: Marcado de próxima vacancia
- **WHEN** el propietario marca su unidad con el estado "Disponibilidad Próxima"
- **THEN** el sistema registra el estado y lo disponibiliza para que el Portal Inmobiliario lo liste como "Próximamente Disponible"
