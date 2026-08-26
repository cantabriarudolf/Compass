# PE-personal-servicios — Design

## Context

`ExtensionLaboralSchema` (`k0mp4ss_fe/apps/web/lib/schemas.ts:96`) ya trae el mínimo `{id, cargo, afp, prevision, fechaIngreso}` que AD lista en su cajón RRHH (`/admin/gestion` lee `.cargo/.afp/.prevision/.fechaIngreso`). Los maestros legales `afps`, `previsionesSalud`, `mutualesCajas`, `bancos`, `feriados` y `contactosEmergencia` están sembrados desde D3/D4 (`data/admin/maestros.ts`) con CRUD genérico `saveMaestro`; falta `asignacionFamiliar`. El escenario ST "Notificación de Cierre de Turno (PE)" ya especifica la notificación vía `notify()`. CF ya expone flags `notificarRegistroVisitas`/`notificarEncomiendas`. MT provee las tareas del panel de monitoreo (`trabajosMT.responsablePersonaId`). Restricción D1 manda para fotografías, evidencias y ficha médica: metadatos + URL, jamás base64/Blob.

## Goals / Non-Goals

**Goals:**
- Ficha integral 1:1 con la persona: profundizar `datosLaborales` con campos opcionales y FKs por id a los maestros legales, sin duplicar identidad (MP) ni romper a AD.
- Operación de conserjería auditable: bitácora de visitas/encomiendas/contratistas normalizada por maestros, reporte diario derivado y cierre de turno como evento validado con notificación.
- Servicios externos con ciclo preventivo completo: catálogo → mantención periódica → visita técnica que reprograma.
- Proyección operativa determinista sobre feriados MA, enviada a FI con marcador `"pendiente"` hacia PL.

**Non-Goals:**
- Liquidaciones/remuneraciones y cálculo de sueldos (PL, ventana 8): solo queda `liquidacionPLReferencia:"pendiente"` en proyecciones.
- Escaneo DNI real con cámara: se implementa flujo simulado local (placeholder hasta SG/hardware).
- Asistencia cronometrada o control horario: "el sistema no cronometra tiempo de uso, solo valida el evento de reporte".
- Evaluación psicolaboral avanzada, turnos rotativos configurables ni planificación de parrillas semestrales.

## Decisions

