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
  },
  // Miembro del Comité: lectura financiera + auditoría; aprueba gastos; RE centro de mando lectura; CT historial lectura
  comite: {
    "fi": new Set<Accion>(["ver", "ejecutar"]), // ver balance, ejecutar aprobar gasto
    "fi:balance": new Set<Accion>(["ver"]),
    "fi:gasto_comun": new Set<Accion>(["ver", "ejecutar"]),
    "mp": new Set<Accion>(["ver", "editar"]), // editar propios + ver morosidad (filtrado abajo)
    "mp:propios": new Set<Accion>(["ver", "editar"]),
    "mp:morosidad": new Set<Accion>(["ver"]),
    "re": new Set<Accion>(["ver"]),
    "re:centro_mando": new Set<Accion>(["ver"]),
    "ct": new Set<Accion>(["ver"]),
    "ct:historial": new Set<Accion>(["ver"]),
    "pe:directorio": new Set<Accion>(["ver"]),
    "ir:mantenimiento": new Set<Accion>(["ver", "crear"]),
    // explícitamente sin permisos: FI crear/editar/eliminar, PE bitacora, PL, IR:interno, admin:usuarios, backup
  },
  // Conserjería / Seguridad: bitácora, visitas, encomiendas, iniciar/cerrar turno, directorio, reporte diario PE, IR mantenimiento
  conserjeria: {
    "mp:propios": new Set<Accion>(["ver", "editar"]),
    "pe": new Set<Accion>(["ver", "crear", "editar"]),
    "pe:bitacora": new Set<Accion>(["ver", "crear", "editar"]),
    "pe:cierre_turno": new Set<Accion>(["ver", "crear", "ejecutar"]),
    "pe:reporte_diario": new Set<Accion>(["ver"]),
    "pe:directorio": new Set<Accion>(["ver"]),
    "pe:ficha": new Set<Accion>([]), // sin dato previsional/bancario
    "pl": new Set<Accion>([]),
    "pl:propia": new Set<Accion>(["ver"]), // solo propia liquidación (ABAC filtro)
    "ct:propia": new Set<Accion>(["ver"]),
    "re:reporte_diario": new Set<Accion>(["ver"]),
    "ir:mantenimiento": new Set<Accion>(["ver", "crear"]),
    "ir:interno": new Set<Accion>(["ver", "crear"]), // personal servicio sí
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
    "ir:mantenimiento": new Set<Accion>(["ver", "crear"]),
    "ir:interno": new Set<Accion>([]), // bloqueado
    "ra": new Set<Accion>(["ver", "crear"]), // reserva amenities (ABAC propia)
    "ge": new Set<Accion>(["ver", "crear"]),
    "co": new Set<Accion>(["ver", "crear"]),
    "gd": new Set<Accion>(["ver"]), // actas según residenteVeActas (ABAC)
  },
  // Personal de Mantención: lista tareas asignadas + reporte incidentes físicos, IR mantenimiento + interno
  mantencion: {
    "mp:propios": new Set<Accion>(["ver", "editar"]),
    "mt": new Set<Accion>(["ver", "crear", "editar", "ejecutar"]),
    "mt:tarea": new Set<Accion>(["ver", "ejecutar"]),
    "mt:incidente": new Set<Accion>(["ver", "crear"]),
    "pe:directorio": new Set<Accion>(["ver"]),
    "ir:mantenimiento": new Set<Accion>(["ver", "crear"]),
    "ir:interno": new Set<Accion>(["ver", "crear"]),
    "pe:bitacora": new Set<Accion>(["ver"]),
  },
}

const ACCIONES_VALIDAS = new Set<Accion>(["ver", "crear", "editar", "eliminar", "ejecutar"])

function normalizaRecurso(r: string): string {
  return r.trim().toLowerCase()
}
function normalizaRol(r: string): Rol | null {
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

// Helpers para tests/docs: lista recursos conocidos
export const RECURSOS_CONOCIDOS = [
  "fi",
  "fi:balance",
  "fi:gasto_comun",
  "mp",
  "mp:propios",
  "mp:morosidad",
  "ef",
  "es:estacionamiento",
  "pe",
  "pe:bitacora",
  "pe:cierre_turno",
  "pe:ficha",
  "pe:reporte_diario",
  "pe:directorio",
  "pe:visita",
  "pe:contratista",
  "pl",
  "pl:propia",
  "ct",
  "ct:propio",
  "ct:historial",
  "re",
  "re:centro_mando",
  "re:reporte_diario",
  "ir:mantenimiento",
  "ir:interno",
  "mt",
  "ra",
  "ge",
  "co",
  "gd",
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
