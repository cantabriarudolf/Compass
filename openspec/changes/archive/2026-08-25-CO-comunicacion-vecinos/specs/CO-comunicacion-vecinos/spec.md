## ADDED Requirements

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
Cada envío MUST registrar qué destinatarios abrieron la comunicación oficial mediante `registrarLecturaEnvioCO(id, personaId)` (lectura simulada en mock-first), permitiendo derivar la tasa de apertura para AM.

#### Scenario: Lectura registrada una vez
- **WHEN** se confirma lectura de un destinatario ya registrado
- **THEN** la acción es idempotente y no duplica la entrada ni el evento

#### Scenario: Tasa de apertura consultable
- **WHEN** la reportería consulta un envío
- **THEN** puede calcular lecturas/total de destinatarios desde `enviosCO` sin cálculos externos

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
El sistema MUST ofrecer acceso 24/7 a documentos comunales referenciados por metadatos + URL (nombre, tipo MIME, tamañoKB, url — D1, jamás base64/Blob), gestionados con `saveDocumentoCO`/`removeDocumentoCO`; cada descarga simulada se registra con `registrarDescargaDocCO`.

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
