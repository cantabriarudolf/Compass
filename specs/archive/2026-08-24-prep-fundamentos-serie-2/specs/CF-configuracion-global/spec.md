## ADDED Requirements

### Requirement: Parámetros Legales Chile para Remuneraciones
La configuración global MUST incluir parámetros legales editables solo por administración y usados por PL: valor UF vigente del mes, tope de gratificación legal (factor sobre el ingreso mínimo mensual), tasa SIS y días de mes comercial. Todo cambio de estos parámetros MUST quedar auditado en AM.

#### Scenario: Edición Restringida y Auditada
- **WHEN** un administrador actualiza el valor de la UF o el tope de gratificación
- **THEN** el nuevo valor se persiste en CF y el cambio genera evento de auditoría AM
- **AND** los cálculos de liquidaciones posteriores usan el valor vigente a su periodo

#### Scenario: Acceso de Solo Lectura para Otros Roles
- **WHEN** un rol distinto de administración intenta editar los parámetros legales
- **THEN** el sistema rechaza la operación según RP
