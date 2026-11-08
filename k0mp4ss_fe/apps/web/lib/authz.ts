/**
 * lib/authz.ts — Matriz de permisos pura (B3)
 * Fuente: RP - Roles y Permisos.md §2/§3 + specs PE/PL/CT/RE/IR + AU §4
 * Roles estándar RP: Administrador Maestro, Miembro del Comité, Conserjería/Seguridad, Propietario/Residente, Personal de Mantención
 * Acciones: ver, crear, editar, eliminar, ejecutar (RP §Matriz)
 * Recursos: módulos NSGC + admin:usuarios / backup (server-side)
 * Menor privilegio: lo no listado = denegado; unión de roles vía tienePermiso().
 * Pura, sin IO, testeable. Proxy solo autenticación (SG §4.1).
 */

export const ROLES = ["administrador", "comite", "conserjeria", "residente", "mantencion"] as const
export type Rol = (typeof ROLES)[number]
export type Accion = "ver" | "crear" | "editar" | "eliminar" | "ejecutar"
export type Recurso = string

// Matriz interna: Rol -> Recurso -> Set<Accion>
// Claves normalizadas lower. "*" = wildcard para administrador.
// Tabla derivada de RP tabla (FI ver balance, emitir GC, MP editar propios, ver morosidad, ES asignar, PE cierre turno) + specs PE/PL/CT/RE/IR
const MATRIZ: Record<Rol, Record<string, Set<Accion>>> = {
  // Administrador Maestro: full access a todos los módulos, config global y finanzas
  administrador: {
    "*": new Set<Accion>(["ver", "crear", "editar", "eliminar", "ejecutar"]),
    // H7 — declarado por claridad: el wildcard ya lo cubre, pero el granular deja
    // visible la regla "marcar leída es acto propio del destinatario"
    "notificaciones:propias": new Set<Accion>(["editar"]),
  },
  // Miembro del Comité: lectura financiera + auditoría; aprueba gastos; RE centro de mando lectura; CT historial lectura
  comite: {
    "fi": new Set<Accion>(["ver", "ejecutar"]), // ver balance, ejecutar aprobar gasto
    // Vacío a propósito (decisión 2026-11-07, D1 de «Permisos por objeto»): nadie pide
    // `fi:balance`. El comité ya tiene `fi` ver, así que esta clave era una segunda
    // verdad sin puerta. El Set vacío corta el fallback de prefijo de `puede()`.
    "fi:balance": new Set<Accion>([]),
    "fi:gasto_comun": new Set<Accion>(["ver", "ejecutar"]),
    // SERIE-FASE2 §V5: el comité AUDITA la cobranza (ver) pero no la ejecuta.
    // Sin esta entrada explícita `puede()` caería al prefijo `fi`, donde el
    // comité sí tiene `ejecutar` (aprobar gasto), y podría enviar cobranzas.
    "fi:cobranza": new Set<Accion>(["ver"]),
    // Vacío explícito: la preferencia de canal es del residente, no del comité.
    "fi:cobranza:propia": new Set<Accion>([]),
    // F27 aviso-de-cobro: el aviso es el papel de UNA unidad. El comité lo lee
    // por `fi:gasto_comun` (todos los de la comunidad), no por esta clave: sin
    // la entrada vacía, `ver` caería al prefijo `fi` (que el comité sí tiene) y
    // la clave del residente se concedería sola a quien administra el edificio.
    "fi:aviso:propio": new Set<Accion>([]),
    "am": new Set<Accion>(["ver"]), // RP §Roles Estándar: comité lee auditorías (P2 security audit); crear/editar solo admin
    "mp": new Set<Accion>(["ver", "editar"]), // editar propios + ver morosidad (filtrado abajo)
    "mp:propios": new Set<Accion>(["ver", "editar"]),
    "mp:morosidad": new Set<Accion>(["ver"]),
    "re": new Set<Accion>(["ver"]),
    "re:centro_mando": new Set<Accion>(["ver"]),
    // SERIE-FASE2 §V4 (decisión del plan): el comité LEE los adelantos PL
    // (`pl:adelantos` ver) pero no los crea ni los desestima — eso es del
    // administrador. Recurso propio para no abrir `pl` (sueldos sensibles).
    "pl:adelantos": new Set<Accion>(["ver"]),
    "ct": new Set<Accion>(["ver"]),
    // Vacío a propósito (D1): el comité ya tiene `ct` ver y no existe pantalla de
    // historial. Set vacío para cortar el fallback de prefijo.
    "ct:historial": new Set<Accion>([]),
    // SERIE-FASE2 §V2 (decisión del plan): el comité LEE Personal (`pe` ver);
    // registrar/editar transiciones es de quien las opera. Las evaluaciones de
    // desempeño se declaran VACÍAS a propósito (solo administrador las registra).
    "pe": new Set<Accion>(["ver"]),
    "pe:evaluacion": new Set<Accion>([]),
    // `pe:ficha` (previsional/bancario) queda VACÍO explícito: el comité lee PE
    // pero no el dato previsional, igual que conserjería.
    "pe:ficha": new Set<Accion>([]),
    "pe:directorio": new Set<Accion>(["ver"]),
    // F25 (skill auditoria-contratos-permisos): el panel de turnos del día ya lo leía
    // el comité por el FALLBACK DE PREFIJO de `pe`; se declara explícito para que el
    // permiso declarado y el ejecutado sean lo mismo. Operar el turno
    // (crear/editar/ejecutar) sigue siendo de conserjería: el comité audita, no opera.
    "pe:cierre_turno": new Set<Accion>(["ver"]),
    // Bitácora de visitas (decisión owner 2026-11-05): es el registro de un HECHO del
    // edificio, no un acto administrativo — quien estuvo en el portón lo escribe, el
    // comité lo LEE. La clave gobierna además las proyecciones de solo lectura
    // `/api/pe/personas`, `/api/pe/unidades` y `/api/pe/maestros/[tipo]`, que el comité
    // ya alcanzaba por el fallback de prefijo de `pe` (ver): la entrada explícita deja
    // el permiso declarado igual al ejecutado sin mover ningún acceso.
    "pe:bitacora": new Set<Accion>(["ver"]),
    // Encomiendas (decisión owner 2026-11-05): la recepción en conserjería es un
    // registro del portón; el comité NO lo lee (a diferencia de visitas y contratistas:
    // el paquete es de una unidad, no del edificio) y hasta ahora entraba por el
    // fallback de prefijo de `pe` ver. Conjunto vacío explícito: el bloqueo queda
    // declarado en la MATRIZ y no depende de que la raíz siga teniendo `ver`.
    "pe:encomienda": new Set<Accion>([]),
    // Ingresos de contratistas (decisión owner 2026-11-05): es el LOG DEL PORTÓN de un
    // hecho del edificio, no la programación de un trabajo en una unidad, así que el
    // comité lo LEE y hasta ahora entraba por el fallback de prefijo de `pe` ver.
    // Clave PROPIA y no `pe:contratista`: esa key describe el acto del residente de
    // agendar al contratista de su unidad y le da `ver`; reusarla acá le abriría el
    // registro de todos los ingresos del edificio, que es otra cosa.
    "pe:ingreso_contratista": new Set<Accion>(["ver"]),
    // Calendario preventivo: el comité LEE el panel del edificio (paridad con el
    // widget S7 del dashboard de gestión) pero no programa ni edita mantenciones:
    // la gestión vive en `/admin/mantenciones`, que es del administrador.
    "pe:mantenciones": new Set<Accion>(["ver"]),
    // Visita técnica (decisión owner 2026-11-03): es el LOG DE UN HECHO, no un acto
    // administrativo — `VisitaTecnicaPE` no tiene ningún campo de dinero. Quien sabe qué
    // pasó es quien estuvo ahí, así que el comité LEE la bitácora técnica y no la escribe.
    "pe:visita_tecnica": new Set<Accion>(["ver"]),
    // Proveedores (decisión owner 2026-11-03): es un MAESTRO (RUT, contacto, contrato).
    // Administrar maestros es del administrador; el resto de la operación necesita leer
    // quién es la empresa para poder registrar visitas y mantenciones, nada más.
    "pe:proveedor": new Set<Accion>(["ver"]),
    // Proyecciones (decisión owner 2026-11-03): calcular y registrar la proyección de
    // costo es operativo (lo hacen conserjería y mantención); EMPUJARLA al módulo
    // financiero es un acto financiero y tiene su propia clave, cerrada al administrador.
    "pe:proyeccion": new Set<Accion>(["ver"]),
    "pe:proyeccion:enviar": new Set<Accion>([]),
    // cv: visor de avisos — comité publica y edita; el resto solo ve (decisión owner 2026-10-21)
    "cv": new Set<Accion>(["ver", "crear", "editar"]),
    // in: expediente de infracciones y multas — el comité gestiona el caso (ve, crea, edita =
    // aplicar/desestimar/respaldar) pero no lo elimina. "in:apelar" se declara VACÍO a propósito:
    // la apelación es acto propio del residente y el vacío explícito corta el fallback de prefijo
    // de puede() (decisión owner 2026-10-21)
    "in": new Set<Accion>(["ver", "crear", "editar"]),
    "in:apelar": new Set<Accion>([]),
    // notificaciones: bandeja de la comunidad; el filtro por destinatario es ABAC en la ruta
    "notificaciones": new Set<Accion>(["ver"]),
    // H7 — marcar leída es acto propio del destinatario: solo la propia (ABAC en la ruta)
    "notificaciones:propias": new Set<Accion>(["editar"]),
    // cf: configuración global — el comité la lee para auditar; editarla es solo del administrador
    "cf": new Set<Accion>(["ver"]),
    // Decisión owner 2026-10-21: quien opera el inventario cierra el ciclo de
    // insumos con `editar` (conserjería y mantención); el comité solo lee.
    "ir:mantenimiento": new Set<Accion>(["ver"]),
    // H5 — gobernanza movida a la matriz (antes decidía lib/api/gd-guard.ts):
    // gd = actas, ad = controles de propiedad. El comité gestiona ambas con las 5
    // acciones por paridad con el `return true` del guard; la acción `eliminar`
    // del comité se conserva por paridad y queda como PREGUNTA ABIERTA para el
    // owner (hoy ninguna ruta la solicita sobre gd).
    "gd": new Set<Accion>(["ver", "crear", "editar", "eliminar", "ejecutar"]),
    "ad": new Set<Accion>(["ver", "crear", "editar", "eliminar", "ejecutar"]),
    // CO (comunicación con vecinos, change co-lectura-residente D4): el comité ve y crea
    // difusiones y usa el buzón ciudadano, pero no edita/elimina lo ya emitido. El desglose
    // nominativo de lecturas (`co:lecturas`) queda VACÍO explícito: sin esa entrada caería
    // al prefijo `co` y el comité vería quién leyó cada comunicación de los vecinos.
    "co": new Set<Accion>(["ver", "crear"]),
    // F35-A: el comité sube sus propias actas al archivo y lee todo el archivo;
    // borrar sigue siendo de administración (y lo legal responde 409 igual).
    "doc": new Set<Accion>(["ver", "crear"]),
    "co:buzon": new Set<Accion>(["ver", "crear"]),
    "co:lecturas": new Set<Accion>([]),
    // explícitamente sin permisos: FI crear/editar/eliminar, PE bitacora, PL, IR:interno, admin:usuarios, backup
  },
  // Conserjería / Seguridad: bitácora, visitas, encomiendas, iniciar/cerrar turno, directorio, reporte diario PE, IR mantenimiento, lectura del calendario preventivo
  conserjeria: {
    "mp:propios": new Set<Accion>(["ver", "editar"]),
    "pe": new Set<Accion>(["ver", "crear", "editar"]),
    "pe:bitacora": new Set<Accion>(["ver", "crear", "editar"]),
    // Encomiendas (decisión owner 2026-11-05): recibir y entregar un paquete es dejar
    // constancia de un hecho del portón, así que conserjería verifica, registra y
    // corrige. Sin `eliminar`: dar de baja un registro auditable es del administrador
    // (y la baja además está protegida por estado en la ruta [id]).
    "pe:encomienda": new Set<Accion>(["ver", "crear", "editar"]),
    // Ingresos de contratistas (decisión owner 2026-11-05): el portón verifica y registra
    // el ingreso, así que conserjería verifica, registra y corrige. Clave propia y no
    // `pe:contratista` (esa es del residente agendando a su contratista): el log del
    // edificio no se comparte con el residente. Sin `eliminar`: la baja de un registro
    // auditable es del administrador, y la ruta [id] además protege el ingreso sellado.
    "pe:ingreso_contratista": new Set<Accion>(["ver", "crear", "editar"]),
    "pe:cierre_turno": new Set<Accion>(["ver", "crear", "editar", "ejecutar"]),
    // Vacío a propósito (D1): el reporte diario PE no tiene ruta ni pantalla; los
    // `reportes-re/*` piden `re`. Set vacío para cortar el fallback a `pe`.
    "pe:reporte_diario": new Set<Accion>([]),
    "pe:directorio": new Set<Accion>(["ver"]),
    // Calendario preventivo: conserjería LEE el resumen del edificio (widget S7 del
    // dashboard operativo) y pierde la escritura. Sin esta entrada el fallback de
    // prefijo heredaría el `pe` de arriba (ver/crear/editar), que es un permiso
    // legítimo para bitácora, visitas y turnos, y dejaba el portón de
    // `/admin/mantenciones` en cosmético: la API aceptaba los PUT igual.
    "pe:mantenciones": new Set<Accion>(["ver"]),
    // Visita técnica (decisión owner 2026-11-03): el registro de un hecho lo escribe
    // quien estuvo en el edificio cuando ocurrió, así que conserjería verifica, registra
    // y corrige. Sin esta entrada el fallback de prefijo le heredaba el `pe` completo
    // (ver/crear/editar) y el permiso quedaba en lo que decidiera la pantalla.
    "pe:visita_tecnica": new Set<Accion>(["ver", "crear", "editar"]),
    // Proveedores (decisión owner 2026-11-03): el maestro se LEE para identificar a la
    // empresa que llega al edificio; crear/editar el RUT y el contrato es del
    // administrador. El `pe` de la operación ya no alcanza este maestro.
    "pe:proveedor": new Set<Accion>(["ver"]),
    // Proyecciones (decisión owner 2026-11-03): conserjería computa los reemplazos del
    // mes y registra la proyección de costo (ver/crear/editar). Enviarla a Finanzas es
    // otra cosa: esa entrada queda VACÍA explícita — enviar materializa un costo en FI.
    "pe:proyeccion": new Set<Accion>(["ver", "crear", "editar"]),
    "pe:proyeccion:enviar": new Set<Accion>([]),
    "pe:ficha": new Set<Accion>([]), // sin dato previsional/bancario
    // SERIE-FASE2 §V2: evaluar el desempeño del personal es acto del
    // administrador; conserjería no registra evaluaciones (Set vacío explícito).
    "pe:evaluacion": new Set<Accion>([]),
    "pl": new Set<Accion>([]),
    "pl:propia": new Set<Accion>(["ver"]), // solo propia liquidación (ABAC filtro)
    // Vacío explícito: no hay auto-servicio del trabajador sobre adelantos
    // (SERIE-FASE2 §V4). Corta el fallback de prefijo hacia `pl`.
    "pl:adelantos": new Set<Accion>([]),
    // Vacío a propósito (D1): el certificado «de la unidad vinculada del staff» no
    // tiene ruta ni pantalla. El residente conserva `ct:propio`/`:residencia`/`:al_dia`.
    "ct:propia": new Set<Accion>([]),
    // Vacío a propósito (D1): conserjería ya tiene `re` ver; esta clave no tenía
    // consumidor. Set vacío para cortar el fallback de prefijo.
    "re:reporte_diario": new Set<Accion>([]),
    // Decisión owner 2026-10-21: conserjería entrega insumos y resuelve
    // comodines en un click (`editar` = POST .../entregar y .../resolver-comodin).
    "ir:mantenimiento": new Set<Accion>(["ver", "crear", "editar"]),
    "ir:interno": new Set<Accion>(["ver", "crear"]), // personal servicio sí
    "cv": new Set<Accion>(["ver"]), // visor de avisos: solo lectura (decisión owner 2026-10-21)
    // in: conserjería reporta la infracción (ver + crear) pero no resuelve el caso; "in:apelar"
    // vacío corta el fallback de prefijo de puede() (la apelación no es de conserjería)
    "in": new Set<Accion>(["ver", "crear"]),
    "in:apelar": new Set<Accion>([]),
    "notificaciones": new Set<Accion>(["ver"]),
    // H7 — marcar leída es acto propio del destinatario: solo la propia (ABAC en la ruta)
    "notificaciones:propias": new Set<Accion>(["editar"]),
    // SERIE-FASE2 §V5: la cobranza FI es del administrador; conserjería no la
    // ejecuta ni ve las preferencias de canal (vacío explícito: corta el
    // fallback de prefijo hacia `fi`, que tampoco tiene).
    "fi:cobranza": new Set<Accion>([]),
    "fi:cobranza:propia": new Set<Accion>([]),
    // F27: el aviso propio es del residente; conserjería no lo lee (vacío
    // explícito: corta el fallback de prefijo hacia `fi`, que tampoco tiene).
    "fi:aviso:propio": new Set<Accion>([]),
  },
  // Propietario / Residente: estado cuenta propio, pago GC, reserva amenities, reclamos, votos, certificados propios, directorio, IR mantenimiento solo
  residente: {
    "mp:propios": new Set<Accion>(["ver", "editar"]),
    // F34 · el residente emite SU certificado, y sólo el que la ley le deja.
    // La emisión dejó de ser un `ct` genérico: `POST /api/certificados-ct` despacha
    // por tipología a las claves finas. `ct` ver es la lectura (colección y detalle,
    // acotadas por `alcanceCertificadosCT`); crear sobre la clave base ya no existe
    // porque no hay tipología huérfana: la que no tiene clave propia no se emite.
    //   · `ct:residencia` — ÚNICO tipo auto-emitible: la Ley 21.442 no regula el
    //     «certificado de residencia» (el proyecto 17737-14, en trámite, existe para
    //     facultar al ADMINISTRADOR a emitirlo), así que no hay acto administrativo
    //     que el residente esté usurpando al certificar dónde vive.
    //   · `ct:al_dia` ver — el estado de deudas y la calidad de copropietario hábil
    //     son actos del administrador (art. 20 N° 4: «emitir certificados en lo
    //     relativo al estado de deudas de las unidades»; art. 15: «se acreditará
    //     mediante certificado expedido por el administrador»). El residente consulta
    //     lo suyo, no lo certifica. `ct:propio` queda intacto y sin tipología que la
    //     pida: es deuda declarada en `test/lib/claves-con-consumidor.test.ts`.
    "ct": new Set<Accion>(["ver"]),
    "ct:propio": new Set<Accion>(["ver", "crear"]),
    "ct:residencia": new Set<Accion>(["ver", "crear"]),
    "ct:al_dia": new Set<Accion>(["ver"]),
    "pe:directorio": new Set<Accion>(["ver"]),
    // Vacío explícito: el residente no lee ni gestiona el calendario preventivo;
    // sin la entrada, cualquier futura clave `pe` base le abriría el prefijo.
    "pe:mantenciones": new Set<Accion>([]),
    // Vacío explícito (decisión owner 2026-11-05): del portón el residente no aprende
    // nada — su programación propia vive en `pe:visita`/`pe:contratista` y el paquete
    // le llega por notificación. La entrada corta el fallback de prefijo hacia `pe`.
    "pe:bitacora": new Set<Accion>([]),
    // Vacío explícito: el residente no inicia ni cierra turno del personal (decisión
    // owner 2026-11-05); la entrada deja el bloqueo declarado, no heredado.
    "pe:cierre_turno": new Set<Accion>([]),
    // Vacío explícito (decisión owner 2026-11-05): el paquete le llega por notificación,
    // no leyendo la planilla del portón (qué encomiendas hay y de quién son es dato de
    // la operación). Corta el fallback de prefijo hacia `pe`.
    "pe:encomienda": new Set<Accion>([]),
    // Vacío explícito (decisión owner 2026-11-05): el residente agenda a SU contratista
    // por `pe:contratista`, pero el registro de ingresos del edificio no es suyo: desde
    // el log no aprende nada del portón. Entrada vacía propia para que el `ver` de
    // `pe:contratista` no alcance el log.
    "pe:ingreso_contratista": new Set<Accion>([]),
    // Vacío explícito: la visita técnica es del edificio, no de la unidad del residente
    // (decisión owner 2026-11-03); la entrada corta el fallback de prefijo hacia `pe`.
    "pe:visita_tecnica": new Set<Accion>([]),
    // Vacío explícito: el residente no administra ni consulta el maestro de proveedores
    // (RUT, contacto, contrato) — el dato vive en la operación del edificio.
    "pe:proveedor": new Set<Accion>([]),
    // Vacío explícito: el residente no ve la proyección de costo del personal ni la
    // envía a Finanzas (decisión owner 2026-11-03).
    "pe:proyeccion": new Set<Accion>([]),
    "pe:proyeccion:enviar": new Set<Accion>([]),
    "pe:visita": new Set<Accion>(["ver", "crear"]), // agenda visitas/contratistas a su unidad
    // Agenda al contratista de SU unidad (ver/crear). No es el log de ingresos del
    // edificio: ese vive en `pe:ingreso_contratista`, vacío para el residente, para que
    // este `ver` no le abra el registro del portón.
    "pe:contratista": new Set<Accion>(["ver", "crear"]),
    // SERIE-FASE2 §V2: el residente no registra evaluaciones de desempeño.
    "pe:evaluacion": new Set<Accion>([]),
    // Decisión owner 2026-10-21: el residente solo consulta el inventario de
    // insumos; ya no crea solicitudes ni cierra el ciclo.
    "ir:mantenimiento": new Set<Accion>(["ver"]),
    "ir:interno": new Set<Accion>([]), // bloqueado
    "ra": new Set<Accion>(["ver", "crear"]), // reserva amenities (ABAC propia)
    "ge": new Set<Accion>(["ver", "crear"]),
    // CO — cambio co-lectura-residente (D-3/D4): el residente LEE las comunicaciones
    // (el alcance «solo las propias» es ABAC por destinatario en la ruta, S2/S3) y ya no
    // emite difusiones masivas a toda la comunidad. Escribe por el buzón ciudadano,
    // recurso propio (`co:buzon`) para que quitar `crear` de la difusión no le cierre
    // el canal de reclamos/sugerencias. `co:lecturas` (desglose nominativo de quién leyó)
    // es del administrador: vacío explícito para cortar el fallback de prefijo hacia `co`.
    "co": new Set<Accion>(["ver"]),
    // F35-A: el archivo es «poner a disposición» (Ley 21.442 art. 9): el residente
    // LEE lo legal y lo comunitario. Sin `crear` ni `eliminar`: no lo administra.
    "doc": new Set<Accion>(["ver"]),
    "co:buzon": new Set<Accion>(["ver", "crear"]),
    "co:lecturas": new Set<Accion>([]),
    "gd": new Set<Accion>(["ver"]), // actas según residenteVeActas (ABAC)
    "cv": new Set<Accion>(["ver"]), // visor de avisos: solo lectura (decisión owner 2026-10-21)
    // in: el residente no ve ni edita el expediente; solo presenta los descargos de SU propia
    // infracción ("in:apelar":crear), con pertenencia a la unidad validada server-side en la ruta
    // (decisión owner 2026-10-21)
    "in:apelar": new Set<Accion>(["crear"]),
    "notificaciones": new Set<Accion>(["ver"]),
    // H7 — marcar leída es acto propio del destinatario: solo la propia (ABAC en la ruta)
    "notificaciones:propias": new Set<Accion>(["editar"]),
    // H5 — controles de propiedad: residente solo lee los de su unidad (ABAC en la ruta)
    "ad": new Set<Accion>(["ver"]),
    // SERIE-FASE2 §V5: el residente no ejecuta la cobranza (vacío explícito: ya
    // no tenía `fi`), pero SÍ decide por qué canal quiere ser notificado:
    // `fi:cobranza:propia` ver+editar, con pertenencia validada en la ruta (la
    // preferencia solo puede tocar su propia persona).
    "fi:cobranza": new Set<Accion>([]),
    "fi:cobranza:propia": new Set<Accion>(["ver", "editar"]),
    // F27 aviso-de-cobro: el residente LEE el aviso de cobro con el que se le
    // cobra (período, folio, contenido congelado y PDF firmado). `ver` es su
    // única acción —emitir y entregar siguen siendo `fi:gasto_comun` del
    // administrador— y el ALCANCE es ABAC de la ruta: solo las unidades con
    // vínculo vigente (`unidadesVinculadasDb`), nunca las ajenas.
    "fi:aviso:propio": new Set<Accion>(["ver"]),
  },
  // Personal de Mantención: lista tareas asignadas + reporte incidentes físicos, IR mantenimiento + interno
  mantencion: {
    "mp:propios": new Set<Accion>(["ver", "editar"]),
    "mt": new Set<Accion>(["ver", "crear", "editar", "ejecutar"]),
    // Vacío a propósito (D1): mantención ya tiene `mt` completo (ver/crear/editar/
    // ejecutar), así que `mt:tarea` no agregaba nada. Set vacío = sin fallback.
    "mt:tarea": new Set<Accion>([]),
    // Vacío a propósito (D1): `mt:incidente` tampoco agregaba nada sobre `mt`.
    "mt:incidente": new Set<Accion>([]),
    // SERIE-FASE2 §V2: mantención opera las transiciones de Personal (horas
    // extra, completar tarea de monitoreo, enviar proyección de costo) pero NO
    // inicia/cierra turno (eso es `pe:cierre_turno`, conserjería) ni evalúa.
    "pe": new Set<Accion>(["ver", "crear", "editar"]),
    "pe:evaluacion": new Set<Accion>([]),
    // Vacío explícito: cortan el fallback de prefijo de `puede()` hacia `pe`.
    // Iniciar/cerrar turno es de conserjería; la ficha previsional no aplica acá.
    "pe:cierre_turno": new Set<Accion>([]),
    // Calendario preventivo: mantención LEE las mantenciones del edificio (widget
    // S7 del dashboard operativo, el mismo que ve conserjería) y no las programa;
    // programar es del administrador. La entrada corta el fallback de prefijo a
    // `pe`, que le daba crear/editar por herencia.
    "pe:mantenciones": new Set<Accion>(["ver"]),
    // Visita técnica (decisión owner 2026-11-03): quien ejecuta el trabajo es quien puede
    // dejar constancia de él, así que mantención registra y corrige la visita técnica.
    // La entrada evita que el `pe` de sus propias tareas decida por herencia.
    "pe:visita_tecnica": new Set<Accion>(["ver", "crear", "editar"]),
    // Proveedores (decisión owner 2026-11-03): mantención lee el maestro para saber a
    // quién está llamando cuando reporta un incidente; no lo administra.
    "pe:proveedor": new Set<Accion>(["ver"]),
    // Proyecciones (decisión owner 2026-11-03): mantención computa los reemplazos y
    // registra la proyección de costo (ver/crear/editar), igual que conserjería. El
    // envío a Finanzas queda VACÍO explícito: es un acto financiero, no operativo.
    "pe:proyeccion": new Set<Accion>(["ver", "crear", "editar"]),
    "pe:proyeccion:enviar": new Set<Accion>([]),
    "pe:ficha": new Set<Accion>([]), // sin dato previsional/bancario
    "pe:directorio": new Set<Accion>(["ver"]),
    // Decisión owner 2026-10-21: mantención entrega insumos y resuelve
    // comodines en un click (`editar` = POST .../entregar y .../resolver-comodin).
    "ir:mantenimiento": new Set<Accion>(["ver", "crear", "editar"]),
    "ir:interno": new Set<Accion>(["ver", "crear"]),
    "pe:bitacora": new Set<Accion>(["ver"]),
    // Vacío explícito (decisión owner 2026-11-05): la paquetería es del portón, no de
    // las tareas de mantención; hasta ahora la leía y la escribía por el `pe` de sus
    // tareas (fallback de prefijo). La entrada la cierra.
    "pe:encomienda": new Set<Accion>([]),
    // Vacío explícito (decisión owner 2026-11-05): los ingresos de contratistas son del
    // portón; la entrada corta el fallback de prefijo hacia el `pe` de sus tareas.
    "pe:ingreso_contratista": new Set<Accion>([]),
    "cv": new Set<Accion>(["ver"]), // visor de avisos: solo lectura (decisión owner 2026-10-21)
    "notificaciones": new Set<Accion>(["ver"]),
    // H7 — marcar leída es acto propio del destinatario: solo la propia (ABAC en la ruta)
    "notificaciones:propias": new Set<Accion>(["editar"]),
    // SERIE-FASE2 §V5: la cobranza FI no es tarea de mantención (vacío explícito).
    "fi:cobranza": new Set<Accion>([]),
    "fi:cobranza:propia": new Set<Accion>([]),
    // F27: el aviso propio tampoco es tarea de mantención (vacío explícito).
    "fi:aviso:propio": new Set<Accion>([]),
  },
}

