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
All changes to Configuración Global MUST be persisted server-side in the `configuracion_global` table via `PUT /api/configuracion` (upsert por `comunidadId`) and remain traceable. La ruta emite el evento `CF_UPDATE_PARAM` (categoría `CF`, old/new en la descripción) cuando el PUT cambia alguno de los parámetros legales de remuneraciones; el resto de las escrituras queda trazada en la tabla sin evento.

#### Scenario: Save Configuration
- **WHEN** the admin clicks "Guardar Cambios"
- **THEN** the configuration MUST be persisted via `PUT /api/configuracion` without `smtpPassword` or `claveEliminacionMaestro`
- **AND** the application header and Sidebar MUST reflect the new identity immediately

#### Scenario: Audit Event
- **WHEN** a configuration value changes
- **THEN** the system MUST emit a `CF_UPDATE_PARAM` event for Auditoría y Métricas (AM) without including secret values

### Requirement: Dependencias de Carga y Seed (ST) - CF Singleton Rank 0

Entidad `CompassData.configuracion` singleton `k0mp4ss_fe/apps/web/lib/store.ts:83`, seed `data/admin/configuracion.ts:49 configuracionDefault` (1 registro). `Rank 0` raíz sin `dependsOn` (paralelo a `MA`). La persistencia y validación server-side corre en `PUT /api/configuracion` (`app/api/configuracion/route.ts`), que aplica `ConfiguracionGlobalSchema` y SHALL validar rangos `diaCortePago 1-31`, `diasMesComercial 28-31`, `jornadaSemanalEstandar 35-48` `CF-configuracion-global:41,81`. `configuracion` es FK blanda para `FI.modoCalculoGC` (`fijo|variable`) y `PE.jornada/CF.claveEliminacionMaestro`.

#### Scenario: CF sin carga bloquea FI/PE
- **WHEN** `FI` intenta `emisión GC` con `configuracion.modoCalculoGC` undefined
- **THEN** validación `ST` reporta `CF no cargado` y `FI_SEED_VALIDATION_FAILED`.

#### Scenario: Validación rangos en save
- **WHEN** `PUT /api/configuracion` recibe `{diaCortePago:99}`
- **THEN** responde 400 con validación `rango 1-31`.

### Requirement: Eventos AM de Carga CF

Bulk/singleton `configuracion` SHALL emitir `CF_SEED_LOADED` y mutaciones `CF_UPDATE_PARAM` con old/new `CF-configuracion-global:100`.

#### Scenario: Bulk CF auditado
- **WHEN** se siembra `configuracion`
- **THEN** `AM` registra `CF_SEED_LOADED` con `valorCuantificable:1`.

### Requirement: Parámetros Legales Chile para Remuneraciones
La configuración global MUST incluir parámetros legales editables solo por administración y usados por PL: valor UF vigente del mes, tope de gratificación legal (factor sobre el ingreso mínimo mensual), tasa SIS y días de mes comercial. Todo cambio de estos parámetros MUST quedar auditado en AM.

#### Scenario: Edición Restringida y Auditada
- **WHEN** un administrador actualiza el valor de la UF o el tope de gratificación
- **THEN** el nuevo valor se persiste en CF y el cambio genera evento de auditoría AM
- **AND** los cálculos de liquidaciones posteriores usan el valor vigente a su periodo

#### Scenario: Acceso de Solo Lectura para Otros Roles
- **WHEN** un rol distinto de administración intenta editar los parámetros legales
- **THEN** el sistema rechaza la operación según RP

### Requirement: Parámetros Legales Chile para Remuneraciones (implementación)
La configuración global SHALL incluir los campos `ufMensual` (valor UF vigente del mes, positivo), `ingresoMinimoMensual` (positivo), `topeGratificacionLegal` (factor sobre el ingreso mínimo mensual, positivo; estándar 4.75) y `tasaSIS` (porcentaje 0–100) usados por PL. Los cuatro campos son opcionales en el schema para compatibilidad con stores previos, pero su ausencia bloquea la generación de liquidaciones ("CF no cargado"). Su edición queda restringida a administración y todo cambio SHALL auditarse como `CF_UPDATE_PARAM` con old/new, emitido por `PUT /api/configuracion`.

#### Scenario: Edición desde Parámetros Legales
- **WHEN** la administración actualiza la UF o el tope de gratificación desde `/finanzas/remuneraciones`
- **THEN** `PUT /api/configuracion` persiste el valor y emite `CF_UPDATE_PARAM` con el valor anterior y el nuevo

#### Scenario: Rango inválido rechazado
- **WHEN** se intenta guardar `tasaSIS` fuera de 0–100 o valores negativos
- **THEN** la validación Zod rechaza el guardado con mensaje claro

### Requirement: Columna RUT de la comunidad con nombre canónico
La columna Prisma SHALL llamarse `rutComunidad` (terminología RG §4), no
`rutCondominio` (legacy). La migración SHALL preservar los valores. El GET
SHALL exponer `rutComunidad` con valor, de modo que el input required del
form no quede vacío y el submit nativo no se bloquee. Los defaults de
creación del PUT SHALL ser válidos según schema (una fila creada por PUT
parcial mínimo puede reenviarse completa sin 400).

#### Scenario: Guardar nombre persiste y se refleja
- **WHEN** se edita el nombre en `/admin/configuracion` y se guarda
- **THEN** el PUT responde 200 y al re-navegar el input muestra el nombre nuevo.

#### Scenario: PUT de objeto completo estilo Prisma
- **WHEN** se envía el objeto completo del GET (con `rutComunidad` + nulls
  en opcionales)
- **THEN** el PUT responde 200 (test `api-configuracion.test.ts`).
