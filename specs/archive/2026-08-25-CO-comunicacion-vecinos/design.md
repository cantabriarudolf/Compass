## Context

Dependencias resueltas por la serie: `notify()`/`notificaciones` con canal `email_simulado` y gate AD de alertas (PI/AD), vínculos VU para resolver filtros (rol + unidad + sector), personas MP para identidad. Ruta `/comunidad/comunicacion` ya enlazada en sidebar. El NSGC define multicanalidad (email/push/WhatsApp) pero D3 fija el mock: solo `email_simulado`; push/WhatsApp quedan como canales futuros hasta SG.

## Goals / Non-Goals

**Goals:**
- Canal oficial de comunicación: composición → filtros EF/MP combinables → envío masivo simulado con snapshot auditable.
- Maestro de plantillas con variables sustituidas por destinatario en el envío.
- Buzón ciudadano constructivo (felicitaciones→sugerencias→reclamos) con folio y ciclo propio visible al vecino.
- Biblioteca documental mínima por referencia (D1).

**Non-Goals:**
- Envío real por SMTP/push/WhatsApp (llega con SG); lectura real de correos (la confirmación es simulada).
- Workflow operativo del ticket: GE (change posterior de esta sesión) gestiona el ciclo interno; aquí el folio queda trazable como referencia.
- Adjuntos dentro del mensaje masivo: el cuerpo es texto; la biblioteca cubre documentos.

## Decisions

- **Colecciones**: `plantillasCO {id, nombre, categoria, asunto, cuerpo}` (categoría enum cerrado según NSGC §2); `enviosCO {id, asunto, cuerpo, plantillaId?, destinatarios[] {personaId, unidadId?}, fechaEnvio, lecturas[] personaIds}` — snapshot inmutable de destinatarios resueltos en UI (los filtros son consulta, no dato persistente); `mensajesBuzonCO {id, folio, clasificacion, reportantePersonaId?, reportanteNombre, unidadId?, asunto, cuerpo, visibilidadComite, fechaIngreso, estado, respuestas[] {id, autor, texto, compromisos?, fecha}}`; `documentosCO {id, nombre, categoria, tipoMime, tamanoKB, url}` reutilizando el patrón ImagenReferencia (D1).
- **Sustitución de variables**: se resuelve al enviar, por destinatario (`[Nombre_Usuario]` → nombres+apellidos de la persona; `[Nombre_Torre]`/`[Nombre_Comunidad]` → configuración/estructura). La plantilla guarda el texto con variables intacto.
- **Envío masivo = loop de `notify()`**: un `notify()` por destinatario (destinatarioPersonaId seteado). El gate de AD silencia residentes de unidades con alertas desactivadas sin romper el envío (comportamiento ya existente en `notify()`).
- **Folio buzón**: `BUZ-<secuencia>` derivado del conteo existente + timestamp para idempotencia; único por construcción.
- **Estados buzón ciudadano**: `recibido | en_gestion | resuelto | cerrado` (NSGC §3). La respuesta de administración auto-transiciona Recibido→En Gestión. Resuelto/Cerrado manuales vía `cambiarEstadoBuzonCO`.
- **Rank 6**: CO depende de `personas`(1)+`vinculos`(3)+`notificaciones`(4)+`controlesPropiedades`(gate AD). Seeds: 5 plantillas del spec; resto vacío.
- **Migrate v14**: agita las 4 colecciones aditivamente; plantillas desde seed si ausentes.

## Risks / Trade-offs

- [Snapshot de destinatarios] Si cambian vínculos después, el envío conserva el destinatario histórico → aceptado: refleja quién recibió realmente la comunicación.
- [Doble ciclo de ticket (ciudadano CO / operativo GE)] Conviven vocabularios distintos por diseño NSGC; el folio es la clave de trazabilidad entre ambos.
- [notify() por N destinatarios] Volumen en bandeja → aceptado y filtrable por módulo origen CO.

## Migration Plan

Aditiva (colecciones nuevas v14; plantillas sembradas si ausentes). Sin transformación de datos v13.

## Open Questions

Ninguna — categorías de plantilla fijadas por NSGC §2 y estados del buzón por NSGC §3.
