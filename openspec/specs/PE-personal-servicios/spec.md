# PE-personal-servicios Specification

## Purpose
Supervisar los recursos humanos y técnicos que mantienen la operativa diaria de la comunidad: ficha integral del trabajador con FKs a maestros legales, proyección operativa sobre feriados con costos enviados a FI, proveedores externos con mantenciones preventivas y visitas técnicas, directorio de emergencias, bitácora digital de conserjería (visitas/encomiendas/contratistas), reporte diario y protocolo de cierre de turno notificado. Fuente de verdad: `Data/NSGC/docs/especificaciones/PE - Personal y Servicios.md`.
## Requirements
### Requirement: Ficha Integral del Trabajador
El sistema SHALL actuar como repositorio maestro de identidad y condiciones laborales del personal interno, profundizando `datosLaborales` sin duplicar la extensión mínima consumida por AD (`cargo`, `afp`, `prevision`, `fechaIngreso` se preservan). La ficha SHALL gestionarse mediante `savePersona` e SHALL incluir: tipología contractual (`indefinido`|`plazo_fijo`|`honorarios`), configuración previsional referenciando por id los maestros legales de MA (`afpId` → `maestros.afps`, `saludId` → `maestros.previsionesSalud`, tramo opcional `asignacionFamiliarId` → `maestros.asignacionFamiliar` con número de cargas), gestión bancaria (`bancoId` → `maestros.bancos`, número y tipo de cuenta), seguridad y salud (ficha médica con medicamentos/alergias/condiciones y contactos de emergencia propios del trabajador), control de asistencia y desempeño (jornada base asociada en horas, registro de horas extras y evaluaciones periódicas). La identidad (nombres, RUT, email, teléfono, dirección, fotografía) proviene del Maestro de Personas (MP) y no se duplica. Toda FK legal SHALL validarse en escritura y bloquear la eliminación del maestro referenciado mientras esté en uso.

#### Scenario: Ficha con FKs a maestros legales
- **WHEN** se guarda una ficha con `afpId`, `saludId` y `bancoId` existentes en los maestros
- **THEN** persiste dentro de `datosLaborales` de la persona y registra el evento `PE_FICHA_SAVED`

#### Scenario: FK legal inexistente rechazada
- **WHEN** se guarda una ficha con `afpId` que no existe en `maestros.afps`
- **THEN** retorna `{ok:false}` indicando el campo huérfano y no muta la persona

#### Scenario: Maestro legal en uso no eliminable
- **WHEN** se intenta eliminar una AFP referenciada por al menos una ficha de trabajador
- **THEN** retorna `{ok:false}` citando las fichas asociadas

#### Scenario: Horas extras y evaluaciones auditadas
- **WHEN** se registran horas extras o una evaluación de desempeño sobre un trabajador con ficha
- **THEN** se acumulan en su historial con evento AM correspondiente

### Requirement: Maestro de Feriados y Proyección Operativa
El sistema SHALL administrar el calendario anual de feriados nacionales/regionales mediante el maestro `feriados` de MA (con flag irrenunciable) y SHALL proyectar la cobertura cruzando los feriados de un mes con las jornadas rotativas: para cada mes consultado reporta qué días son feriados y cuántos trabajadores de reemplazo (parches) se requieren para cubrir los descansos legales. La estimación de costos SHALL calcular la proyección de sobrecosto operativo (reemplazos × costo por parche + día extra del personal de planta × monto) y `enviarProyeccionCostoFI(mesAnio, parametros)` MUST materializarla como registro en `proyeccionesPE` con notificación a la administración, evento `PE_PROYECCION_ENVIADA` y `liquidacionPLReferencia = "pendiente"` hasta que PL (ventana 8) materialice las liquidaciones.

#### Scenario: Proyección de cobertura del mes
- **WHEN** septiembre tiene 2 feriados sembrados y se consulta la proyección del mes
- **THEN** el reporte identifica ambos días y calcula los reemplazos necesarios por jornada rotativa

