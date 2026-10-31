## ADDED Requirements

### Requirement: Setup de pagos TEST vía helper compartido
El spec de pagos SHALL crear su dato TEST vía `e2e/helpers/datos-test`
(`crearUnidadTEST` + `crearCobroTEST` con fondo del seed) y limpiarlo al
final (`limpiarCobroTEST` con reset vía PUT + `limpiarUnidadTEST`), sin setup
inline duplicado. El flujo UI (Libro de cobros, Registrar pago, fila pagada)
queda idéntico.

#### Scenario: Cobro TEST pendiente se paga en la UI
- **WHEN** existe un cobro pendiente TEST creado vía el helper
- **THEN** la fila aparece en el Libro de cobros, Registrar pago lo marca
  pagado y el cleanup no deja residuos TEST.
