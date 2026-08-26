# 🗂️ 39 - MK - Data Dump Personal y Servicios

> Dump resuelto de las colecciones de la **Sesión 6 NSGC** (store v22). Los maestros operativos nuevos (`asignacionFamiliar`, `jornadas`, `couriers`, `contratistas`) se siembran desde `data/admin/maestros.ts` vía migrate aditivo v21→v22; las 8 colecciones operativas (`bitacoraVisitasPE`, `encomiendasPE`, `ingresosContratistasPE`, `proveedoresPE`, `mantencionesPreventivasPE`, `visitasTecnicasPE`, `cierresTurnoPE`, `proyeccionesPE`) nacen vacías — se llenan con el uso real del módulo. La ficha integral del trabajador no es colección nueva: profundiza `datosLaborales` dentro de `personas` (dump histórico en `30 - MK - Data Dump Comunidad.md`).

## 👤 Extensión laboral profunda (dentro de `Persona.datosLaborales`)

Campos nuevos opcionales (los mínimos `cargo/afp/prevision/fechaIngreso` se conservan):

| Campo | Tipo | Nota |
|-------|------|------|
| `tipoContrato` | indefinido \| plazo_fijo \| honorarios | Tipología contractual |
| `afpId` / `saludId` / `asignacionFamiliarId` / `mutualidadId` / `bancoId` | FK maestros MA | Validados en escritura; bloquean `removeMaestro` |
| `cargas` | int ≥0 | Con tramo de asignación familiar |
| `numeroCuenta` / `tipoCuenta` | string / corriente\|vista\|ahorro | Gestión bancaria |
| `seguroComplementario` / `apv` | string / boolean | Previsional complementaria |
| `fichaMedica` | {medicamentos?, alergias?, condiciones?} | Seguridad y salud |
| `contactosEmergencia[]` | {id, nombre, telefono, relacion?} | Propios del trabajador |
| `jornadaBaseHoras` | number >0 ≤80 | Jornada base asociada |
| `horasExtras[]` | {id, fecha, horas >0, motivo} | Auditadas `PE_HORA_EXTRA_REGISTRADA` |
| `evaluaciones[]` | {id, fecha, puntaje 1-7, comentarios?} | Auditadas `PE_EVALUACION_REGISTRADA` |

## 📅 `maestros.asignacionFamiliar` (seed, 4 registros)

**ID pattern:** `asf-<letra del tramo>`.

| id | nombre | monto ($) | rangoRentas |
|----|--------|-----------|-------------|
| `asf-a` | Tramo A | 20.622 | Hasta $658.409 |
| `asf-b` | Tramo B | 30.314 | $658.410 – $963.479 |
| `asf-c` | Tramo C | 47.604 | $963.480 – $1.502.368 |
| `asf-d` | Tramo D | 61.590 | $1.502.369 o más |

> Montos de referencia vigentes al seed; MA los mantiene actualizables con `saveMaestro`.

## 🕐 `maestros.jornadas` (seed, 3 registros)

**ID pattern:** `j-<slug>` (kebab-case).

| id | nombre |
|----|--------|
| `j-manana` | Mañana |
| `j-tarde` | Tarde |
| `j-noche` | Noche |

Usado por visitas, contratistas y cierre de turno (checklist de instalaciones derivado por id: `j-manana` 4 ítems, `j-tarde` 3, `j-noche` 4 + equipamiento común de 3 ítems).

## 📦 `maestros.couriers` (seed, 6 registros)

**ID pattern:** `cour-<slug>`.

| id | nombre |
|----|--------|
| `cour-chilexpress` | Chilexpress |
| `cour-starken` | Starken |
| `cour-pedidosya` | PedidosYa |
| `cour-uberflash` | Uber Flash |
| `cour-correos` | Correos Chile |
| `cour-otro` | Otro Courier |

## 🔧 `maestros.contratistas` (seed, 4 registros)

**ID pattern:** `cont-<slug>`.

| id | nombre | rubro | telefono |
|----|--------|-------|----------|
| `cont-gasfiteria` | Gasfitería Don Pedro | Gasfitería | +56 9 6000 1001 |
| `cont-electricidad` | Electricidad Sur Ltda. | Electricidad | +56 9 6000 1002 |
| `cont-jardineria` | Jardines Verdes SpA | Jardinería | +56 9 6000 1003 |
| `cont-mudanzas` | Mudanzas Rápidas | Mudanzas | +56 9 6000 1004 |

## 📋 Colecciones operativas (inician vacías)

| Colección | ID pattern | Campos clave / reglas |
|-----------|-----------|----------------------|
| `bitacoraVisitasPE` | `pe-vis-*` | {fecha, nombre, dni, patente?, unidadId?/destinoPersonaId?, jornadaId FK, origenAgenda pre_agendada\|sin_aviso, estado agendada→ingresada (+horaIngreso sellada), notas}; ingresada no eliminable |
| `encomiendasPE` | `pe-enc-*` | {courierId FK, destinatario/unidad, descripcionPaquete?, evidencia D1 {nombre/tipoMime/tamanoKB/url}, fechaRecepcion, estado recibida→retirada (+retiro)}; base64 rechazado |
| `ingresosContratistasPE` | `pe-cont-*` | {contratistaId FK, motivo ≥5 chars obligatorio, unidadId?, jornadaId FK, agendadoPor residente\|administracion, personaAgendaId?, estado agendado→ingresado} |
| `proveedoresPE` | `prov-*` | {rut validado DV, nombre único case-insensitive, rubro, contacto?, telefono?, email?, sitioWeb?, activo}; no eliminable con historial |
| `mantencionesPreventivasPE` | `mant-*` | {proveedorId FK activo, descripcion, periodicidadMeses ≥1, proximaFecha, alertaDiasAntes, activo}; visita técnica avanza proximaFecha = fecha + periodicidad |
| `visitasTecnicasPE` | `vt-*` | Libro inmutable {proveedorId FK, mantencionId?, tecnicoNombre, fecha, trabajoRealizado ≥5, supervisorPersonaId?, unidadId?} — audita `PE_VISITA_TECNICA` |
| `cierresTurnoPE` | `pe-cierre-*` (acepta id determinista para QA) | {fecha, hora HH:MM, jornadaReportadaId FK (editable por reemplazo), trabajadorPersonaId con ficha, novedadesGenerales?, incidencias{hubo, descripcion ≥20 si hubo, evidencias[] D1 obligatorias si hubo}, checklistInstalaciones/equipamiento snapshot {item, ok, observacion?}, historialCambios[] inmutable, notificadoAAdmin}; duplicado por trabajador+fecha+jornada rechazado |
| `proyeccionesPE` | `pe-proy-*` | {mesAnio AAAA-MM, feriados[] snapshot, diasFeriados, reemplazosNecesarios (2× irrenunciables + 1× renunciables), costoEstimado = reemplazos×costoParche + planta×costoDiaExtra, detalleCosto, enviadoAFI true, **liquidacionPLReferencia "pendiente"**} |

Reglas transversales: notificaciones a residentes respetan CF (`notificarRegistroVisitas`, `notificarEncomiendas`); cierre de turno siempre notifica a administración + copia al trabajador (`email_simulado`).