#### Scenario: Proyección enviada a Finanzas con referencia pendiente
- **WHEN** la administración envía la proyección de costos de un mes con montos de parche y día extra
- **THEN** queda registrada en `proyeccionesPE` con el costo estimado, notificación email_simulado a administración, evento `PE_PROYECCION_ENVIADA` y `liquidacionPLReferencia: "pendiente"`

### Requirement: Gestión de Proveedores Externos y Mantenciones Preventivas
El sistema SHALL administrar el catálogo de empresas de servicios (ascensores, bombas, CCTV, etc.) con RUT, contacto y rubro mediante `saveProveedorPE`/`removeProveedorPE`; la eliminación SHALL bloquearse con mantenciones o visitas técnicas asociadas. El calendario de mantenciones preventivas SHALL registrarse con periodicidad mensual y próxima fecha, alertando cuando el servicio vence dentro del horizonte de alerta (por defecto 5 días); `registrarVisitaTecnicaPE` SHALL registrar cada visita técnica (técnico, trabajo realizado, supervisor) en el libro de visitas técnicas y, si está vinculada a una mantención preventiva, recalcular la próxima fecha según su periodicidad.

#### Scenario: Alerta de mantención por vencer
- **WHEN** una mantención preventiva vence dentro de los próximos 5 días
- **THEN** aparece destacada en el calendario como alerta automática

#### Scenario: Visita técnica cierra ciclo preventivo
- **WHEN** se registra la visita técnica de la mantención de ascensores con periodicidad mensual
- **THEN** el libro registra la visita con evento `PE_VISITA_TECNICA` y la mantención pasa a vencer en el siguiente ciclo

#### Scenario: Proveedor con historial no eliminable
- **WHEN** se intenta eliminar un proveedor con mantenciones o visitas técnicas asociadas
- **THEN** retorna `{ok:false}` citando los registros asociados

### Requirement: Directorio de Emergencias y Utilidad Pública
El sistema SHALL exponer el directorio de emergencias consumiendo el maestro `contactosEmergencia` de MA (sin duplicar colección), categorizado en Servicios de Urgencia y Servicios Técnicos de Urgencia, con nombre/descripción, teléfono (enlazado para llamada directa desde móviles) y sitio web cuando aplique, accesible tanto para conserjería como para residentes.

#### Scenario: Directorio categorizado con llamada directa
- **WHEN** un usuario abre el directorio de emergencias
- **THEN** ve los contactos agrupados por categoría con enlace `tel:` al número registrado en el maestro

### Requirement: Bitácora Digital de Conserjería
El sistema SHALL reemplazar el libro físico de novedades con controles auditables en tiempo real:
- **Visitas**: registro con nombre, DNI, patente opcional, unidad/residente destino, fecha, jornada (selector ligado al maestro `jornadas`) y notas; soporta pre-agendamiento (residente o administración agenda y el conserje marca "Ingresada" sellando la hora) y llegada sin aviso (registro manual); incluye escaneo DNI simulado local que autocompleta identidad placeholder.
- **Encomiendas y delivery**: recepción con maestro `couriers` (selector normalizado, sin texto libre), destinatario/unidad, evidencia fotográfica por referencia D1 (metadatos + URL, jamás base64/Blob) y retiro registrado con retirador y fecha.
- **Contratistas**: ingreso ligado al maestro `contratistas` con motivo específico obligatorio, unidad destino y origen del agendamiento (residente particular o administración).

Las notificaciones a residentes SHALL respetar los flags de CF (`notificarRegistroVisitas`, `notificarEncomiendas`) usando canal `email_simulado`.

#### Scenario: Pre-agendamiento marcado como ingresada
- **WHEN** el residente agenda una visita y el conserje la marca "Ingresada"
- **THEN** la visita queda con hora de ingreso sellada, evento `PE_VISITA_INGRESADA` y notificación al residente destino si el flag CF lo permite