const ACCIONES_VALIDAS = new Set<Accion>(["ver", "crear", "editar", "eliminar", "ejecutar"])

function normalizaRecurso(r: string): string {
  return r.trim().toLowerCase()
}
/**
 * normalizaRol — resuelve un rol (o alias RP) al rol estándar, o null si no existe.
 * Exportada para que las rutas ABAC razonen sobre el mismo rol que el motor RBAC.
 */
export function normalizaRol(r: string): Rol | null {
  const n = r.trim().toLowerCase()
  // alias compat: "admin" -> administrador, "personal" -> conserjeria, "directiva" -> comite
  const alias: Record<string, Rol> = {
    admin: "administrador",
    administrador: "administrador",
    administrador_maestro: "administrador",
    comite: "comite",
    comité: "comite",
    directiva: "comite",
    conserjeria: "conserjeria",
    conserjería: "conserjeria",
    seguridad: "conserjeria",
    personal: "conserjeria",
    residente: "residente",
    propietario: "residente",
    mantencion: "mantencion",
    mantención: "mantencion",
    mantencion_personal: "mantencion",
  }
  return alias[n] ?? (ROLES.includes(n as Rol) ? (n as Rol) : null)
}

/**
 * puede — función pura, testeable
 * @param rol - rol estándar RP (o alias)
 * @param accion - ver|crear|editar|eliminar|ejecutar
 * @param recurso - módulo o recurso granular (ej. "FI", "PE:bitacora", "admin:usuarios", "IR:mantenimiento")
 * @returns true si el rol tiene el permiso explícito, false por menor privilegio
 */
