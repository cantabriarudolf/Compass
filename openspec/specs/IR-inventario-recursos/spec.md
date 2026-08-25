# IR-inventario-recursos Specification

## Purpose
Catálogo unificado de activos de infraestructura, mobiliario, insumos con stock crítico, EPP y accesos físicos (llaves/credenciales), vinculado a la Estructura Física y al Maestro de Personas; solicitudes de insumo trazables con comodín de artículo no catalogado. Fuente de verdad: `Data/NSGC/docs/especificaciones/IR - Inventario y Recursos.md`.

## Requirements

### Requirement: Catálogo Unificado de Recursos con Ubicación EF
El sistema MUST mantener un catálogo de recursos mediante `saveRecursoIR` retornando `StoreResult`, con cuatro naturalezas: activos de infraestructura (hidropack, motobombas, cámaras, cercos, citofonía, ascensores), mobiliario y herramientas (con estados Disponible/En Uso/Reparación/Baja y responsable asignado), insumos y consumibles (stock con unidad de medida) y elementos de protección personal. Los recursos de infraestructura MUST vincularse a una ubicación de la Estructura Física (macro/micro sector o unidad); las llaves físicas MUST vincularse a la unidad correspondiente. El ingreso de recursos (compras) registra proveedor, garantía y factura como metadatos D1 (nombre/tipoMime/tamañoKB/URL, jamás base64/Blob); la vinculación contable al egreso FI queda como referencia pendiente (`cargoFIReferencia:"pendiente"` hasta implementar Finanzas).

#### Scenario: Activo de infraestructura vinculado a EF
- **WHEN** se guarda un hidropack con ubicación en un micro sector existente
- **THEN** `saveRecursoIR` persiste el recurso con su ficha técnica por referencia (D1)

#### Scenario: Ingreso con factura por referencia
- **WHEN** se registra la compra de un insumo con número de factura y URL de documento
- **THEN** los metadatos D1 quedan en el recurso y el campo `cargoFIReferencia` queda como "pendiente"

#### Scenario: Recurso eliminable solo sin dependencias
- **WHEN** `removeRecursoIR` recibe un insumo con solicitudes o un EPP con entregas asociadas
- **THEN** retorna `{ok:false}` con error de integridad referencial

### Requirement: Stock Crítico con Alarma de Reposición Automática
Al crear un insumo el administrador MUST poder marcarlo como crítico fijando su umbral de Stock Crítico. Al llegar al umbral por consumo, el sistema MUST levantar una Alarma de Reposición automática: evento `IR_STOCK_LOW` y notificación email_simulado a la administración (D3), visible en el dashboard del administrador.

#### Scenario: Cruce de umbral dispara alarma
- **WHEN** la entrega de una solicitud deja el stock en o bajo el umbral crítico
- **THEN** se emite `IR_STOCK_LOW` y la administración recibe notificación de reposición

#### Scenario: Entrega sin stock suficiente rechazada
- **WHEN** se intenta entregar una solicitud por más unidades que el stock disponible
- **THEN** retorna `{ok:false}` indicando el faltante y no muta el stock

### Requirement: Solicitud y Consumo Trazable de Insumos
La solicitud de insumos MUST ser una gestión operativa registrada mediante `saveSolicitudInsumoIR` (folio SI-*) tipificando quién lo pidió (persona del Maestro), qué tipo de insumo es (artículo del catálogo) y para qué ubicación va destinada (área destino). El cierre del ciclo lo marca la administración/jefatura con `entregarSolicitudInsumoIR` (descuenta stock y registra fecha de entrega); las solicitudes pendientes prolongadas son visibles para el Panel de Incumplimientos (AM) desde fechas.

#### Scenario: Ciclo completo de una solicitud
- **WHEN** un trabajador pide cloro para Piso 1 y la administración entrega
- **THEN** la solicitud pasa de Pendiente a Entregada con fecha, el stock del artículo disminuye y ambos pasos quedan auditados

#### Scenario: Solicitudes pendientes consultables
- **WHEN** la reportería consulta incumplimientos
- **THEN** puede listar solicitudes Pendientes ordenadas por antigüedad desde `solicitudesInsumoIR`

