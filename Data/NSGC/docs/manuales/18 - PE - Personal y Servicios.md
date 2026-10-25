# 👥 18 - PE - Personal y Servicios

El repositorio maestro de identidad y condiciones laborales del equipo interno, más la operación digitalizada de conserjería: bitácora auditable de visitas/encomiendas/contratistas, reporte diario, protocolo de cierre de turno notificado a administración, proveedores externos con mantenciones preventivas y proyección operativa sobre los feriados legales.

## 🚀 Funcionalidad Principal

Dos mundos que comparten módulo: **RRHH** profundiza la extensión laboral mínima (`datosLaborales` de MP) con la ficha integral — previsional (AFP/Fonasa-Isapre/tramo de asignación familiar), bancaria (maestro de bancos), ficha médica, contactos de emergencia, jornada base, horas extras y evaluaciones — y **Operación** reemplaza el libro físico de novedades por registros auditables cuyo cierre de jornada dispara una notificación inmediata a administración.

## 🛠️ Secciones

- **Personal (`/personas/personal`)**:
  - **Trabajadores**: ficha integral 1:1 con la persona; las FKs legales (`afpId`, `saludId`, `asignacionFamiliarId`, `bancoId`, `mutualidadId`) se validan en escritura y bloquean la eliminación del maestro referenciado. Horas extras y evaluaciones quedan auditadas.
  - **Feriados y Proyección**: CRUD del maestro `feriados` (con importación anual) + cruce feriados × jornadas rotativas: *"necesitará N parches"*; el costo estimado (parches + día extra de planta) se envía a Finanzas como `proyeccionesPE` con marcador `liquidacionPLReferencia:"pendiente"` hasta PL (ventana 8).
  - **Panel de Monitoreo**: quién informó turno hoy (tarjetas Informado/No Informado por jornada), botón Iniciar Turno (`PE_START_SHIFT`) y tareas MT pendientes por trabajador con cierre directo (`PE_TASK_DONE`).
  - **Transiciones guardadas en la base**: iniciar turno, registrar hora extra, registrar evaluación, completar tarea de monitoreo y enviar proyección de costo ahora persisten en la base de datos — recargar la página ya no las pierde (antes vivían en el navegador).
  - **Sobretiempo medido**: se calcula desde los reportes de turno y aparece como KPI; al liquidar, el sistema lo **sugiere** al administrador — no existe una aprobación separada de hora extra.
  - **Evaluación histórica e inmutable**: una vez registrada no se edita; se agrega otra entrada al historial.
  - **Proyección de costo = aviso, no gasto**: es una métrica/alerta para administración; **no crea egreso en Finanzas**.
  - **Cierre de turno con permiso propio**: iniciar y editar el cierre de turno se gobierna con el permiso de cierre de turno (conserjería), no con el permiso general de personal.
- **Bitácora Diaria (`/operaciones/bitacora`)**:
  - **Reporte Diario**: día consultable (hoy o anteriores) con tarjetas de jornada derivadas de los cierres registrados y conteos de novedades.
  - **Visitas**: pre-agendamiento (el conserje marca "Ingresada" y sella la hora) o llegada sin aviso; jornada ligada al maestro `jornadas`; **escaneo del QR de la cédula** con la webcam: lee el RUN, valida el dígito verificador y propone la persona del padrón para que el conserje **confirme** (escanear no guarda nada). Carné antiguo, sin cámara o permiso negado → **búsqueda manual por RUT**.
  - **Encomiendas**: courier del maestro (sin texto libre), evidencia fotográfica por URL (D1) y retiro registrado.
  - **Contratistas**: empresa del maestro `contratistas` con motivo específico obligatorio; origen residente o administración; confirmación de ingreso sellada.
  - **Cierre de Turno**: protocolo anti-negligencia (preguntas críticas llegan en "SÍ"; sin descripción ≥20 caracteres + evidencia no persiste), checklist de instalaciones según la jornada reportada (editable por reemplazos), checklist de equipamiento de ronda, edición posterior con historial de cambios inmutable y **notificación a administración con copia al correo del trabajador** (`email_simulado`).
