# CF-configuracion-global Specification

## Purpose
Centralizar los parámetros base que rigen el comportamiento de GECOS: identidad legal de la comunidad, imagen corporativa, cálculo de gastos comunes, servidor de correo (SMTP), reglas de notificación y parámetros operativos/seguridad. Fuente de verdad: `Data/NSGC/docs/especificaciones/CF - Configuracion Global.md`.

## Requirements

### Requirement: Identidad y Representación Legal
The system MUST store and display the community's legal identity and visual branding.

#### Scenario: Identity Fields
- **WHEN** the admin edits Configuración Global
- **THEN** the following fields MUST be editable:
  - `nombreComunidad` (required)
  - `rutCondominio` (required)
  - `direccionOficial` (required)
  - `administradorResponsable` (required)
  - `rutAdministrador` (required)
  - `telefonoAdmin` (required)

#### Scenario: Logo Upload
- **WHEN** the admin uploads an image in the "Identidad Legal" section
- **THEN** the image MUST be converted to a base64 data URL
- **AND** stored in `logoUrl` of `ConfiguracionGlobal`
- **AND** displayed in the application header and Sidebar header.

#### Scenario: Default Branding
- **WHEN** no `logoUrl` is configured
- **THEN** the default GECOS icon MUST be shown
- **AND** the header title MUST fall back to "GECOS".

### Requirement: Parametrización del Gasto Común
The system MUST allow the admin to define how common expenses are calculated and how morosity is handled.

#### Scenario: Calculation Mode
- **WHEN** the admin configures the GC mode
- **THEN** they MUST choose between:
  - `fijo`: fixed amount per unit type (inherited from TU)
  - `variable`: prorated by copropietary coefficient

#### Scenario: Morosity Parameters
- **WHEN** the admin configures morosity rules
- **THEN** they MUST set:
  - `diaCortePago` (1-31)
  - `limiteMesesAvisoCorte` (positive integer)

### Requirement: Configuración SMTP
The system MUST store email server parameters for automated notifications.

#### Scenario: SMTP Fields
- **WHEN** the admin configures SMTP
- **THEN** the following fields MUST be editable:
  - `smtpHost` (required)
  - `smtpPort` (required)
  - `smtpUser` (required)
  - `smtpPassword` (required, masked)
  - `smtpSecurity`: `ssl`, `tls`, or `none`
  - `smtpFrom` (required)
  - `smtpFromName` (required)
  - `smtpBcc` (optional)
  - `smtpRecepcion` (optional)

### Requirement: Reglas y Opt-in de Notificaciones
The system MUST allow enabling/disabling automatic email notifications per module.

#### Scenario: Notification Toggles
- **WHEN** the admin edits notification rules
- **THEN** they MUST be able to toggle:
  - `notificarEmisionGC`
  - `notificarRegistroVisitas`
  - `notificarEncomiendas`
  - `notificarReservas`
  - `notificarAvisosSistema`
  - `notificarSugerenciasReclamos`

### Requirement: Parámetros Operativos y Seguridad
The system MUST store operational constants and security-critical settings.

#### Scenario: Operational Parameters
- **WHEN** the admin configures operational parameters
- **THEN** they MUST set:
  - `diasMesComercial` (28-31)
  - `diasVacacionesMes` (decimal)
  - `jornadaSemanalEstandar` (35-48)
  - `claveEliminacionMaestro` (required, masked)

#### Scenario: Validation
- **WHEN** the admin saves operational parameters
- **THEN** values outside the valid ranges MUST be rejected
- **AND** the user MUST receive clear validation feedback.

### Requirement: Persistencia y Auditoría
All changes to Configuración Global MUST be persisted in the global store and traceable.

#### Scenario: Save Configuration
- **WHEN** the admin clicks "Guardar Cambios"
- **THEN** the configuration MUST be saved via `saveConfiguracion`
- **AND** the application header and Sidebar MUST reflect the new identity immediately.

#### Scenario: Audit Event
- **WHEN** a configuration value changes
- **THEN** the system MUST emit a `CF_UPDATE_PARAM` event for Auditoría y Métricas (AM).
