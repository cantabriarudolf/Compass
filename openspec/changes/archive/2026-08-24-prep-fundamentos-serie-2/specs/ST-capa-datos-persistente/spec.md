## ADDED Requirements

### Requirement: Media por Referencia (Sin Payload Binario)
El store MUST NOT persistir contenido binario (base64, Blob, ArrayBuffer) de adjuntos ni imágenes. Todo adjunto o media (evidencias de IN, facturas de MT, imágenes de CV) MUST guardarse únicamente como metadatos: nombre, tipo MIME, tamaño en KB y URL/referencia externa.

#### Scenario: Guardar Adjunto por Referencia
- **WHEN** un módulo registra un adjunto (ej. factura de MT)
- **THEN** el store guarda solo los metadatos del archivo (nombre, tipo, tamañoKB, url)
- **AND** el payload binario jamás entra al store ni a localStorage

#### Scenario: Intento de Carga Base64
- **WHEN** una acción recibe un payload con contenido base64/Blob en lugar de una URL/referencia
- **THEN** la acción retorna `StoreResult` con error y no muta el estado

#### Scenario: Imágenes del Visor de Mensajes (CV)
- **WHEN** se crea un aviso con imagen para el carrusel
- **THEN** el aviso referencia una URL remota (placeholder o CDN) y no datos embebidos

### Requirement: Centro de Notificaciones Simulado
El store MUST mantener una colección `notificaciones` y exponer una acción centralizada `notify()` que registre notificaciones in-app (destinatario, asunto, cuerpo, canal simulado, fecha, módulo origen). El envío real por correo queda fuera de alcance; la interfaz MUST ser sustituible por un backend real sin cambiar a los consumidores.

#### Scenario: Notificación de Cierre de Turno (PE)
- **WHEN** se envía un reporte de cierre de turno
- **THEN** `notify()` crea una notificación dirigida a la administración con el resumen del evento
- **AND** el evento queda auditado en AM

#### Scenario: Bandeja Visible
- **WHEN** cualquier usuario consulta su centro de notificaciones
- **THEN** ve las notificaciones dirigidas a su rol/persona con estado leído/no leído
- **AND** puede marcarlas como leídas mediante acción del store

#### Scenario: Publicación de Acta (GD) y Cobranza (CO/FI)
- **WHEN** un flujo declara "notificación por correo" en su especificación NSGC
- **THEN** el sistema lo materializa como registro en la bandeja simulada con canal `email_simulado`
