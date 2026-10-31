# PE-personal-servicios

## Why

El módulo PE del NSGC convierte la extensión laboral mínima (`PersonaSchema.datosLaborales`, listada por el cajón RRHH de AD) en el repositorio maestro de identidad y condiciones laborales del personal, y digitaliza la operación de conserjería: bitácora auditable (visitas/encomiendas/contratistas), protocolo de cierre de turno con notificación a administración (escenario ya especificado en ST "Notificación de Cierre de Turno (PE)"), proveedores externos con mantenciones preventivas y proyección operativa sobre los feriados legales de MA. Es la ventana 7 (Sesión 6) de la serie NSGC.

## What Changes

- Nueva capability **PE-personal-servicios**: ficha integral del trabajador (tipología contractual, configuración previsional con AFP/Fonasa-Isapre/tramo de asignación familiar, datos bancarios vía maestro de bancos, ficha médica, contactos de emergencia, jornada base, horas extras y evaluaciones de desempeño), maestro de feriados con proyección de cobertura y estimación de costos enviada a FI, gestión de proveedores externos (catálogo, calendario preventivo, libro de visitas técnicas), directorio de emergencias (consume `maestros.contactosEmergencia` de MA), bitácora digital de conserjería (visitas con pre-agendamiento, encomiendas con maestro courier y evidencia D1, contratistas con motivo obligatorio), dashboard operativo "Reporte Diario" y protocolo de cierre de turno con checklist por jornada, historial de ediciones y notificación inmediata.
- Profundización SIN duplicar: `ExtensionLaboralSchema` evoluciona con campos opcionales (`tipoContrato`, `afpId`, `saludId`, `asignacionFamiliarId`, `cargas`, `mutualidadId`, `bancoId`, `numeroCuenta`, `tipoCuenta`, `seguroComplementario`, `apv`, `fichaMedica`, `contactosEmergencia`, `jornadaBaseHoras`, `horasExtras[]`, `evaluaciones[]`). Los campos mínimos existentes (`cargo`, `afp`, `prevision`, `fechaIngreso`) se preservan para que AD siga funcionando; las FKs nuevas apuntan a los maestros legales por id (nunca texto libre).
- Cierra el pendiente D3/MA: colección legal `asignacionFamiliar` (tramos por carga) sembrada y CRUD vía patrón repository; nuevos maestros operativos `jornadas` (Mañana/Tarde/Noche), `couriers` (normaliza encomiendas) y `contratistas` (empresas autorizadas).
- Colecciones nuevas en ST (rank 4): `bitacoraVisitasPE`, `encomiendasPE`, `ingresosContratistasPE`, `proveedoresPE`, `mantencionesPreventivasPE`, `visitasTecnicasPE`, `cierresTurnoPE`, `proyeccionesPE`.
- Acciones repository: `savePersona` (validación FKs legales extendida), `iniciarTurnoPE`, `completarTareaMonitoreoPE`, `saveBitacoraVisitaPE`/`ingresarBitacoraVisitaPE`/`removeBitacoraVisitaPE`, `saveEncomiendaPE`/`registrarRetiroEncomiendaPE`/`removeEncomiendaPE`, `saveIngresoContratistaPE`/`confirmarIngresoContratistaPE`/`removeIngresoContratistaPE`, `saveProveedorPE`/`removeProveedorPE`, `saveMantencionPE`/`removeMantencionPE`, `registrarVisitaTecnicaPE`, `cerrarTurnoPE`/`editarCierreTurnoPE`/`removeCierreTurnoPE`, `enviarProyeccionCostoFI`. Helpers puros en `lib/personal-utils.ts` (`proyeccionCoberturaMes`, `alertasMantencionesVencidas`, `estadoReporteDiario`). Todas retornan `StoreResult`.
- Notificaciones simuladas (D2): cierre de turno → `notify()` a administración con copia al correo del trabajador (`email_simulado`, canal simulado); visita ingresada y encomienda recibida respetan flags CF `notificarRegistroVisitas`/`notificarEncomiendas`.
- Referencia pendiente a PL: `proyeccionesPE.liquidacionPLReferencia = "pendiente"` hasta la ventana 8.
- Eventos AM: `PE_START_SHIFT`, `PE_TASK_DONE`, `PE_VISITA_TECNICA`, `PE_ENCOMIENDA_RECIBIDA` (§4 NSGC) más `PE_FICHA_SAVED`, `PE_VISITA_INGRESADA`, `PE_CONTRATISTA_INGRESADO`, `PE_CIERRE_TURNO`, `PE_CIERRE_EDITADO`, `PE_PROYECCION_ENVIADA`.
- Bump `STORE_VERSION` 21 → 22 con migrate aditivo (maestros legales/operativos nuevos + 8 colecciones vacías).
- UI: `/personas/personal` (pestañas Trabajadores / Feriados y Proyección / Panel de Monitoreo — reemplaza el placeholder de AD), `/operaciones/bitacora` (Reporte Diario / Visitas / Encomiendas / Contratistas / Cierre de Turno) y `/operaciones/proveedores` (Catálogo / Mantenciones / Visitas Técnicas / Directorio Emergencias); rutas ya previstas en sidebar salvo proveedores.

