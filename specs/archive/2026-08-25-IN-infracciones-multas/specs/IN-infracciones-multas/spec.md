## ADDED Requirements

### Requirement: Catálogo Parametrizable de Tipos de Infracción
El sistema MUST mantener un catálogo predefinido de faltas al Reglamento de Copropiedad mediante `saveTipoInfraccionIN`/`removeTipoInfraccionIN` retornando `StoreResult`, con nombre identificador claro, categoría (Leve, Grave, Gravísima), sanción base (Monto Fijo o Porcentaje % del Gasto Común) y monto/valor asociado. Un tipo usado por infracciones registradas MUST ser bloqueado para eliminación. El seed incluye las faltas de ejemplo del NSGC.

#### Scenario: Tipo con sanción porcentual
- **WHEN** se crea "Ruidos Molestos" Grave con sanción Porcentaje GC 50
- **THEN** el catálogo queda disponible para nuevos registros de infracción

#### Scenario: Tipo en uso no eliminable
- **WHEN** `removeTipoInfraccionIN` recibe un tipo referenciado por infracciones existentes
- **THEN** retorna `{ok:false}` con error de integridad referencial

### Requirement: Cobros por Daños y Reparaciones (Responsabilidad Civil)
Además de las multas de reglamento, el sistema MUST permitir al administrador cargar directamente a la unidad responsable el costo exacto de una reparación por daños materiales. El formulario de cobro directo MUST exigir descripción del daño, costo de la reparación mayor a cero y al menos un archivo de respaldo (cotización o factura del contratista, fotos del daño) como metadatos D1.

#### Scenario: Cobro directo completo
- **WHEN** se registra "Rotura de espejo del ascensor" con costo y cotización adjunta
- **THEN** la infracción queda en Revisión lista para aplicar a la unidad responsable

#### Scenario: Daño sin respaldo rechazado
- **WHEN** falta descripción, costo o evidencia del daño
- **THEN** retorna `{ok:false}` indicando los campos obligatorios

### Requirement: Registro Operativo de Infracciones
El sistema MUST documentar eventos mediante `saveInfraccionIN` retornando `StoreResult`, con folio único, tipo del catálogo (o cobro directo por daños), unidad infractora vinculada al maestro EF, fecha y hora del suceso, antecedentes detallados de los hechos y evidencias adjuntas (fotos, registros de cámaras, testimonios) por referencia D1. Todo registro inicia en estado "En Revisión", notifica a administración y audita `IN_REG_EVENT`.

#### Scenario: Infracción con folio único
- **WHEN** se registra una infracción válida
- **THEN** recibe folio IN-secuencial único, estado En Revisión y evento `IN_REG_EVENT`

#### Scenario: Nacimiento desde reclamo CO
- **WHEN** el administrador convierte un reclamo verídico del buzón en infracción
- **THEN** valida la FK contra `mensajesBuzonCO` y arrastra asunto/cuerpo como antecedentes

#### Scenario: Unidad inexistente rechazada
- **WHEN** la unidad infractora no existe en el inventario
- **THEN** retorna `{ok:false}` con error de integridad referencial

### Requirement: Estados y Apelación con Descargos
El ciclo de vida MUST transicionar En Revisión → Apelada cuando el vecino presenta sus descargos (`apelarInfraccionIN` auditando `IN_APELACION`); desde En Revisión o Apelada la administración puede Aplicar la multa (`aplicarInfraccionIN`, estado Cerrada/Aplicada con monto fijado según la sanción base del catálogo o el costo directo) o Desestimar con justificación obligatoria.

#### Scenario: Apelación registra descargos
- **WHEN** el vecino presenta descargos dentro del ciclo
- **THEN** el estado pasa a Apelada, quedan registrados texto y fecha y se emite `IN_APELACION`

#### Scenario: Aplicación fija el monto
- **WHEN** se aplica una infracción cuyo tipo es Monto Fijo $25.000
- **THEN** el montoAplicado queda en $25.000, el estado pasa a Aplicada y se emite `IN_APPLY_FINE`

#### Scenario: Desestimación exige justificación
- **WHEN** se intenta desestimar sin texto justificativo
- **THEN** retorna `{ok:false}` exigiendo la justificación

### Requirement: Respaldo de la Directiva para Multas Graves
Las multas de categoría Grave o Gravísima MUST contar con el respaldo (voto/validación) de al menos un miembro vigente de la directiva antes de poder aplicarse definitivamente al Gasto Común; `respaldarInfraccionIN` valida que quien respalda tenga extensión de gobernanza activa. Los miembros de Comité/Directiva disponen además de comentarios internos visibles solo para administración y directiva (`comentarInfraccionIN`).

#### Scenario: Multa grave sin respaldo bloqueada
- **WHEN** se intenta aplicar una multa Grave sin ningún respaldo directiva
- **THEN** retorna `{ok:false}` exigiendo primero el respaldo de la directiva

#### Scenario: Comentario interno privado
- **WHEN** un director comenta la infracción
- **THEN** el comentario queda asociado con autor y fecha para el panel de supervisión

### Requirement: Panel de Supervisión de la Directiva
El sistema MUST presentar una vista de supervisión con todos los incidentes y multas en curso (contadores por estado y categoría, montos comprometidos), accesible para administración y directiva, donde se concentran comentarios internos, respaldos y trazabilidad completa de cada expediente.

#### Scenario: Volumen y montos en curso
- **WHEN** la directiva abre el panel
- **THEN** visualiza infracciones por estado/categoría y el total multado derivable de `infraccionesIN`

#### Scenario: Expediente trazable
- **WHEN** se selecciona una infracción del panel
- **THEN** muestra antecedentes, evidencias, descargos, comentarios internos y respaldos con fechas

### Requirement: Integración con Auditoría y Métricas (AM)
El módulo SHALL emitir `IN_REG_EVENT`, `IN_APPLY_FINE` y `IN_APELACION` como eventos inmutables con data cuantificable: montos totales por multas, cantidad de infracciones por categoría, infracciones más recurrentes y porcentaje de multas apeladas.

#### Scenario: Auditoría completa
- **WHEN** ocurre registro, aplicación o apelación
- **THEN** el evento registra folio, unidad y descripción legible sin mutar colecciones históricas
