## MODIFIED Requirements

### Requirement: Auditoría CF_UPDATE_PARAM de parámetros legales

El sistema SHALL emitir el evento `CF_UPDATE_PARAM` cuando cambien los parámetros legales de remuneraciones (`ufMensual`, `ingresoMinimoMensual`, `topeGratificacionLegal`, `tasaSIS`), incluyendo old/new conforme a `CF-configuracion-global`. El evento no tiene emisor en el código actual: la persistencia de la configuración corre server-side en `PUT /api/configuracion` (`app/api/configuracion/route.ts`), que no lo emite, y no existe emisor cliente. El gap queda declarado como deuda con su verificación pendiente en `openspec/BACKLOG-100.md:277`.

#### Scenario: Cambio de UF mensual auditado

- **WHEN** la administración actualiza `ufMensual` y guarda la configuración
- **THEN** AM registra `CF_UPDATE_PARAM` con el valor anterior y nuevo