#### Scenario: Encomienda recibida con evidencia
- **WHEN** se registra una encomienda de un courier del maestro con foto URL
- **THEN** persiste con evento `PE_ENCOMIENDA_RECIBIDA` y notifica al destinatario según `notificarEncomiendas`; un payload base64 es rechazado

#### Scenario: Contratista sin motivo rechazado
- **WHEN** se registra un ingreso de contratista sin detallar el motivo específico
- **THEN** retorna `{ok:false}` y no muta la bitácora

### Requirement: Dashboard Operativo (Reporte Diario)
El sistema SHALL ofrecer a la operación un reporte diario con tarjetas de jornada (Mañana/Tarde/Noche) que muestran el estado Informado/No Informado según cierres de turno registrados para el día seleccionado (hoy por defecto, con historial de días anteriores accesible), más el resumen de novedades del día (visitas ingresadas, encomiendas recibidas, contratistas ingresados) presentado como tarjetas con detalle al hacer clic.

#### Scenario: Tarjetas de jornada del día
- **WHEN** la conserjería abre el Reporte Diario tras cerrar solo el turno de noche
- **THEN** la tarjeta Noche aparece Informado y Mañana/Tarde No Informado para la fecha seleccionada

#### Scenario: Historial de día anterior
- **WHEN** se selecciona un día anterior en el reporte diario
- **THEN** se muestran las jornadas y novedades correspondientes a esa fecha sin alterar el día actual

### Requirement: Protocolo de Cierre de Turno (Reporte Obligatorio)
El sistema SHALL validar el evento de reporte (sin cronometraje) mediante `cerrarTurnoPE`: identificación del turno (fecha, hora y jornada reportada editable para reemplazos, ligada al maestro `jornadas`), trabajador responsable existente en MP, novedades generales, reporte de incidencias con lógica anti-negligencia (las preguntas críticas llegan marcadas "SÍ" en la UX; el guardado MUST exigir descripción y evidencia D1 cuando hubo incidencias), checklist de estado de instalaciones basado en la jornada reportada y checklist de equipamiento de ronda (celular, PC, llaves maestras), ambos snapshot en el registro. El reporte cerrado MAY editarse mediante `editarCierreTurnoPE`, que SHALL preservar un historial de cambios inmutable dentro del registro. Al enviar, el sistema MUST notificar a la administración con el resumen del reporte y dejar copia dirigida al correo del trabajador (canal `email_simulado`), auditando `PE_CIERRE_TURNO` (y `PE_CIERRE_EDITADO` al editar).

#### Scenario: Incidencias sin descripción rechazadas
- **WHEN** se envía un cierre con incidencias marcadas "SÍ" pero sin descripción ni evidencia
- **THEN** retorna `{ok:false}` exigiendo descripción y evidencia, sin registrar el cierre

#### Scenario: Cierre notifica a administración con copia al trabajador
- **WHEN** se envía un cierre de turno válido
- **THEN** `notify()` crea notificación a administración con el resumen y una copia email_simulado dirigida al trabajador, con eventos en AM

#### Scenario: Edición preserva trazabilidad
- **WHEN** se edita un cierre ya enviado cambiando las novedades
- **THEN** el registro conserva su historial de cambios acumulado y emite `PE_CIERRE_EDITADO`

### Requirement: Panel de Monitoreo del Personal
El sistema SHALL ofrecer a la vista administrador el listado en tiempo real del personal de turno y sus tareas pendientes: `iniciarTurnoPE` marca el inicio del turno del trabajador (evento `PE_START_SHIFT`), el panel muestra qué trabajadores informaron turno por jornada del día y lista las tareas de mantenimiento abiertas asignadas a cada trabajador; `completarTareaMonitoreoPE` cierra la tarea desde el panel emitiendo `PE_TASK_DONE`.

#### Scenario: Listado de personal de turno
- **WHEN** dos trabajadores inician turno en la mañana y uno completa su tarea asignada
- **THEN** el panel los muestra informados en la jornada mañana y la tarea desaparece de pendientes con `PE_TASK_DONE`