- **Profundización aditiva de `ExtensionLaboralSchema`** (colección nueva NO): campos opcionales `tipoContrato`, `afpId`, `saludId`, `asignacionFamiliarId`, `cargas`, `mutualidadId`, `bancoId`, `numeroCuenta`, `tipoCuenta`, `seguroComplementario`, `apv`, `fichaMedica`, `contactosEmergencia[]`, `jornadaBaseHoras`, `horasExtras[]`, `evaluaciones[]`. Razón: la ficha es 1:1 con la persona y duplicar en una colección paralela crearía dos fuentes de verdad; los stores persistidos siguen validando porque todo lo nuevo es opcional. `savePersona` extiende su validación FK (RG escritura) y bloquea `removeMaestro` de afp/salud/asignación/banco referenciados.
- **Maestros operativos nuevos en MA**: `jornadas` (seed Mañana/Tarde/Noche), `couriers` (Chilexpress, Starken, PedidosYa, Uber Flash, Correos Chile) y `contratistas` (empresas autorizadas genéricas). La jornada es maestro y no enum porque la spec NSGC exige "selector ligado a un maestro"; el checklist de instalaciones del cierre se deriva de la jornada reportada mediante plantillas canónicas por id (`j-manana/j-tarde/j-noche`) que se snapshot-ean en cada cierre.
- **8 colecciones rank 4**: `bitacoraVisitasPE`, `encomiendasPE`, `ingresosContratistasPE`, `proveedoresPE`, `mantencionesPreventivasPE`, `visitasTecnicasPE`, `cierresTurnoPE`, `proyeccionesPE`. Sin dependencias cruzadas entre sí salvo proveedor→mantención→visita técnica. Bump v21→v22 aditivo (migrate siembra maestros ausentes; colecciones entran vacías).
- **Anti-negligencia en dos capas**: la UX llega con "SÍ" preseleccionado (UI); el store valida duro — `incidencias.hubo=true` exige descripción ≥20 chars + evidencia D1. Así el atajo "dejar todo en SÍ sin escribir" no persiste.
- **Checklist snapshot, no referencia viva**: instalaciones/equipamiento se guardan como array `{item, ok}` copiado al guardar; editar el checklist base nunca reescribe cierres históricos (auditabilidad).
- **Edición de cierres con historial inmutable dentro del registro**: `editarCierreTurnoPE` appendea `{fecha, resumenCambios}` a `historialCambios[]`; sin acciones de borrado de entradas históricas. `removeCierreTurnoPE` existe solo para limpieza QA (prefijo test-) y corrección inmediata administrativa, auditada.
- **Reporte diario derivado**: tarjetas Informado/No Informado = existencia de `cierresTurnoPE` para `(fecha, jornadaReportada)`; novedades = conteos de bitácora por fecha. Nada se almacena del dashboard.
- **Panel de monitoreo sobre entidades existentes**: "turno iniciado" = evento `PE_START_SHIFT` de hoy en `eventos` (el sistema no cronometra); tareas pendientes = `trabajosMT` con estado planificado/en_curso y `responsablePersonaId` con datosLaborales. `completarTareaMonitoreoPE` finaliza el trabajo MT (reusa su máquina de estados) emitiendo `PE_TASK_DONE`.
- **Proyección de cobertura como helper puro** (`lib/personal-utils.ts`): dado mes AAAA-MM, feriados del mes y personal activo con jornada base, calcula días feriados, reemplazos sugeridos (1 parche por jornada de conserjería por feriado irrenunciable, parametrizable) y costo estimado (`reemplazos × costoParche + planta × costoDiaExtra`). `enviarProyeccionCostoFI` persiste el resultado, notifica a administración y marca `liquidacionPLReferencia:"pendiente"`.
- **Notificaciones D2**: cierre → `notify({destinatarioRol:"administracion"})` + copia `{destinatarioRol:"personal", destinatarioPersonaId:trabajadorId}` (correo registrado en la ficha); visita ingresada/encomienda respetan flags CF y notifican al residente destino/destinatario.
- **Escaneo DNI simulado**: diálogo que genera identidad placeholder válida (RUT DV correcto) documentando que la lectura real de cédula llega con backend/hardware (SG).
- **Rutas**: `/personas/personal` (RRHH: Trabajadores / Feriados y Proyección / Monitoreo), `/operaciones/bitacora` (Reporte Diario / Visitas / Encomiendas / Contratistas / Cierre de Turno), `/operaciones/proveedores` nueva entrada en sidebar bajo Operaciones.

## Risks / Trade-offs

- [datosLaborales crece] La extensión concentra muchos dominios → aceptado: son opcionales, zod valida forma y el tamaño sigue siendo texto plano pequeño (sin media embebida).
- [Checklist plantillas fijas por id de jornada] Renombrar la jornada no cambia plantillas → aceptado: el id es estable; una futura parametrización por CF puede sustituirlas sin tocar cierres pasados.
- [Proyección con fórmula simple] No modela rotativos reales ni topes legales → aceptado: NSGC pide anticipación y estimación; PL traerá el cálculo remuneracional real en ventana 8.
- [removeCierreTurnoPE permite borrado] Tensión con auditoría → mitigado: exige prefijo `test-` o fecha del día en curso y siempre registra evento AM.
- [QA-lab más largo] Fase PE depende de personas/unidades TEST previas → patrón ya usado: prerrequisitos encadenados dentro de `runFase`.

## Migration Plan

Aditiva v21→v22: maestros nuevos se siembran si ausentes (migrate + sanitización VAL-006 ya cubren claves faltantes de `MaestroCollections`), colecciones entran vacías, `datosLaborales` extendido valida datos previos sin transformación. Sin limpieza legacy.

## Open Questions

(ninguna)
