# CF-configuracion-global (delta del change PL-liquidaciones-remuneraciones)

## ADDED Requirements

### Requirement: Parámetros Legales Chile para Remuneraciones (implementación)
La configuración global SHALL incluir los campos `ufMensual` (valor UF vigente del mes, positivo), `ingresoMinimoMensual` (positivo), `topeGratificacionLegal` (factor sobre el ingreso mínimo mensual, positivo; estándar 4.75) y `tasaSIS` (porcentaje 0–100) usados por PL. Los cuatro campos son opcionales en el schema para compatibilidad con stores previos, pero su ausencia bloquea la generación de liquidaciones ("CF no cargado"). Su edición queda restringida a administración y todo cambio SHALL auditarse como `CF_UPDATE_PARAM` con old/new.

#### Scenario: Edición desde Parámetros Legales
- **WHEN** la administración actualiza la UF o el tope de gratificación desde `/finanzas/remuneraciones`
- **THEN** `saveConfiguracion` persiste el valor y emite `CF_UPDATE_PARAM`

#### Scenario: Rango inválido rechazado
- **WHEN** se intenta guardar `tasaSIS` fuera de 0–100 o valores negativos
- **THEN** la validación Zod rechaza el guardado con mensaje claro
