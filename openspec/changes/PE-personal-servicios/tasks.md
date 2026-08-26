# PE-personal-servicios Tasks

## 1. Store (ST) y esquemas

- [x] 1.1 Schemas: evolucionar `ExtensionLaboralSchema` (campos opcionales: `tipoContrato`, `afpId`, `saludId`, `asignacionFamiliarId`, `cargas`, `mutualidadId`, `bancoId`, `numeroCuenta`, `tipoCuenta`, `seguroComplementario`, `apv`, `fichaMedica`, `contactosEmergencia[]`, `jornadaBaseHoras`, `horasExtras[]`, `evaluaciones[]`); nuevos esquemas `BitacoraVisitaPE`, `EncomiendaPE`, `IngresoContratistaPE`, `ProveedorPE`, `MantencionPreventivaPE`, `VisitaTecnicaPE`, `CierreTurnoPE`, `ProyeccionPE`; maestros `AsignacionFamiliarSchema`, `JornadaSchema`, `CourierSchema`, `ContratistaSchema` en `MAESTRO_SCHEMAS`
- [x] 1.2 Seeds en `data/admin/maestros.ts`: `ASIGNACION_FAMILIAR` (tramos vigentes), `JORNADAS` (Mañana/Tarde/Noche), `COURIERS`, `CONTRATISTAS`; wiring en `MaestroCollections` + seedData
- [x] 1.3 Colecciones PE en store (rank 4) + acciones repository con `StoreResult`: bitácora visitas (`save/ingresar/remove`), encomiendas (`save/registrarRetiro/remove`), contratistas (`save/confirmar/remove`), proveedores (`save/remove` bloqueado con historial), mantenciones (`save/remove`), visitas técnicas (`registrarVisitaTecnicaPE` reprograma ciclo), cierres de turno (`cerrarTurnoPE/editarCierreTurnoPE/removeCierreTurnoPE`), proyecciones (`enviarProyeccionCostoFI`)
- [x] 1.4 Validaciones FK escritura en `savePersona` (afps/salud/asignación/banco/mutualidad existen) y bloqueos inversos en `removeMaestro` para maestros legales y operativos en uso
- [x] 1.5 Anti-negligencia y D1: `cerrarTurnoPE` exige descripción+evidencia si hubo incidencias; rechaza base64/Blob en evidencias; checklist snapshot por jornada reportada
- [x] 1.6 Notificaciones: cierre → notify administración + copia trabajador (`email_simulado`); visita ingresada/encomienda respetan flags CF; eventos AM `PE_*` del catálogo
- [x] 1.7 Helpers puros `lib/personal-utils.ts`: `proyeccionCoberturaMes`, `costoProyeccion`, `alertasMantencionesVencidas`, `estadoReporteDiario`, plantillas checklist por jornada
- [x] 1.8 Bump `STORE_VERSION` 21→22 con migrate aditivo (maestros nuevos si ausentes, colecciones vacías)
- [x] 1.9 Panel de monitoreo: `iniciarTurnoPE` (evento `PE_START_SHIFT`) y `completarTareaMonitoreoPE` (finaliza trabajo MT, evento `PE_TASK_DONE`)
- [x] 1.10 Tests `test/store-personal.test.ts`: ficha con FKs legales válidas/inválidas + maestro legal en uso no eliminable; feriados→proyección (cálculo y envío con PL pendiente); cierre turno→notify (administración+copia), incidencias sin descripción rechazadas, edición con historial; migrate v21→22; notificaciones CF opt-out

## 2. UI

- [x] 2.1 `/personas/personal/page.tsx`: pestañas Trabajadores (ficha integral con selects desde maestros legales, ficha médica, contactos, horas extra y evaluaciones) / Feriados y Proyección (CRUD feriados + importación anual + proyección mes con envío a FI) / Panel de Monitoreo
- [x] 2.2 `/operaciones/bitacora/page.tsx`: Reporte Diario (tarjetas jornada Informado/No Informado + novedades por día), Visitas (pre-agenda + llegada sin aviso + marcar ingresada + escaneo DNI simulado), Encomiendas (maestro couriers + evidencia URL + retiro), Contratistas (motivo obligatorio + origen agendamiento), Cierre de Turno (protocolo anti-negligencia + checklists + edición con historial)
- [x] 2.3 `/operaciones/proveedores/page.tsx`: Catálogo CRUD, Mantenciones preventivas con alertas ≤5 días, Libro de visitas técnicas, Directorio de emergencias (lectura `contactosEmergencia` con tel:)
- [x] 2.4 Sidebar: entrada "Proveedores y Servicios" bajo Operaciones

## 3. QA Lab

- [x] 3.1 Fase 15 PE con seeds TEST: trabajador TEST con AFP/salud/banco válidos (extensión laboral profunda), feriado TEST + proyección enviada TEST (PL pendiente), visita TEST agendada→ingresada, encomienda TEST con retiro, contratista TEST ingresado, mantención TEST vencida + visita técnica que reprograma, cierre de turno TEST con incidencias→notify verificado; limpieza inversa extendida antes de MP/TU

## 4. Validación

- [x] 4.1 tsc + eslint 0 errores + suite vitest verde completa
- [x] 4.2 openspec validate --all sin errores
