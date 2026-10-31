## ADDED Requirements

### Requirement: Bandeja del Residente

El sistema MUST ofrecer al residente un lugar donde abrir las comunicaciones de su
comunidad, y esa bandeja MUST derivarse del rol de la sesión resuelto en el servidor.
El cliente MUST NOT ofrecer un selector que permita ver la consola de administración.

#### Scenario: Vista derivada del rol
- **WHEN** un residente abre `/comunidad/comunicacion`
- **THEN** el sistema le muestra su bandeja de comunicaciones
- **AND** no existe en la pantalla ningún control para cambiar a la vista de administración

#### Scenario: El residente solo recibe envíos propios
- **WHEN** un residente consulta `GET /api/co/envios`
- **THEN** el sistema devuelve únicamente los envíos en los que figura como destinatario

#### Scenario: Lectura registrada al abrir
- **WHEN** el residente abre una comunicación de su bandeja
- **THEN** el sistema registra su lectura mediante `POST /api/co/envios/[id]/leer`
- **AND** la bandeja muestra la fecha y hora de su propia lectura

### Requirement: Minimización de Datos en la Respuesta de Envíos

La respuesta de los envíos MUST NOT exponer al residente la nómina de destinatarios, el
estado de lectura de otros destinatarios ni los totales del envío.
Al comité MUST exponerle solo agregados.

#### Scenario: Nómina de destinatarios oculta al residente
- **WHEN** un residente obtiene un envío propio
- **THEN** la respuesta no incluye el campo `destinatarios`
- **AND** no incluye el campo `lecturas`
- **AND** no incluye `totalDestinatarios` ni `totalLecturas`

#### Scenario: Estado de lectura ajeno oculto
- **WHEN** un residente obtiene un envío del que es destinatario y otros tres vecinos ya lo leyeron
- **THEN** la respuesta solo informa su propia lectura en `lecturaPropia`
- **AND** no permite deducir cuántos ni quiénes leyeron

#### Scenario: Agregados para el comité
- **WHEN** un usuario con rol comité consulta los envíos
- **THEN** recibe `totalDestinatarios` y `totalLecturas`
- **AND** no recibe los arreglos nominativos

### Requirement: Envío Ajeno Responde 404

Un pedido sobre un envío del que el solicitante no es destinatario MUST responder 404,
de modo indistinguible del caso en que el envío no existe.

#### Scenario: Detalle ajeno no filtra existencia
- **WHEN** un residente pide `GET /api/co/envios/[id]` de un envío de otra unidad
- **THEN** el sistema responde 404
- **AND** el código y el cuerpo del error son iguales a los de un id inexistente

### Requirement: Desglose Nominativo de Lecturas Auditado

El desglose nominativo de lecturas MUST estar reservado al rol administrador, MUST emitir
un evento de auditoría en cada consulta y MUST NOT ofrecer exportación.

#### Scenario: Solo el administrador consulta el desglose
- **WHEN** un usuario con rol residente o comité pide `GET /api/co/envios/[id]/lecturas`
- **THEN** el sistema responde 403

#### Scenario: La consulta queda auditada
- **WHEN** un administrador consulta el desglose de un envío
- **THEN** el sistema responde las parejas `personaId` / `leidoEn`
- **AND** emite el evento `CO_LECTURA_CONSULTADA` con el envío y el rol que consultó

#### Scenario: Sin exportación masiva
- **WHEN** se inspeccionan los endpoints de CO
- **THEN** no existe ninguna ruta que exporte el desglose de lecturas

### Requirement: Aviso de Tratamiento de Datos en Comunicaciones

La bandeja del residente MUST informar, antes de la lectura, que la lectura se registra,
para qué finalidad y que ningún vecino accede a ella.

#### Scenario: Aviso visible antes de leer
- **WHEN** el residente abre la bandeja
- **THEN** la pantalla muestra el aviso de registro de lectura y el aviso de tratamiento de datos
- **AND** el aviso nombra la finalidad y la base de licitud

### Requirement: Privacidad del Buzón Ciudadano

El buzón ciudadano MUST respetar la pertenencia del reporte y la bandera `visibilidadComite`.
El residente MUST NOT recibir reportes de otros vecinos, y el reportante MUST derivarse de la
sesión, nunca del cuerpo del pedido.

#### Scenario: El residente solo ve sus propios reportes
- **WHEN** un residente consulta `GET /api/co/mensajes-buzon`
- **THEN** recibe únicamente los mensajes cuyo `reportantePersonaId` es el suyo

#### Scenario: Visibilidad al comité
- **WHEN** un usuario con rol comité consulta el buzón
- **THEN** recibe los mensajes marcados con `visibilidadComite`
- **AND** no recibe los que no lo están

#### Scenario: Detalle ajeno no filtra existencia
- **WHEN** un residente pide `GET /api/co/mensajes-buzon/[id]` de un mensaje que no es suyo
- **THEN** el sistema responde 404

#### Scenario: El reportante sale de la sesión
- **WHEN** un residente crea un mensaje en el buzón
- **THEN** el `reportantePersonaId` se toma de la sesión
- **AND** el valor enviado en el cuerpo del pedido se ignora

## MODIFIED Requirements

### Requirement: Confirmación de Lectura
Cada envío MUST registrar qué destinatarios abrieron la comunicación oficial mediante
`POST /api/co/envios/[id]/leer`, que MUST validar server-side que quien registra sea
destinatario. La lectura MUST persistirse en la tabla `EnvioDestinatarioCO` y el estado
MUST derivarse de ella, permitiendo calcular la tasa de apertura para AM.

#### Scenario: Lectura registrada una vez
- **WHEN** se confirma lectura de un destinatario ya registrado
- **THEN** la acción es idempotente y no duplica la entrada ni el evento

#### Scenario: Tasa de apertura consultable
- **WHEN** la reportería consulta un envío
- **THEN** puede calcular lecturas/total de destinatarios desde `enviosCO` sin cálculos externos

#### Scenario: Lectura concurrente sin pérdida
- **WHEN** dos destinatarios distintos registran su lectura del mismo envío de forma simultánea
- **THEN** ambas lecturas quedan persistidas
- **AND** ninguna se pierde por sobreescritura del conjunto completo