### Requirement: Integración con Auditoría y Métricas (AM)
El módulo SHALL emitir `PE_START_SHIFT`, `PE_TASK_DONE`, `PE_VISITA_TECNICA`, `PE_ENCOMIENDA_RECIBIDA`, `PE_FICHA_SAVED`, `PE_VISITA_INGRESADA`, `PE_CONTRATISTA_INGRESADO`, `PE_CIERRE_TURNO`, `PE_CIERRE_EDITADO` y `PE_PROYECCION_ENVIADA` como eventos inmutables. Data cuantificable: horas extra registradas, tareas completadas, visitas técnicas, encomiendas por turno, cierres enviados y costo proyectado. Métricas derivables: porcentaje de cumplimiento del plan de mantenimiento preventivo, volumen de encomiendas gestionadas por turno y jornadas informadas vs no informadas.

#### Scenario: Métrica de cumplimiento preventivo
- **WHEN** existen mantenciones preventivas con y sin visita técnica en su ciclo vigente
- **THEN** el porcentaje de cumplimiento del plan se deriva de las colecciones sin almacenarse

### Requirement: Vista Accesos y Visitas — ruta dedicada con paneles reutilizados de bitácora
El sistema SHALL proveer la vista `/operaciones/accesos` como ruta dedicada "Accesos y Visitas" que renderiza los paneles de control de visitas y de contratistas reutilizando los componentes extraídos de `/operaciones/bitacora`, con el mismo modelo de datos y acciones del store (`bitacoraVisitasPE`, `ingresosContratistasPE`, `saveBitacoraVisitaPE`/`ingresarBitacoraVisitaPE`/`removeBitacoraVisitaPE`/`saveIngresoContratistaPE`/`confirmarIngresoContratistaPE`/`removeIngresoContratistaPE`), sin cambios de esquema ni bump de `STORE_VERSION`.

#### Scenario: Acceso a la vista Accesos y Visitas
- **WHEN** el usuario navega a `/operaciones/accesos`
- **THEN** el sistema muestra el heading "Accesos y Visitas" (o "Accesos y Visitas — Bitácora") y descripción de control de accesos
- **AND** renderiza el panel de visitas (form con Nombre *, DNI *, Unidad destino, jornada, switch Pre-agendada y botón "Registrar visita") y el panel de contratistas (Empresa *, motivo *, jornada, agendado por, unidad) con sus tablas del día seleccionado.

#### Scenario: Paneles reutilizados sin divergencia de comportamiento
- **WHEN** la vista carga
- **THEN** los paneles SHALL derivar del mismo store que bitácora (colecciones `bitacoraVisitasPE` e `ingresosContratistasPE`) y usar las mismas validaciones y acciones (p. ej. motivo contratista ≥5 chars, nombre+DNI obligatorios, origenAgenda/estado)
- **AND** bitácora SHALL seguir renderizando esos mismos componentes en sus tabs "Visitas" y "Contratistas" sin cambio de comportamiento (suite `bitacora.spec.ts` permanece verde).

#### Scenario: Selector de día y filtrado
- **WHEN** el usuario cambia el selector de día (input date)
- **THEN** las tablas "Control del día seleccionado" e "Ingresos del día" SHALL filtrar por `fecha === diaReporte` igual que en bitácora.

#### Scenario: Skeleton durante hidratación
- **WHEN** `hasHydrated === false`
- **THEN** la vista muestra skeleton (`animate-pulse`) en lugar de los paneles.

#### Scenario: Navegación lateral habilitada
- **WHEN** la vista existe
- **THEN** `/operaciones/accesos` ya no pertenece a `RUTAS_PENDIENTES` en `AppSidebar` y el item "Accesos y Visitas" es navegable sin badge "Próximamente".

#### Scenario: Ruta dedicada distinta de bitácora
- **WHEN** el usuario visita `/operaciones/bitacora` y `/operaciones/accesos`
- **THEN** ambas rutas existen y son distintas (bitácora con tabs vs accesos con layout propio sin tabs de turno).

