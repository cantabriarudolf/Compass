## Context

Dependencias ya resueltas por la serie: `notify()`/`notificaciones` (PI), firmas en `datosGobernanza.firmaDigital` y `controlesPropiedad.residenteVeActas` (AD). Ruta `/comunidad/directiva` ya enlazada en sidebar. La directiva vigente se deriva de personas con `datosGobernanza` activos. D1 aplica a adjuntos; D3 a la notificación masiva de publicación.

## Goals / Non-Goals

**Goals:**
- Ciclo completo acta: crear → aprobar (100% directiva) → publicar + notificar.
- Contrato de privacidad listo para FI (morosidad) reutilizando el patrón de flags.

**Non-Goals:**
- Generación de PDF del acta (pdfmake llega con CT; el acta se referencia como URL/texto).
- Publicación real en CV: solo queda registrada la intención (`publicacionCV: "pendiente"`).
- Texto enriquecido con formato complejo: minuta como texto plano/multilínea.

## Decisions

- **Colección única `actasGD`**: reunión + asistencia + minuta + aprobaciones viven en un registro (el NSGC las trata como una unidad documental). Campos: `{id, fecha, hora, lugar, tablaTemas[], presentes[], ausentes[], invitados[], minuta, adjuntos[{nombre,tipoMime,tamanoKB,url}], estado:"borrador"|"publicada", aprobaciones[], fechaPublicacion?, avisoCVReferencia?}`.
- **Quórum fijo 100%**: la spec NSGC define "100% (o quorum definido)"; para mock-first se fija 100% de directiva vigente y se deja constante `QUORUM_ACTA = 1.0` en el store para futuro ajuste.
- **Notificación masiva**: al publicar, un loop llama `notify()` por cada propietario (destinatarioRol `propietario`); si el dueño silenció alertas no aplica aquí — el flag AD silencia alertas automáticas operativas, no actos formales de gobernanza.
- **Rank 5**: `actasGD` depende de `personas`(1)+`vinculos`(3)+`notificaciones`(4). Seed vacío.
- **Migrate v13**: agrega `actasGD: []` aditivo.
- **UI**: página con dos vistas — repositorio de actas (con monitor de firmas pendientes por acta) y formulario de registro/edición; acceso por RP según rol.

## Risks / Trade-offs

- [Minuta sin formato rico] Se pierde negrita/listas → aceptado: mock-first; pdfmake/richtext llegan con CT/SG.
- [notify() por N propietarios] Volumen en bandeja → aceptado: refleja el acto formal; filtrable por módulo origen GD.

## Migration Plan

Aditiva (colección vacía). Sin transformación de datos v12.

## Open Questions

Ninguna — quórum fijado en 100% según NSGC §2 y decisiones previas del owner.
