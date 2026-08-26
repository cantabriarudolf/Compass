# 👥 18 - PE - Personal y Servicios

El repositorio maestro de identidad y condiciones laborales del equipo interno, más la operación digitalizada de conserjería: bitácora auditable de visitas/encomiendas/contratistas, reporte diario, protocolo de cierre de turno notificado a administración, proveedores externos con mantenciones preventivas y proyección operativa sobre los feriados legales.

## 🚀 Funcionalidad Principal

Dos mundos que comparten módulo: **RRHH** profundiza la extensión laboral mínima (`datosLaborales` de MP) con la ficha integral — previsional (AFP/Fonasa-Isapre/tramo de asignación familiar), bancaria (maestro de bancos), ficha médica, contactos de emergencia, jornada base, horas extras y evaluaciones — y **Operación** reemplaza el libro físico de novedades por registros auditables cuyo cierre de jornada dispara una notificación inmediata a administración.

## 🛠️ Secciones

- **Personal (`/personas/personal`)**:
  - **Trabajadores**: ficha integral 1:1 con la persona; las FKs legales (`afpId`, `saludId`, `asignacionFamiliarId`, `bancoId`, `mutualidadId`) se validan en escritura y bloquean la eliminación del maestro referenciado. Horas extras y evaluaciones quedan auditadas.
  - **Feriados y Proyección**: CRUD del maestro `feriados` (con importación anual) + cruce feriados × jornadas rotativas: *"necesitará N parches"*; el costo estimado (parches + día extra de planta) se envía a Finanzas como `proyeccionesPE` con marcador `liquidacionPLReferencia:"pendiente"` hasta PL (ventana 8).
  - **Panel de Monitoreo**: quién informó turno hoy (tarjetas Informado/No Informado por jornada), botón Iniciar Turno (`PE_START_SHIFT`) y tareas MT pendientes por trabajador con cierre directo (`PE_TASK_DONE`).
- **Bitácora Diaria (`/operaciones/bitacora`)**:
  - **Reporte Diario**: día consultable (hoy o anteriores) con tarjetas de jornada derivadas de los cierres registrados y conteos de novedades.
  - **Visitas**: pre-agendamiento (el conserje marca "Ingresada" y sella la hora) o llegada sin aviso; jornada ligada al maestro `jornadas`; escaneo DNI simulado local.
  - **Encomiendas**: courier del maestro (sin texto libre), evidencia fotográfica por URL (D1) y retiro registrado.
  - **Contratistas**: empresa del maestro `contratistas` con motivo específico obligatorio; origen residente o administración; confirmación de ingreso sellada.
  - **Cierre de Turno**: protocolo anti-negligencia (preguntas críticas llegan en "SÍ"; sin descripción ≥20 caracteres + evidencia no persiste), checklist de instalaciones según la jornada reportada (editable por reemplazos), checklist de equipamiento de ronda, edición posterior con historial de cambios inmutable y **notificación a administración con copia al correo del trabajador** (`email_simulado`).
- **Proveedores y Servicios (`/operaciones/proveedores`)**:
  - Catálogo de empresas (RUT validado), calendario preventivo con alerta automática cuando el servicio vence dentro del horizonte configurado, libro de visitas técnicas (qué hizo el técnico y quién lo supervisó — cada visita reprograma la próxima fecha del ciclo) y directorio de emergencias leído del maestro `contactosEmergencia` de MA con enlace `tel:`.

## 💡 Tips de Oro

- **FKs por id, nunca texto libre**: la ficha rechaza cualquier `afpId`/`bancoId`/etc. inexistente y un maestro legal en uso no se puede borrar.
- **Anti-negligencia real**: dejar todo en "SÍ" sin escribir obliga a describir y adjuntar evidencia; cambiar a "NO" oculta los campos. El sistema valida el evento, no cronometra.
- **Trazabilidad de cierres**: editar un reporte appendea al historial interno; los cierres históricos no son eliminables (solo los del día o los TEST de qa-lab).
- **Flags de CF**: `notificarRegistroVisitas` y `notificarEncomiendas` deciden si el residente recibe la notificación simulada.
- **Proyección honesta**: sin feriados cargados en el mes no hay envío a FI; el sobrecosto viaja como estimación, nunca como egreso real (eso llega con PL).
- **Preventivo cerrado**: registrar la visita técnica vinculada a una mantención avanza su próxima fecha según periodicidad; el proveedor con historial no es eliminable.
- **Auditoría**: `PE_START_SHIFT`, `PE_TASK_DONE`, `PE_VISITA_TECNICA`, `PE_ENCOMIENDA_RECIBIDA`, `PE_FICHA_SAVED`, `PE_VISITA_INGRESADA`, `PE_CONTRATISTA_INGRESADO`, `PE_CIERRE_TURNO`, `PE_CIERRE_EDITADO`, `PE_PROYECCION_ENVIADA`.

## 🔗 Dependencias

- **MP**: identidad del trabajador (no se duplica); la extensión laboral mínima sigue alimentando el cajón RRHH de AD.
- **MA**: maestros legales (AFP/salud/asignación familiar/bancos/mutualidades), `feriados`, `contactosEmergencia` y los operativos nuevos (`jornadas`, `couriers`, `contratistas`).
- **EF**: unidades destino de visitas/encomiendas/contratistas. **MT**: tareas del panel de monitoreo. **CF**: flags de notificación y jornada semanal estándar.
- **FI**: destino de la proyección de costos. **PL**: liquidaciones reales (ventana 8) — hoy queda `"pendiente"`.
- Notificaciones con `notify()` (**ST**, D2/D3); media por referencia (**D1**) para fotografías y evidencias.