export function puede(rol: string, accion: string, recurso: string): boolean {
  const rolNorm = normalizaRol(rol)
  const accionNorm = accion.trim().toLowerCase() as Accion
  const recursoNorm = normalizaRecurso(recurso)
  if (!rolNorm || !recursoNorm || !ACCIONES_VALIDAS.has(accionNorm)) return false
  // administrador wildcard — full access a todo recurso conocido, pero no a vacío
  if (rolNorm === "administrador") {
    // Menor privilegio: si recurso es desconocido pero admin pide, negar? Según RP admin full access → true para cualquier recurso no vacío
    return recursoNorm.length > 0
  }
  const permisosRol = MATRIZ[rolNorm]
  if (!permisosRol) return false
  // check exact — si la clave existe, es definitiva (incluso si es Set vacío = denegado)
  if (Object.prototype.hasOwnProperty.call(permisosRol, recursoNorm)) {
    const exact = permisosRol[recursoNorm] as Set<Accion>
    return exact.has(accionNorm)
  }
  // check wildcard "*" (solo admin lo tiene, pero genérico)
  const wildcard = permisosRol["*"]
  if (wildcard?.has(accionNorm)) return true
  // check base prefix (antes de ":") solo si no hay exact
  const base = recursoNorm.split(":")[0] as string
  if (base !== recursoNorm && Object.prototype.hasOwnProperty.call(permisosRol, base)) {
    const baseSet = permisosRol[base] as Set<Accion>
    return baseSet.has(accionNorm)
  }
  // fallback: recurso sin namespace pero matriz tiene granular? Ej "FI" vs "FI:balance" — ya evaluado base arriba, ahora prueba si algún granular contiene base?
  // No: menor privilegio — solo si base permite.
  return false
}

