## ADDED Requirements

### Requirement: Poblado idempotente

El laboratorio QA SHALL permitir que "Poblar todo de una vez" sea idempotente desde la UI: cuando existen datos `TEST-*` y el usuario confirma la acción, el sistema SHALL ejecutar `limpiar()` seguido del poblado completo sin intervención adicional, terminando en "Carga completa OK" con `22/22` fases en estado `🟢 Listo`; cuando cancela, SHALL no mutar ningún dato ni reporte.

#### Scenario: Confirmar limpiar y poblar con datos existentes
- **WHEN** existen datos `TEST-*` en el store y el usuario pulsa "Poblar todo de una vez" y luego "Limpiar y poblar" en el dialog de confirmación
- **THEN** el sistema ejecuta `limpiar()` (visible "TEST-* limpio correctamente") y luego `runFase("todo")`, finalizando con mensaje "Carga completa OK" y `22` tarjetas `[id^="mod-"]` en `🟢 Listo` con `0` en `🔴 Con error`

#### Scenario: Cancelar no muta nada
- **WHEN** existen datos `TEST-*` y el usuario pulsa "Poblar todo de una vez" y luego "Cancelar" en el dialog
- **THEN** el sistema no ejecuta `limpiar()` ni `runFase`, el dialog se cierra y las `22` tarjetas permanecen en `🟢 Listo` sin errores nuevos ni cambio de reporte

#### Scenario: Sin datos TEST-* pobla directo sin dialog
- **WHEN** no existen datos `TEST-*` y el usuario pulsa "Poblar todo de una vez"
- **THEN** el sistema pobla directamente sin mostrar el dialog de confirmación y termina en "Carga completa OK" con `22/22` fases
