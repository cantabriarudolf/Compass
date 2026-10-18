## MODIFIED Requirements

### Requirement: Auditoría CF_UPDATE_PARAM de parámetros legales

El sistema SHALL emitir el evento `CF_UPDATE_PARAM` cuando cambien los parámetros legales de remuneraciones (`ufMensual`, `ingresoMinimoMensual`, `topeGratificacionLegal`, `tasaSIS`), incluyendo old/new conforme a `CF-configuracion-global`. El emisor es server-side: `PUT /api/configuracion` (`app/api/configuracion/route.ts`) registra el evento con categoría `CF`, referencia a la fila de configuración y la descripción con el valor anterior y el nuevo de cada parámetro modificado. La emisión es por delta real: un `PUT` que no toca esos cuatro campos, o que los reenvía sin cambio de valor, no emite el evento.

#### Scenario: Cambio de UF mensual auditado

- **WHEN** la administración actualiza `ufMensual` y guarda la configuración
- **THEN** AM registra `CF_UPDATE_PARAM` con el valor anterior y nuevo

#### Scenario: Guardado sin cambio de parámetros legales

- **WHEN** la administración guarda la configuración sin modificar los cuatro parámetros legales
- **THEN** AM no registra `CF_UPDATE_PARAM`