/**
 * tienePermiso — unión de roles (RP §Roles Múltiples)
 */
export function tienePermiso(roles: string[], accion: string, recurso: string): boolean {
  if (!Array.isArray(roles) || roles.length === 0) return false
  return roles.some((r) => puede(r, accion, recurso))
}

// ABAC contextual — refinamiento puro sobre puede() (RP §Permisos Contextuales)
export interface ContextoABAC {
  personaId?: string // identidad del usuario autenticado (sesión)
  unidadId?: string // unidad reclamada
  unidadIdsVinculadas?: string[] // unidades con vínculo vigente del usuario
  privacidad?: { residenteVeActas?: boolean }
}

/**
 * puedeContextual — ABAC behavior-preserving sobre puede()
 * @param rol - rol estándar RP (o alias)
 * @param accion - ver|crear|editar|eliminar|ejecutar
 * @param recurso - módulo o recurso granular
 * @param ctx - contexto ABAC (identidad, unidad, vinculaciones, privacidad)
 * @returns true si tiene permiso base y supera refinamiento contextual; false si base deniega o contexto no satisface
 * Regla: contextos sin dimensión ABAC delegan a puede(); administrador bypassa refinamientos (full access).
 */
export function puedeContextual(rol: string, accion: string, recurso: string, ctx: ContextoABAC = {}): boolean {
  if (!puede(rol, accion, recurso)) return false
  const rolNorm = normalizaRol(rol)
  const recursoNorm = normalizaRecurso(recurso)
  if (!rolNorm || !recursoNorm) return false
  // administrador bypassa refinamientos ABAC (paridad: admin no necesita vínculo ni privacidad)
  if (rolNorm === "administrador") return true

  // mp:propios — requiere identidad propia (personaId) presente (paridad con UI que solo muestra propios si autenticado)
  if (recursoNorm === "mp:propios" || recursoNorm === "mp:propio") {
    return !!ctx.personaId && ctx.personaId.trim().length > 0
  }
  // pl:propia — trabajador solo ve su liquidación (paridad: requiere personaId, sin él no ve ni propia)
  if (recursoNorm === "pl:propia" || recursoNorm === "pl") {
    // pl exact sin sufijo tiene Set vacío para conserjeria → ya denegado arriba; si algún rol tuviera pl base, igual requiere personaId
    return !!ctx.personaId && ctx.personaId.trim().length > 0
  }
  // CT familia — certificado de su unidad (paridad con lib/store.ts:4253 vinculoVigente + app/comunidad/certificados/page.tsx:177 filtro unidades)
  if (
    recursoNorm === "ct:propio" ||
    recursoNorm === "ct:residencia" ||
    recursoNorm === "ct:al_dia" ||
    recursoNorm === "ct:propia" ||
    recursoNorm === "ct:estado_cuenta"
  ) {
    if (!ctx.unidadId || !Array.isArray(ctx.unidadIdsVinculadas)) return false
    return ctx.unidadIdsVinculadas.includes(ctx.unidadId)
  }
  // Para ct genérico con unidad específica, si el caller provee unidadId, validar vinculación (si no provee, delega)
  if (recursoNorm === "ct" && ctx.unidadId) {
    if (!Array.isArray(ctx.unidadIdsVinculadas)) return false
    return ctx.unidadIdsVinculadas.includes(ctx.unidadId)
  }
  // GD — actas visibles solo si propietario autorizó (paridad con app/comunidad/directiva/page.tsx:73 residenteAutorizado)
  if (recursoNorm === "gd" || recursoNorm.startsWith("gd:")) {
    if (rolNorm === "residente") {
      return !!ctx.privacidad?.residenteVeActas
    }
    return true
  }
  // Resto sin dimensión contextual → delega directo a puede() (ya validado arriba)
  return true
}