## Capabilities

### New Capabilities
- `PE-personal-servicios`: Fichas integrales de trabajadores con FKs a maestros legales, feriados con proyección de cobertura/costos, servicios externos con mantenciones preventivas, bitácora de conserjería y protocolo de cierre de turno con notificación.

### Modified Capabilities
- `MA-maestros-administrativos`: completa los maestros legales (seed `asignacionFamiliar`) y agrega los maestros operativos de PE (`jornadas`, `couriers`, `contratistas`) consumidos por id.
- `ST-capa-datos-persistente`: colecciones operacionales de PE en rank 4, bump v22 aditivo, validación FK en escritura de fichas y materialización del escenario "Notificación de Cierre de Turno".
- `AM-auditoria-metricas`: catálogo de eventos operativos PE y métricas derivadas (% cumplimiento plan preventivo, volumen de encomiendas por turno).
- `RP-roles-permisos`: matriz de permisos del módulo PE (administración gestiona RRHH; conserjería registra bitácora y cierra su turno; residente agenda visitas/contratistas y consulta directorio de emergencias).
- `UI-navegacion-lateral`: nueva entrada "Proveedores y Servicios" (`/operaciones/proveedores`) bajo Operaciones.

## Impact

- Código: `k0mp4ss_fe/apps/web/lib/schemas.ts` (+8 esquemas de colección, evolución opcional de `ExtensionLaboralSchema`, +4 maestros), `k0mp4ss_fe/apps/web/lib/store.ts` (+8 colecciones, +20 acciones, migrate v22), nuevo `k0mp4ss_fe/apps/web/lib/personal-utils.ts` (helpers puros), `k0mp4ss_fe/apps/web/data/admin/maestros.ts` (seeds `ASIGNACION_FAMILIAR`, `JORNADAS`, `COURIERS`, `CONTRATISTAS`), páginas nuevas `/personas/personal`, `/operaciones/bitacora`, `/operaciones/proveedores`, sidebar, qa-lab fase 15.
- Specs: nueva carpeta `openspec/specs/PE-personal-servicios/`; deltas MODIFIED sobre MA/ST/AM/RP/UI-navegacion-lateral.
- Depende de: MP (identidad del trabajador), MA (afps/previsionesSalud/bancos/contactosEmergencia + nuevos maestros), EF (unidades destino de bitácora), MT (tareas del panel de monitoreo), CF (flags de notificación, jornada semanal estándar), FI (destino de la proyección de costos), ST (`notify()`).
- Referencia pendiente: liquidaciones/remuneraciones (PL) llegan en la ventana 8; la proyección queda marcada `"pendiente"`.
- Tests afectados: nueva suite `test/store-personal.test.ts`; sin cambios en suites previas (evolución de schema es aditiva/opcional).
