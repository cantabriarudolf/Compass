## MODIFIED Requirements

### Requirement: Maestro de Elementos Reservables
El sistema MUST permitir a la administración configurar qué se puede reservar mediante `saveElementoRA` (store) y la API REST `/api/ra/elementos` (POST upsert idempotente; PUT/DELETE en `/[id]`), con tipo (Espacio Físico o Activo Mobiliario), ubicación por referencia al micro sector EF o al activo del catálogo IR, lógica de franjas horarias (bloques de N horas o día completo), tarifa de uso por bloque/día ($0 = gratis), garantía requerida, aforo para espacios o stock de unidades idénticas, y reglas especiales de anticipación mínima y penalización por cancelación tardía. La eliminación MUST bloquearse si el elemento tiene reservas no canceladas.

#### Scenario: Quincho con bloques y garantía
- **WHEN** se crea "Quincho TEST" (espacio físico, bloques de 3 horas, tarifa $15.000, garantía $20.000) vinculado a un micro sector EF
- **THEN** persiste activo y disponible en el maestro

#### Scenario: Activo mobiliario con stock
- **WHEN** se registra una hidrolavadora con stock 2 desde un activo IR
- **THEN** el motor admite hasta 2 reservas simultáneas sobre ese elemento

#### Scenario: Elemento con reservas no eliminable
- **WHEN** se intenta eliminar un elemento con reservas confirmadas
- **THEN** la eliminación se rechaza (409 en la API y `{ok:false}` en el store) citando la cantidad de reservas vinculadas