// Helpers para tests/docs: lista recursos conocidos
export const RECURSOS_CONOCIDOS = [
  "fi",
  "fi:balance",
  "fi:gasto_comun",
  "fi:cobranza",
  "fi:cobranza:propia",
  "fi:aviso:propio",
  "mp",
  "mp:propios",
  "mp:morosidad",
  "ef",
  "es:estacionamiento",
  "pe",
  "pe:evaluacion",
  "pe:bitacora",
  "pe:cierre_turno",
  "pe:ficha",
  "pe:encomienda",
  "pe:ingreso_contratista",
  "pe:mantenciones",
  "pe:visita_tecnica",
  "pe:proveedor",
  "pe:proyeccion",
  "pe:proyeccion:enviar",
  "pe:reporte_diario",
  "pe:directorio",
  "pe:visita",
  "pe:contratista",
  "pl",
  "pl:propia",
  "pl:adelantos",
  "ct",
  "ct:propio",
  "ct:historial",
  "re",
  "re:centro_mando",
  "re:reporte_diario",
  "ir:mantenimiento",
  "ir:interno",
  "mt",
  "am",
  "ra",
  "ge",
  "co",
  "doc",
  "co:buzon",
  "co:lecturas",
  "gd",
  "cv",
  "in",
  "in:apelar",
  "notificaciones",
  "cf",
  "admin:usuarios",
  "backup",
] as const

