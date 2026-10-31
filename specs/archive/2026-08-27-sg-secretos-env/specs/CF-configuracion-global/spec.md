# Spec Delta: CF-configuracion-global — secretos fuera del schema cliente (C2-final)

## MODIFIED Requirements

### Requirement: Configuración SMTP
The system MUST store email server parameters for automated notifications. Los secretos `smtpPassword` SHALL NOT existir en el schema cliente; viven como variable de entorno servidor `SMTP_PASSWORD` (C2-final).

#### Scenario: SMTP Fields
- **WHEN** the admin configures SMTP
- **THEN** the following fields MUST be editable:
  - `smtpHost` (required)
  - `smtpPort` (required)
  - `smtpUser` (required)
  - `smtpSecurity`: `ssl`, `tls`, or `none`
  - `smtpFrom` (required)
  - `smtpFromName` (required)
  - `smtpBcc` (optional)
  - `smtpRecepcion` (optional)
- **AND** `smtpPassword` SHALL NOT exist in `ConfiguracionGlobalSchema` nor `data/admin/configuracion.ts` nor be persisted in `compass-store`
- **AND** the UI SHALL show "Gestionado por el servidor (variable de entorno SMTP_PASSWORD)" without an editable password input

### Requirement: Parámetros Operativos y Seguridad
The system MUST store operational constants and security-critical settings. La clave `claveEliminacionMaestro` SHALL NOT existir en el schema cliente; vive como variable de entorno `CLAVE_ELIMINACION_MAESTRO` (C2-final).

#### Scenario: Operational Parameters
- **WHEN** the admin configures operational parameters
- **THEN** they MUST set:
  - `diasMesComercial` (28-31)
  - `diasVacacionesMes` (decimal)
  - `jornadaSemanalEstandar` (35-48)
- **AND** `claveEliminacionMaestro` SHALL NOT exist in `ConfiguracionGlobalSchema` nor `data/admin/configuracion.ts` nor be persisted
- **AND** the UI SHALL show "Gestionado por el servidor (variable de entorno CLAVE_ELIMINACION_MAESTRO)" without an editable input

#### Scenario: Validation
- **WHEN** the admin saves operational parameters
- **THEN** values outside the valid ranges MUST be rejected
- **AND** the user MUST receive clear validation feedback
- **AND** the absence of `claveEliminacionMaestro` SHALL NOT cause a validation error

### Requirement: Persistencia y Auditoría
All changes to Configuración Global MUST be persisted in the global store and traceable.

#### Scenario: Save Configuration
- **WHEN** the admin clicks "Guardar Cambios"
- **THEN** the configuration MUST be saved via `saveConfiguracion` without `smtpPassword` or `claveEliminacionMaestro`
- **AND** the application header and Sidebar MUST reflect the new identity immediately

#### Scenario: Audit Event
- **WHEN** a configuration value changes
- **THEN** the system MUST emit a `CF_UPDATE_PARAM` event for Auditoría y Métricas (AM) without including secret values