- **Accesos y Visitas (`/operaciones/accesos`)**:
  - Vista dedicada que reutiliza los paneles de Visitas y Contratistas extraídos de la bitácora como componentes compartidos (`components/pe/visitas-panel.tsx`, `contratistas-panel.tsx`) — mismo modelo y acciones del store (`bitacoraVisitasPE`, `ingresosContratistasPE`), sin tabs de turno, con selector de día propio y heading "Accesos y Visitas". Bitácora conserva sus tabs intactos (cero regresión).
- **Encomiendas (`/operaciones/paqueteria`)**:
  - Vista dedicada "Encomiendas" que reutiliza el panel de recepción/retiro extraído de la bitácora como componente compartido (`components/pe/encomiendas-panel.tsx`) — mismo modelo y acciones del store (`encomiendasPE`, `saveEncomiendaPE`/`registrarRetiroEncomiendaPE`/`removeEncomiendaPE`), courier normalizado por maestro, evidencia por URL (D1), retiro con identificación obligatoria y registro auditable (`PE_ENCOMIENDA_RECIBIDA/RETIRADA`). Bitácora conserva su tab Encomiendas intacto (cero regresión). Con esta ruta el menú Operaciones queda 100% habilitado (`RUTAS_PENDIENTES` vacío).
- **Proveedores y Servicios (`/operaciones/proveedores`)**:
  - Catálogo de empresas (RUT validado), calendario preventivo con alerta automática cuando el servicio vence dentro del horizonte configurado, libro de visitas técnicas (qué hizo el técnico y quién lo supervisó — cada visita reprograma la próxima fecha del ciclo) y directorio de emergencias leído del maestro `contactosEmergencia` de MA con enlace `tel:`.

## 💡 Tips de Oro

- **FKs por id, nunca texto libre**: la ficha rechaza cualquier `afpId`/`bancoId`/etc. inexistente y un maestro legal en uso no se puede borrar.
- **Anti-negligencia real**: dejar todo en "SÍ" sin escribir obliga a describir y adjuntar evidencia; cambiar a "NO" oculta los campos. El sistema valida el evento, no cronometra.
- **Trazabilidad de cierres**: editar un reporte appendea al historial interno; los cierres históricos no son eliminables (solo los del día o los TEST de qa-lab).
- **Flags de CF**: `notificarRegistroVisitas` y `notificarEncomiendas` deciden si el residente recibe la notificación simulada.
- **Proyección honesta**: sin feriados cargados en el mes no hay envío a FI; el sobrecosto viaja como estimación, nunca como egreso real (eso llega con PL).
- **Hora extra sin papeleo**: registrada en la ficha, se mira como KPI y se sugiere al liquidar; la decisión final la toma el administrador en PL, no hay circuito aparte de aprobación.
- **Preventivo cerrado**: registrar la visita técnica vinculada a una mantención avanza su próxima fecha según periodicidad; el proveedor con historial no es eliminable.
- **Auditoría**: `PE_START_SHIFT`, `PE_TASK_DONE`, `PE_VISITA_TECNICA`, `PE_ENCOMIENDA_RECIBIDA`, `PE_FICHA_SAVED`, `PE_VISITA_INGRESADA`, `PE_CONTRATISTA_INGRESADO`, `PE_CIERRE_TURNO`, `PE_CIERRE_EDITADO`, `PE_PROYECCION_ENVIADA`.

## 🔗 Dependencias

- **MP**: identidad del trabajador (no se duplica); la extensión laboral mínima sigue alimentando el cajón RRHH de AD.
- **MA**: maestros legales (AFP/salud/asignación familiar/bancos/mutualidades), `feriados`, `contactosEmergencia` y los operativos nuevos (`jornadas`, `couriers`, `contratistas`).
- **EF**: unidades destino de visitas/encomiendas/contratistas. **MT**: tareas del panel de monitoreo. **CF**: flags de notificación y jornada semanal estándar.
- **FI**: destino de la proyección de costos. **PL**: liquidaciones reales (ventana 8) — hoy queda `"pendiente"`.
- Notificaciones con `notify()` (**ST**, D2/D3); media por referencia (**D1**) para fotografías y evidencias.