export interface EntradaMatriz {
  recurso: string
  acciones: Accion[]
}

/**
 * matrizPermisos — snapshot plano de la MATRIZ para la vista /admin/permisos (solo lectura).
 * Derivado en tiempo de ejecución de MATRIZ (nunca desincroniza con el motor).
 * Entradas con Set vacío se conservan: comunican bloqueo explícito (menor privilegio).
 */
export function matrizPermisos(): Record<Rol, EntradaMatriz[]> {
  const out = {} as Record<Rol, EntradaMatriz[]>
  for (const rol of ROLES) {
    out[rol] = Object.entries(MATRIZ[rol])
      .map(([recurso, acciones]) => ({
        recurso,
        acciones: [...acciones].filter((a) => ACCIONES_VALIDAS.has(a)).sort(),
      }))
      .sort((a, b) => a.recurso.localeCompare(b.recurso))
  }
  return out
}

export interface EntradaABAC {
  rol: Rol
  recurso: string
  condicion: string
  descripcion: string
  // `motor` = lo aplica `puedeContextual` y alguna ruta lo llama;
  // `check local` = lo aplica un check de la ruta/pantalla, no el motor;
  // `sin superficie` = el motor lo implementa y NINGUNA ruta lo llama: la regla
  // hoy no protege nada. Se declara así en vez de mentir con `motor`.
  donde: "motor" | "check local" | "sin superficie"
  detalle?: string
}

