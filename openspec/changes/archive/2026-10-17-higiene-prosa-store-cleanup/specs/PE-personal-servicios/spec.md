## MODIFIED Requirements

### Requirement: Gestión de Proveedores Externos y Mantenciones Preventivas
El sistema SHALL administrar el catálogo de empresas de servicios (ascensores, bombas, CCTV, etc.) con RUT, contacto y rubro mediante `saveProveedorPE` (store) y la API REST `/api/pe/proveedores` (POST upsert idempotente; PUT/DELETE en `/[id]`); la eliminación SHALL bloquearse con mantenciones o visitas técnicas asociadas. El calendario de mantenciones preventivas SHALL registrarse con periodicidad mensual y próxima fecha, alertando cuando el servicio vence dentro del horizonte de alerta (por defecto 5 días); `registrarVisitaTecnicaPE` SHALL registrar cada visita técnica (técnico, trabajo realizado, supervisor) en el libro de visitas técnicas y, si está vinculada a una mantención preventiva, recalcular la próxima fecha según su periodicidad.

#### Scenario: Alerta de mantención por vencer
- **WHEN** una mantención preventiva vence dentro de los próximos 5 días
- **THEN** aparece destacada en el calendario como alerta automática

#### Scenario: Visita técnica cierra ciclo preventivo
- **WHEN** se registra la visita técnica de la mantención de ascensores con periodicidad mensual
- **THEN** el libro registra la visita con evento `PE_VISITA_TECNICA` y la mantención pasa a vencer en el siguiente ciclo

#### Scenario: Proveedor con historial no eliminable
- **WHEN** se intenta eliminar un proveedor con mantenciones o visitas técnicas asociadas
- **THEN** retorna `{ok:false}` citando los registros asociados

### Requirement: Protocolo de Cierre de Turno (Reporte Obligatorio)
El sistema SHALL validar el evento de reporte (sin cronometraje) mediante `cerrarTurnoPE`: identificación del turno (fecha, hora y jornada reportada editable para reemplazos, ligada al maestro `jornadas`), trabajador responsable existente en MP, novedades generales, reporte de incidencias con lógica anti-negligencia (las preguntas críticas llegan marcadas "SÍ" en la UX; el guardado MUST exigir descripción y evidencia D1 cuando hubo incidencias), checklist de estado de instalaciones basado en la jornada reportada y checklist de equipamiento de ronda (celular, PC, llaves maestras), ambos snapshot en el registro. El reporte cerrado MAY editarse mediante `PUT /api/pe/cierres-turno/[id]`, que SHALL preservar un historial de cambios inmutable dentro del registro. Al enviar, el sistema MUST notificar a la administración con el resumen del reporte y dejar copia dirigida al correo del trabajador (canal `email_simulado`), auditando `PE_CIERRE_TURNO` (y `PE_CIERRE_EDITADO` al editar).

#### Scenario: Incidencias sin descripción rechazadas
- **WHEN** se envía un cierre con incidencias marcadas "SÍ" pero sin descripción ni evidencia
- **THEN** retorna `{ok:false}` exigiendo descripción y evidencia, sin registrar el cierre

#### Scenario: Cierre notifica a administración con copia al trabajador
- **WHEN** se envía un cierre de turno válido
- **THEN** `notify()` crea notificación a administración con el resumen y una copia email_simulado dirigida al trabajador, con eventos en AM

#### Scenario: Edición preserva trazabilidad
- **WHEN** se edita un cierre ya enviado cambiando las novedades
- **THEN** el registro conserva su historial de cambios acumulado y emite `PE_CIERRE_EDITADO`