### Requirement: Comodín de Artículo No Catalogado
Para no detener la operativa, el personal MUST poder solicitar un artículo fuera del catálogo describiendo artículo, cantidad y justificación. Esta solicitud comodín genera una alerta crítica al administrador (evento `IR_COMODIN_ALERTA` + notificación), quien decide mediante `resolverComodinIR`: Aprobar y Crear (alta automática del artículo al catálogo para futuras solicitudes), Sustituir (asociar un artículo similar existente en stock) o Rechazar (justificación obligatoria).

#### Scenario: Comodín aprobado crea el artículo
- **WHEN** el administrador aprueba y crea un comodín de "escobillón industrial"
- **THEN** el artículo queda en `activosIR` disponible para futuras solicitudes y la solicitud queda ligada a él

#### Scenario: Rechazo sin justificación inválido
- **WHEN** se intenta rechazar un comodín sin texto de justificación
- **THEN** retorna `{ok:false}` exigiendo la justificación

### Requirement: EPP y Uniformes con Registro Individual
El sistema MUST registrar la entrega individual de EPP y uniformes mediante `registrarEntregaEPP` (recurso tipo EPP, persona, fecha, talla y estado), auditando cada entrega como `IR_DELIVERY_EPP`. Cuando el recurso define periodicidad de renovación, la entrega MUST calcular su próxima renovación para derivar el cumplimiento de entrega (Seguridad Laboral) y el ciclo de renovación automática.

#### Scenario: Entrega con renovación calculada
- **WHEN** se entrega un casco con renovación semestral
- **THEN** se registra `IR_DELIVERY_EPP` y la entrega queda con fecha de próxima renovación

#### Scenario: Cumplimiento consultable
- **WHEN** la reportería consulta Seguridad Laboral
- **THEN** puede derivar el porcentaje de personal con EPP vigente desde `entregasEPP`

### Requirement: Control de Accesos Físicos (Llaves y Credenciales)
El sistema MUST gestionar llaves físicas vinculadas a unidades de EF y credenciales (tarjetas RFID, tags, códigos) mediante `asignarAccesoIR` y `devolverAccesoIR`, manteniendo el registro de "Quién tiene qué" con asignación vigente (persona + fecha). Las llaves no devueltas (asignación vigente con fecha anterior al día actual) MUST ser identificables para su seguimiento al fin de turno.

#### Scenario: Asignación y devolución de llave
- **WHEN** se asigna la llave de Depto 999 a un trabajador y luego se devuelve
- **THEN** la asignación queda cerrada con fecha y el recurso vuelve a estar disponible

#### Scenario: Llave no devuelta visible
- **WHEN** existe una asignación vigente con fecha anterior a hoy
- **THEN** la vista de accesos la lista como no devuelta

### Requirement: Estados del Activo y Baja Documentada
Los activos mobiliarios e infraestructura MUST transicionar entre Disponible, En Uso, Reparación y Baja mediante `cambiarEstadoRecursoIR`. El paso a Reparación MUST auditarse como `IR_ASSET_REPAIR` y el paso a Baja (pérdida, robo o fin de vida útil) MUST quedar registrado para alimentar el ratio de pérdida/daño de herramientas.

#### Scenario: Reparación auditada
- **WHEN** una cortadora de arbustos pasa a Reparación
- **THEN** se emite `IR_ASSET_REPAIR` con referencia al recurso

#### Scenario: Baja por pérdida
- **WHEN** se marca una escalera como Baja
- **THEN** el cambio queda auditado y el activo sale del stock operativo

### Requirement: Integración con Auditoría y Métricas (AM)
El módulo SHALL emitir `IR_DELIVERY_EPP`, `IR_STOCK_LOW` y `IR_ASSET_REPAIR` como eventos inmutables, más `IR_COMODIN_ALERTA` para comodines. Data cuantificable: gasto mensual en insumos derivable de ingresos con factura, ratio de pérdida/daño (bajas sobre catálogo), cumplimiento de entrega de EPP (entregas vigentes sobre personal) y desviación de consumo por área destino.

#### Scenario: Auditoría completa del ciclo
- **WHEN** ocurre entrega de insumo, cruce de umbral o reparación
- **THEN** cada evento registra código/nombre del recurso y descripción legible sin mutar colecciones históricas
