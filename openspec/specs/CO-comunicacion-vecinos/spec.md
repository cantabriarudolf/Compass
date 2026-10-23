# CO-comunicacion-vecinos Specification

## Purpose
Canal oficial de comunicación con la comunidad: mensajería masiva por filtros EF/MP con confirmación de lectura, maestro de plantillas prefijadas con variables dinámicas, buzón de interacción ciudadana (felicitaciones/sugerencias/reclamos) con tickets y biblioteca documental. Fuente de verdad: `Data/NSGC/docs/especificaciones/CO - Comunicacion Vecinos.md`.

## Requirements

### Requirement: Envío Masivo con Filtros Dinámicos de Destinatarios
El sistema MUST permitir componer un mensaje (manual o desde plantilla) y resolver su alcance mediante filtros combinables sobre el maestro de personas y la estructura física: grupos completos por rol de vínculo (todos los residentes, todo el personal de servicio), sub-grupos físicos/lógicos (macro sector, micro sector, unidad específica), individuos (persona concreta) y combinaciones de los anteriores. El envío se realiza con `saveEnvioCO` retornando `StoreResult`, que persiste un snapshot inmutable de destinatarios resueltos, valida FK contra personas y materializa una notificación por destinatario vía `notify()` con canal `email_simulado` (D3; push/WhatsApp quedan como canales futuros fuera del mock).

#### Scenario: Envío a propietarios de un sector
- **WHEN** el administrador filtra "propietarios" + macro sector "Torre B" y envía
- **THEN** `saveEnvioCO` persiste el snapshot de destinatarios vigentes que cumplen ambos filtros
- **AND** emite un evento `CO_SEND_MASSIVE` con el total de destinatarios
- **AND** cada destinatario recibe una notificación `email_simulado` con asunto y cuerpo del mensaje

#### Scenario: Destinatario inexistente rechazado
- **WHEN** `saveEnvioCO` recibe un destinatario que no existe en `personas`
- **THEN** retorna `{ok:false}` con error de integridad referencial y no muta el estado

#### Scenario: Gate de alertas del propietario (AD)
- **WHEN** el destinatario residente pertenece a una unidad cuyo dueño silenció `alertasResidentesActivas`
- **THEN** `notify()` omite esa notificación operativa sin fallar el envío

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

### Requirement: Maestro de Mensajes Prefijados (Plantillas)
El sistema MUST mantener plantillas con categoría (`comunidad`, `urgente`, `cobranza`, `informacion`, `onboarding`), asunto y cuerpo soportando variables dinámicas `[Nombre_Usuario]`, `[Nombre_Torre]` y `[Nombre_Comunidad]`. La gestión usa `savePlantillaCO`/`removePlantillaCO` retornando `StoreResult`; cargar una plantilla en el compositor auto-completa asunto y cuerpo. El seed incluye las 5 plantillas de ejemplo del NSGC.

#### Scenario: Variable sustituida al enviar
- **WHEN** se envía un mensaje basado en plantilla con `[Nombre_Usuario]`
- **THEN** cada destinatario recibe la notificación con la variable resuelta con su nombre real

#### Scenario: Plantilla en uso no eliminable
- **WHEN** `removePlantillaCO` recibe una plantilla referenciada por envíos existentes
- **THEN** retorna `{ok:false}` con error de integridad referencial

### Requirement: Buzón de Interacción Ciudadana con Tickets
El buzón MUST recibir felicitaciones, sugerencias y reclamos presentándose en ese orden constructivo. Cada ingreso genera un número de seguimiento único (folio). Los tickets usan estados Recibido → En Gestión → Resuelto → Cerrado gestionados con `saveMensajeBuzonCO`, `responderMensajeBuzonCO` (registra respuesta/compromiso y transiciona automáticamente Recibido→En Gestión) y `cambiarEstadoBuzonCO`, retornando `StoreResult`. La privacidad es configurable: el reportante decide si su mensaje es visible para el Comité o solo para la Administración.

#### Scenario: Ticket con folio único
- **WHEN** un residente registra un reclamo vía `saveMensajeBuzonCO`
- **THEN** se genera folio único, estado inicial "Recibido" y evento `CO_TICKET_CREATED`

#### Scenario: Respuesta de administración transiciona estado
- **WHEN** la administración responde un ticket en "Recibido"
- **THEN** pasa automáticamente a "En Gestión", la respuesta queda registrada y se audita `CO_TICKET_RESPONDIDO`

#### Scenario: Privacidad Comité
- **WHEN** el mensaje fue marcado visible para el Comité
- **THEN** la vista de directiva lo lista; si no, solo la Administración lo ve

### Requirement: Biblioteca de Documentos Comunales
El sistema MUST ofrecer acceso 24/7 a documentos comunales referenciados por metadatos + URL (nombre, tipo MIME, tamañoKB, url — D1, jamás base64/Blob), gestionados con `saveDocumentoCO`/`removeDocumentoCO` (store) y por la API REST `/api/co/documentos` (GET paginado, POST upsert idempotente; detalle/PUT/DELETE en `/[id]`); cada descarga queda auditada como `CO_DOC_DOWNLOAD`.

#### Scenario: Descarga auditada
- **WHEN** un usuario abre un documento de la biblioteca
- **THEN** se emite el evento `CO_DOC_DOWNLOAD` con referencia al documento

#### Scenario: Documento por referencia
- **WHEN** se intenta guardar un documento con URL data:/blob:
- **THEN** retorna `{ok:false}` citando la regla D1 media por referencia

### Requirement: Integración con Auditoría y Métricas (AM)
El módulo SHALL emitir `CO_SEND_MASSIVE`, `CO_TICKET_CREATED`, `CO_TICKET_RESPONDIDO`, `CO_TICKET_ESTADO` y `CO_DOC_DOWNLOAD` como eventos inmutables con data cuantificable: número de destinatarios por envío, tasa de apertura, volumen de reclamos por clasificación y tiempo de cierre de ticket (fecha ingreso→cierre).

#### Scenario: Métricas de comunicación
- **WHEN** la reportería consulta comunicación
- **THEN** puede derivar alcance de envíos, apertura y SLA ciudadano desde eventos y colecciones CO

#### Scenario: Ciclo operativo delegado a GE
- **WHEN** un ticket del buzón requiere gestión operativa (workflow interno de administración)
- **THEN** queda trazable hacia GE (motor de solicitudes) mediante el folio, manteniendo aquí el ciclo ciudadano visible

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
