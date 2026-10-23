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
    "fi:balance": new Set<Accion>(["ver"]),
    "fi:gasto_comun": new Set<Accion>(["ver", "ejecutar"]),
    // SERIE-FASE2 §V5: el comité AUDITA la cobranza (ver) pero no la ejecuta.
    // Sin esta entrada explícita `puede()` caería al prefijo `fi`, donde el
    // comité sí tiene `ejecutar` (aprobar gasto), y podría enviar cobranzas.
    "fi:cobranza": new Set<Accion>(["ver"]),
    // Vacío explícito: la preferencia de canal es del residente, no del comité.
    "fi:cobranza:propia": new Set<Accion>([]),
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
    "ct:historial": new Set<Accion>(["ver"]),
    // SERIE-FASE2 §V2 (decisión del plan): el comité LEE Personal (`pe` ver);
    // registrar/editar transiciones es de quien las opera. Las evaluaciones de
    // desempeño se declaran VACÍAS a propósito (solo administrador las registra).
    "pe": new Set<Accion>(["ver"]),
    "pe:evaluacion": new Set<Accion>([]),
    // `pe:ficha` (previsional/bancario) queda VACÍO explícito: el comité lee PE
    // pero no el dato previsional, igual que conserjería.
    "pe:ficha": new Set<Accion>([]),
    "pe:directorio": new Set<Accion>(["ver"]),
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
    "co:buzon": new Set<Accion>(["ver", "crear"]),
    "co:lecturas": new Set<Accion>([]),
    // explícitamente sin permisos: FI crear/editar/eliminar, PE bitacora, PL, IR:interno, admin:usuarios, backup
  },
  // Conserjería / Seguridad: bitácora, visitas, encomiendas, iniciar/cerrar turno, directorio, reporte diario PE, IR mantenimiento
  conserjeria: {
    "mp:propios": new Set<Accion>(["ver", "editar"]),
    "pe": new Set<Accion>(["ver", "crear", "editar"]),
    "pe:bitacora": new Set<Accion>(["ver", "crear", "editar"]),
    "pe:cierre_turno": new Set<Accion>(["ver", "crear", "editar", "ejecutar"]),
    "pe:reporte_diario": new Set<Accion>(["ver"]),
    "pe:directorio": new Set<Accion>(["ver"]),
    "pe:ficha": new Set<Accion>([]), // sin dato previsional/bancario
    // SERIE-FASE2 §V2: evaluar el desempeño del personal es acto del
    // administrador; conserjería no registra evaluaciones (Set vacío explícito).
    "pe:evaluacion": new Set<Accion>([]),
    "pl": new Set<Accion>([]),
    "pl:propia": new Set<Accion>(["ver"]), // solo propia liquidación (ABAC filtro)
    // Vacío explícito: no hay auto-servicio del trabajador sobre adelantos
    // (SERIE-FASE2 §V4). Corta el fallback de prefijo hacia `pl`.
    "pl:adelantos": new Set<Accion>([]),
    "ct:propia": new Set<Accion>(["ver"]),
    "re:reporte_diario": new Set<Accion>(["ver"]),
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
  },
  // Propietario / Residente: estado cuenta propio, pago GC, reserva amenities, reclamos, votos, certificados propios, directorio, IR mantenimiento solo
  residente: {
    "mp:propios": new Set<Accion>(["ver", "editar"]),
    "ct": new Set<Accion>(["ver", "crear"]),
    "ct:propio": new Set<Accion>(["ver", "crear"]),
    "ct:residencia": new Set<Accion>(["ver", "crear"]),
    "ct:al_dia": new Set<Accion>(["ver", "crear"]),
    "pe:directorio": new Set<Accion>(["ver"]),
    "pe:visita": new Set<Accion>(["ver", "crear"]), // agenda visitas/contratistas a su unidad
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
  },
  // Personal de Mantención: lista tareas asignadas + reporte incidentes físicos, IR mantenimiento + interno
  mantencion: {
    "mp:propios": new Set<Accion>(["ver", "editar"]),
    "mt": new Set<Accion>(["ver", "crear", "editar", "ejecutar"]),
    "mt:tarea": new Set<Accion>(["ver", "ejecutar"]),
    "mt:incidente": new Set<Accion>(["ver", "crear"]),
    // SERIE-FASE2 §V2: mantención opera las transiciones de Personal (horas
    // extra, completar tarea de monitoreo, enviar proyección de costo) pero NO
    // inicia/cierra turno (eso es `pe:cierre_turno`, conserjería) ni evalúa.
    "pe": new Set<Accion>(["ver", "crear", "editar"]),
    "pe:evaluacion": new Set<Accion>([]),
    // Vacío explícito: cortan el fallback de prefijo de `puede()` hacia `pe`.
    // Iniciar/cerrar turno es de conserjería; la ficha previsional no aplica acá.
    "pe:cierre_turno": new Set<Accion>([]),
    "pe:ficha": new Set<Accion>([]), // sin dato previsional/bancario
    "pe:directorio": new Set<Accion>(["ver"]),
    // Decisión owner 2026-10-21: mantención entrega insumos y resuelve
    // comodines en un click (`editar` = POST .../entregar y .../resolver-comodin).
    "ir:mantenimiento": new Set<Accion>(["ver", "crear", "editar"]),
    "ir:interno": new Set<Accion>(["ver", "crear"]),
    "pe:bitacora": new Set<Accion>(["ver"]),
    "cv": new Set<Accion>(["ver"]), // visor de avisos: solo lectura (decisión owner 2026-10-21)
    "notificaciones": new Set<Accion>(["ver"]),
    // H7 — marcar leída es acto propio del destinatario: solo la propia (ABAC en la ruta)
    "notificaciones:propias": new Set<Accion>(["editar"]),
    // SERIE-FASE2 §V5: la cobranza FI no es tarea de mantención (vacío explícito).
    "fi:cobranza": new Set<Accion>([]),
    "fi:cobranza:propia": new Set<Accion>([]),
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
  privacidad?: { residenteVeMorosidad?: boolean; residenteVeActas?: boolean; alertasResidentesActivas?: boolean }
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
  // Morosidad FI/MP visible según privacidad (paridad con app/admin/gestion/page.tsx switch + controlesPropiedad)
  if (recursoNorm === "mp:morosidad" || recursoNorm === "fi:morosidad") {
    if (rolNorm === "residente") {
      return !!ctx.privacidad?.residenteVeMorosidad
    }
    return true
  }
  // Alertas a residente silenciables (paridad con lib/store.ts:1327 notify gate alertasResidentesActivas)
  // Recurso semántico: si se evalúa notificación operativa a residente, checkea alertasResidentesActivas
  if (recursoNorm === "notify:residente" || recursoNorm === "pe:notify_residente") {
    if (rolNorm === "residente") {
      // default true si no hay control; solo false explícito silencia
      if (ctx.privacidad?.alertasResidentesActivas === false) return false
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
  donde: "motor" | "check local"
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
  { rol: "residente", recurso: "ct:residencia", condicion: "unidad vinculada", descripcion: "Certificado residencia exige vínculo vigente a la unidad reclamada", donde: "motor", detalle: "lib/authz.ts:puedeContextual ct:residencia — paridad app/comunidad/certificados/page.tsx:177 filtro unidades por vínculo" },
  { rol: "residente", recurso: "ct:al_dia", condicion: "unidad vinculada", descripcion: "Certificado al día exige unidad vinculada (saldo lo decide CT)", donde: "motor", detalle: "lib/authz.ts:puedeContextual ct:al_dia vinculación; saldo pendiente bloquea en lib/store.ts:4272 (check local complementario)" },
  { rol: "residente", recurso: "ct:estado_cuenta", condicion: "unidad vinculada", descripcion: "Estado de cuenta solo de su unidad vinculada", donde: "motor", detalle: "lib/authz.ts:puedeContextual ct:estado_cuenta requiere unidadId ∈ unidadIdsVinculadas" },
  { rol: "conserjeria", recurso: "ct:propia", condicion: "unidad vinculada", descripcion: "Solo certificados de su unidad vinculada", donde: "motor", detalle: "lib/authz.ts:puedeContextual ct:propia" },
  // GD — privacidad actas (motor, migrado P4)
  { rol: "residente", recurso: "gd", condicion: "según privacidad: residenteVeActas", descripcion: "Residente solo ve actas si el control de privacidad lo autoriza", donde: "motor", detalle: "lib/authz.ts:puedeContextual gd residenteVeActas — migrado P4 desde app/comunidad/directiva/page.tsx:73" },
  { rol: "residente", recurso: "gd:acta", condicion: "según privacidad: residenteVeActas", descripcion: "Actas GD visibles solo si propietario autorizó (privacidad)", donde: "motor", detalle: "lib/authz.ts:puedeContextual gd:* residenteVeActas" },
  // Morosidad — privacidad (check local heredado P4)
  { rol: "residente", recurso: "mp:morosidad", condicion: "según privacidad: residenteVeMorosidad", descripcion: "Visibilidad de morosidad FI filtrada por control de privacidad", donde: "check local", detalle: "app/admin/gestion/page.tsx:176 switch residenteVeMorosidad + lib/schemas.ts:282 flag — modelado en puedeContextual:218 pero UI/store aún filtra local" },
  { rol: "residente", recurso: "fi:morosidad", condicion: "según privacidad: residenteVeMorosidad", descripcion: "Visibilidad de morosidad FI para residente según privacidad", donde: "check local", detalle: "app/admin/gestion/page.tsx:176 — check local no migrado por acoplo a switch UI" },
  // Alertas a residente — privacidad (check local heredado P4)
  { rol: "residente", recurso: "notify:residente", condicion: "según privacidad: alertasResidentesActivas", descripcion: "Notificaciones operativas a residente silenciables por privacidad", donde: "check local", detalle: "lib/store.ts:1327 notify gate alertasResidentesActivas — modelado en puedeContextual:226 pero aún con lectura directa de controlesPropiedad" },
  { rol: "residente", recurso: "pe:notify_residente", condicion: "según privacidad: alertasResidentesActivas", descripcion: "Notificaciones PE a residente respetan alerta activa", donde: "check local", detalle: "lib/store.ts:1327 — check local heredado P4" },
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
