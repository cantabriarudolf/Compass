## ADDED Requirements

### Requirement: Control de visibilidad financiera por el propietario
El sistema SHALL incluir un control de consentimiento que permita al `Propietario` decidir si el `Residente` actual tiene permiso para visualizar actas y reportes de gastos comunes.

#### Scenario: Ocultamiento por defecto
- **WHEN** un residente (sin rol de propietario) intenta acceder al reporte financiero detallado y el consentimiento está en `false`
- **THEN** el sistema bloquea el acceso y muestra un mensaje de restricción

#### Scenario: Acceso otorgado
- **WHEN** el propietario activa la opción "Permitir acceso a actas y reportes financieros al residente"
- **THEN** el residente puede visualizar dichos reportes
