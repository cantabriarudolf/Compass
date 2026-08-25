# IN-infracciones-multas (delta del change FI-finanzas-morosidad)

## MODIFIED Requirements

### Requirement: Estados y Apelación con Descargos
El ciclo de vida MUST transicionar En Revisión → Apelada cuando el vecino presenta sus descargos (`apelarInfraccionIN` auditando `IN_APELACION`); desde En Revisión o Apelada la administración puede Aplicar la multa (`aplicarInfraccionIN`, estado Cerrada/Aplicada con monto fijado según la sanción base del catálogo o el costo directo) o Desestimar con justificación obligatoria. Al aplicar la multa, el sistema MUST generar el cargo real en Finanzas: crea un cobro `multa_in` en el libro FI imputado al fondo de gasto común (resolviendo las sanciones en % del Gasto Común contra el último GC emitido de la unidad; sin historial previo se usa el valor nominal) y materializa `cargoFIReferencia` con el id del cobro creado.

#### Scenario: Apelación registra descargos
- **WHEN** el vecino presenta descargos dentro del ciclo
- **THEN** el estado pasa a Apelada, quedan registrados texto y fecha y se emite `IN_APELACION`

#### Scenario: Aplicación fija el monto
- **WHEN** se aplica una infracción cuyo tipo es Monto Fijo $25.000
- **THEN** el montoAplicado queda en $25.000, el estado pasa a Aplicada, se emite `IN_APPLY_FINE` y existe en FI un cobro de multa por $25.000 referenciado desde `cargoFIReferencia`

#### Scenario: Sanción porcentual resuelta contra el GC emitido
- **WHEN** se aplica una multa del 50% del Gasto Común a una unidad cuyo último cobro GC fue $200.000
- **THEN** el montoAplicado y el cobro FI quedan en $100.000

#### Scenario: Desestimación exige justificación
- **WHEN** se intenta desestimar sin texto justificativo
- **THEN** retorna `{ok:false}` exigiendo la justificación