// Snapshot contextual derivado del código de puedeContextual (paridad con MATRIZ/matrízPermisos()).
// Refleja TODAS las reglas ABAC del sistema, marcando si se aplica en el motor puedeContextual
// o como check local heredado (lección P4: 3 familias inline no migradas por acoplo a store/UI).
const REGLAS_ABAC: EntradaABAC[] = [
  // mp:propios — requiere identidad propia (motor)
  { rol: "residente", recurso: "mp:propios", condicion: "solo propios", descripcion: "Solo ve y edita sus propios datos de persona", donde: "motor", detalle: "lib/authz.ts:puedeContextual mp:propios requiere personaId" },
  { rol: "comite", recurso: "mp:propios", condicion: "solo propios", descripcion: "Solo ve y edita sus propios datos de persona", donde: "motor", detalle: "lib/authz.ts:puedeContextual mp:propios requiere personaId" },
  { rol: "conserjeria", recurso: "mp:propios", condicion: "solo propios", descripcion: "Solo ve y edita sus propios datos de persona", donde: "motor", detalle: "lib/authz.ts:puedeContextual mp:propios requiere personaId" },
  { rol: "mantencion", recurso: "mp:propios", condicion: "solo propios", descripcion: "Solo ve y edita sus propios datos de persona", donde: "motor", detalle: "lib/authz.ts:puedeContextual mp:propios requiere personaId" },
  // pl:propia — solo su liquidación (motor)
  { rol: "conserjeria", recurso: "pl:propia", condicion: "solo propia", descripcion: "Solo ve su propia liquidación (filtra por personaId)", donde: "motor", detalle: "lib/authz.ts:puedeContextual pl:propia requiere personaId — paridad lib/store.ts:3807" },
  // CT — unidad vinculada (motor)
  { rol: "residente", recurso: "ct:propio", condicion: "unidad vinculada", descripcion: "Solo certificados de su unidad con vínculo vigente", donde: "motor", detalle: "lib/authz.ts:puedeContextual ct:propio requiere unidadId ∈ unidadIdsVinculadas — paridad lib/store.ts:4253 vinculoVigente" },
  { rol: "residente", recurso: "ct:residencia", condicion: "unidad vinculada", descripcion: "Certificado residencia exige vínculo vigente a la unidad reclamada", donde: "motor", detalle: "lib/authz.ts:puedeContextual ct:residencia + app/api/certificados-ct/route.ts:rechazoDeTipoNoEmisible — el residente emite sólo este tipo, y sólo anclado a su unidad y persona vinculadas (F34; Ley 21.442 art. 20 N° 4 no lo reserva al administrador)" },
  { rol: "residente", recurso: "ct:al_dia", condicion: "unidad vinculada", descripcion: "Certificado al día exige unidad vinculada (saldo lo decide CT)", donde: "motor", detalle: "ver, NO crear desde F34: la emisión de un certificado sobre el estado de deudas es función del administrador (Ley 21.442 art. 20 N° 4 y art. 15), así que app/api/certificados-ct/route.ts:rechazoDeTipoNoEmisible responde 403 al residente" },
  { rol: "residente", recurso: "ct:estado_cuenta", condicion: "unidad vinculada", descripcion: "Estado de cuenta solo de su unidad vinculada", donde: "motor", detalle: "lib/authz.ts:puedeContextual ct:estado_cuenta requiere unidadId ∈ unidadIdsVinculadas" },
  { rol: "conserjeria", recurso: "ct:propia", condicion: "unidad vinculada", descripcion: "Solo certificados de su unidad vinculada", donde: "motor", detalle: "lib/authz.ts:puedeContextual ct:propia" },
  // GD — privacidad actas (motor, migrado P4)
  { rol: "residente", recurso: "gd", condicion: "según privacidad: residenteVeActas", descripcion: "Residente solo ve actas si el control de privacidad lo autoriza", donde: "motor", detalle: "lib/authz.ts:puedeContextual gd residenteVeActas — migrado P4 desde app/comunidad/directiva/page.tsx:73" },
  { rol: "residente", recurso: "gd:acta", condicion: "según privacidad: residenteVeActas", descripcion: "Actas GD visibles solo si propietario autorizó (privacidad)", donde: "motor", detalle: "lib/authz.ts:puedeContextual gd:* residenteVeActas" },
]

/**
 * reglasContextuales — snapshot plano de REGLAS_ABAC para la vista /admin/permisos (solo lectura).
 * Derivado en tiempo de ejecución (constante de módulo, como matrizPermisos()), nunca datos duros en la vista.
 * Orden determinista por rol (ROLES) y recurso alfabético.
 */
export function reglasContextuales(): EntradaABAC[] {
  return [...REGLAS_ABAC].sort((a, b) => {
    const ia = ROLES.indexOf(a.rol)
    const ib = ROLES.indexOf(b.rol)
    if (ia !== ib) return ia - ib
    return a.recurso.localeCompare(b.recurso)
  })
}
