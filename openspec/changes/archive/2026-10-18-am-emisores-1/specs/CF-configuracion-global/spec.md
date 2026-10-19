## MODIFIED Requirements

### Requirement: Persistencia y Auditoría
All changes to Configuración Global MUST be persisted server-side in the `configuracion_global` table via `PUT /api/configuracion` (upsert por `comunidadId`) and remain traceable. La ruta emite el evento `CF_UPDATE_PARAM` (categoría `CF`, old/new en la descripción) cuando el PUT cambia alguno de los parámetros legales de remuneraciones; el resto de las escrituras queda trazada en la tabla sin evento.

#### Scenario: Save Configuration
- **WHEN** the admin clicks "Guardar Cambios"
- **THEN** the configuration MUST be persisted via `PUT /api/configuracion` without `smtpPassword` or `claveEliminacionMaestro`
- **AND** the application header and Sidebar MUST reflect the new identity immediately

#### Scenario: Audit Event
- **WHEN** a configuration value changes
- **THEN** the system MUST emit a `CF_UPDATE_PARAM` event for Auditoría y Métricas (AM) without including secret values

### Requirement: Parámetros Legales Chile para Remuneraciones (implementación)
La configuración global SHALL incluir los campos `ufMensual` (valor UF vigente del mes, positivo), `ingresoMinimoMensual` (positivo), `topeGratificacionLegal` (factor sobre el ingreso mínimo mensual, positivo; estándar 4.75) y `tasaSIS` (porcentaje 0–100) usados por PL. Los cuatro campos son opcionales en el schema para compatibilidad con stores previos, pero su ausencia bloquea la generación de liquidaciones ("CF no cargado"). Su edición queda restringida a administración y todo cambio SHALL auditarse como `CF_UPDATE_PARAM` con old/new, emitido por `PUT /api/configuracion`.

#### Scenario: Edición desde Parámetros Legales
- **WHEN** la administración actualiza la UF o el tope de gratificación desde `/finanzas/remuneraciones`
- **THEN** `PUT /api/configuracion` persiste el valor y emite `CF_UPDATE_PARAM` con el valor anterior y el nuevo

#### Scenario: Rango inválido rechazado
- **WHEN** se intenta guardar `tasaSIS` fuera de 0–100 o valores negativos
- **THEN** la validación Zod rechaza el guardado con mensaje claro
