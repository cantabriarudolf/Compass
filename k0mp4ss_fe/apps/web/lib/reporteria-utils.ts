// Helpers puros de RE - Reportería y Dashboards (ventana 8). Sin acceso al
// store: reciben slices tipados y devuelven derivaciones testables.
import type {
  CierreTurnoPE,
  PerfilSegmentacionRE,
  SolicitudGE,
  TenenciaSegmentacionRE,
  CobroFI,
  EgresoFI,
  Persona,
  VinculoUnidad,
} from "./schemas"
import { lineasDeCobro } from "./cobro-lineas"

// --- Métricas demográficas (censo) ---

export interface MetricasDemograficasRE {
  unidadesHabitables: number
  unidadesConPropietario: number
  unidadesConArrendatario: number
  ratioOcupacionPct: number
  unidadesConCondicionesEspeciales: number
}

export function metricasDemograficasRE(input: {
  vinculos: VinculoUnidad[]
  personas: Pick<Persona, "id" | "condicionesEspecialesIds">[]
  unidadesHabitablesIds: string[]
}): MetricasDemograficasRE {
  const vigentes = input.vinculos.filter(v => !v.fechaFin && input.unidadesHabitablesIds.includes(v.unidadId))
  const conPropietario = new Set(vigentes.filter(v => v.rol === "propietario").map(v => v.unidadId))
  const conArrendatario = new Set(vigentes.filter(v => v.rol === "arrendatario").map(v => v.unidadId))
  const personasConCondicion = new Set(
    input.personas.filter(p => (p.condicionesEspecialesIds ?? []).length > 0).map(p => p.id)
  )
  const unidadesConCondicion = new Set(
    vigentes.filter(v => personasConCondicion.has(v.personaId)).map(v => v.unidadId)
  )
  const total = Math.max(1, input.unidadesHabitablesIds.length)
  const ocupadas = new Set([...conPropietario, ...conArrendatario])
  return {
    unidadesHabitables: input.unidadesHabitablesIds.length,
    unidadesConPropietario: conPropietario.size,
    unidadesConArrendatario: conArrendatario.size,
    ratioOcupacionPct: Math.round((ocupadas.size / total) * 100),
    unidadesConCondicionesEspeciales: unidadesConCondicion.size,
  }
}

// --- Métricas operativas (el pulso diario) ---

export interface MetricasOperativasRE {
  turnosTotales: number
  turnosCerrados: number
  visitasPreAgendadas: number
  visitasConfirmadas: number
}

export function metricasOperativasRE(input: {
  cierresTurnoPE: Pick<CierreTurnoPE, "fecha" | "jornadaReportadaId">[]
  jornadasIds: string[]
  bitacoraVisitasPE: { fecha: string; origenAgenda: string; estado: string }[]
  fecha: string
}): MetricasOperativasRE {
  const cierresHoy = input.cierresTurnoPE.filter(c => c.fecha === input.fecha)
  const informados = new Set(cierresHoy.map(c => c.jornadaReportadaId))
  const preAgendadas = input.bitacoraVisitasPE.filter(v => v.fecha === input.fecha && v.origenAgenda === "pre_agendada")
  return {
    turnosTotales: input.jornadasIds.length,
    turnosCerrados: informados.size,
    visitasPreAgendadas: preAgendadas.length,
    visitasConfirmadas: preAgendadas.filter(v => v.estado === "ingresada").length,
  }
}

// --- Centro de gestiones (embudo GE cuantitativo estricto) ---

export interface EmbudoGestionesRE {
  total: number
  tasaResolucionPct: number
  nuevas: number
  enRevision: number
  enProceso: number
  solucionadas: number
  dadasEnConocimiento: number
}

export function embudoGestionesGE(solicitudes: Pick<SolicitudGE, "estado">[]): EmbudoGestionesRE {
  const total = solicitudes.length
  const cuenta = { nuevas: 0, enRevision: 0, enProceso: 0, solucionadas: 0, cerradas: 0 }
  for (const s of solicitudes) {
    if (s.estado === "nuevo") cuenta.nuevas++
    else if (s.estado === "en_revision" || s.estado === "requiere_accion_vecino") cuenta.enRevision++
    else if (s.estado === "en_proceso") cuenta.enProceso++
    else if (s.estado === "resuelto") cuenta.solucionadas++
    else if (s.estado === "cerrado") cuenta.cerradas++
  }
  const resueltas = cuenta.solucionadas + cuenta.cerradas
  return {
    total,
    tasaResolucionPct: total === 0 ? 0 : Math.round((resueltas / total) * 100),
    nuevas: cuenta.nuevas,
    enRevision: cuenta.enRevision,
    enProceso: cuenta.enProceso,
    solucionadas: cuenta.solucionadas,
    dadasEnConocimiento: cuenta.cerradas,
  }
}

// --- Salud de caja ---

export interface RecaudacionFondoRE {
  fondoId: string
  nombre: string
  emitido: number
  recaudado: number
}

export interface SaludCajaRE {
  recaudacionPorFondo: RecaudacionFondoRE[]
  ingresosNetos: number
  egresosTotales: number
  diferenciaCaja: number
  gastosFijosRecurrentes: number
  termometroVerde: boolean
}

/**
 * Reparte un cobro entre los fondos que nombran sus LÍNEAS, en proporción al
 * monto de cada línea. `emitido` suma los montos de las líneas; `recaudado`
 * reparte los pagos en esa misma proporción, sin redondear por fondo (redondear
 * cada parte rompería la suma). Un cobro legacy (sin líneas) se comporta como su
 * única línea: todo a su propio `fondoId`, igual que antes del detalle (S5).
 */
function repartoDeCobroPorFondo(
  cobro: Pick<CobroFI, "fondoId" | "montoBase" | "pagos" | "concepto" | "lineas">
): { emitido: Map<string, number>; recaudado: Map<string, number> } {
  const emitido = new Map<string, number>()
  const recaudado = new Map<string, number>()
  const pagado = cobro.pagos.reduce((acc, p) => acc + p.monto, 0)
  const lineas = lineasDeCobro(cobro)
  const totalLineas = lineas.reduce((acc, linea) => acc + linea.monto, 0)
  if (totalLineas <= 0) {
    // Sin montos no hay proporción posible: todo al fondo del cobro.
    emitido.set(cobro.fondoId, cobro.montoBase)
    if (pagado > 0) recaudado.set(cobro.fondoId, pagado)
    return { emitido, recaudado }
  }
  for (const linea of lineas) {
    const fondoId = linea.fondoId ?? cobro.fondoId
    emitido.set(fondoId, (emitido.get(fondoId) ?? 0) + linea.monto)
    if (pagado > 0) {
      recaudado.set(
        fondoId,
        (recaudado.get(fondoId) ?? 0) + (pagado * linea.monto) / totalLineas
      )
    }
  }
  return { emitido, recaudado }
}

export function saludCajaFI(input: {
  cobrosFI: Pick<
    CobroFI,
    "fondoId" | "montoBase" | "pagos" | "moras" | "diferencias" | "concepto" | "lineas"
  >[]
  egresosFI: Pick<EgresoFI, "monto" | "esRecurrente">[]
  fondos: { id: string; nombre: string }[]
}): SaludCajaRE {
  const repartos = input.cobrosFI.map(repartoDeCobroPorFondo)
  const recaudacionPorFondo: RecaudacionFondoRE[] = input.fondos.map(f => ({
    fondoId: f.id,
    nombre: f.nombre,
    emitido: repartos.reduce((acc, r) => acc + (r.emitido.get(f.id) ?? 0), 0),
    recaudado: repartos.reduce((acc, r) => acc + (r.recaudado.get(f.id) ?? 0), 0),
  }))
  const ingresosNetos = input.cobrosFI.reduce((acc, c) => acc + c.pagos.reduce((a, p) => a + p.monto, 0), 0)
  const egresosTotales = input.egresosFI.reduce((acc, e) => acc + e.monto, 0)
  const gastosFijosRecurrentes = input.egresosFI.filter(e => e.esRecurrente).reduce((acc, e) => acc + e.monto, 0)
  const diferenciaCaja = ingresosNetos - egresosTotales
  return {
    recaudacionPorFondo,
    ingresosNetos,
    egresosTotales,
    diferenciaCaja,
    gastosFijosRecurrentes,
    termometroVerde: diferenciaCaja >= gastosFijosRecurrentes,
  }
}

// --- Segmentación granular (motor de distribución) ---
//
// El vocabulario (perfiles y tenencias) NO se declara acá: vive en `lib/schemas.ts`,
// junto a `SegmentoReporteRESchema`, que comparten el payload persistido y la entrada
// de la API. Este módulo sólo resuelve quién recibe.

export interface SegmentoRE {
  macroSectorIds: string[]
  microSectorIds: string[]
  unidadIds: string[]
  perfiles: PerfilSegmentacionRE[]
  tenencias: TenenciaSegmentacionRE[]
}

// Resuelve personaIds únicos combinando alcance físico (EF), tenencia (VU) y
// perfil (MP). Los perfiles administracion/personal no exigen vínculo de
// unidad (el personal de servicio no vive necesariamente en la comunidad).
//
// Las DOS tablas de abajo son `Record` del catálogo completo: un perfil o una
// tenencia nuevos rompen la compilación acá en vez de caer en la rama de nadie y
// emitir el reporte a 0 destinatarios sin error (hallazgo 5 del informe).

/**
 * Rol de vínculo que corresponde a cada tenencia declarada.
 *
 * SUBCONJUNTO A PROPÓSITO (S5): `tenencias` nombra el rol TITULAR —el mismo criterio
 * que el ramal de alcance físico aplica desde siempre—, así que `copropietario` y
 * `ocupante` no entran por `tenencias`; sí entran por el perfil `residente` a secas,
 * que es «cualquier vínculo vigente». Si el owner quiere que un copropietario reciba
 * los informes «solo propietarios», se agrega acá —con su test— y no en una copia de
 * la pantalla. Lo pina `test/lib/segmentacion-re-perfiles.test.ts`.
 */
const ROL_DE_TENENCIA: Record<TenenciaSegmentacionRE, string> = {
  propietarios: "propietario",
  arrendatarios: "arrendatario",
}

/** Cómo se resuelve cada perfil, sin contar el alcance físico ni la cuenta activa. */
const RESUELVE_PERFIL: Record<
  PerfilSegmentacionRE,
  (persona: Persona, contexto: ContextoResolucion) => boolean
> = {
  personal: (persona) => persona.roles.includes("personal"),
  administracion: (persona) =>
    persona.roles.includes("directiva") || persona.datosGobernanza !== undefined,
  propietario: (persona, contexto) =>
    contexto.sinAlcanceFisico && contexto.tieneVinculo(persona.id, "propietario"),
  residente: (persona, contexto) =>
    contexto.sinAlcanceFisico && contexto.tieneVinculo(persona.id),
}

interface ContextoResolucion {
  vinculos: VinculoUnidad[]
  /** Roles de vínculo que piden las tenencias (vacío = no filtran). */
  rolesBuscados: Set<string>
  /** `true` cuando el segmento no fija unidades: sólo entonces decide el perfil. */
  sinAlcanceFisico: boolean
  tieneVinculo: (personaId: string, rolExigido?: string) => boolean
}

export function resolverSegmentacionRE(input: {
  segmento: Pick<SegmentoRE, "perfiles" | "tenencias">
  unidadesAlcanceIds: string[]
  vinculos: VinculoUnidad[]
  personas: Persona[]
}): string[] {
  const { segmento, unidadesAlcanceIds } = input
  const destinatarios = new Set<string>()
  const rolesBuscados = rolesDeTenencias(segmento.tenencias)

  // Piscina por EF + tenencia. Sólo cuentas activas: el informe no se distribuye a
  // una cuenta bloqueada, la misma regla que el ramal de perfiles aplica abajo (antes
  // este ramal la omitía y un propietario inactivo recibía el reporte).
  if (unidadesAlcanceIds.length > 0 || rolesBuscados.size > 0) {
    const activos = new Set(
      input.personas.filter((p) => p.estadoCuenta === "activa").map((p) => p.id)
    )
    for (const v of input.vinculos.filter((v) => !v.fechaFin)) {
      if (!activos.has(v.personaId)) continue
      if (unidadesAlcanceIds.length > 0 && !unidadesAlcanceIds.includes(v.unidadId)) continue
      if (rolesBuscados.size > 0 && !rolesBuscados.has(v.rol)) continue
      destinatarios.add(v.personaId)
    }
  }

  const contexto: ContextoResolucion = {
    vinculos: input.vinculos,
    rolesBuscados,
    sinAlcanceFisico: unidadesAlcanceIds.length === 0,
    tieneVinculo: (personaId, rolExigido) =>
      input.vinculos.some(
        (v) =>
          v.personaId === personaId &&
          !v.fechaFin &&
          (rolExigido === undefined || v.rol === rolExigido) &&
          (rolesBuscados.size === 0 || rolesBuscados.has(v.rol))
      ),
  }

  // Perfiles sin exigencia de unidad.
  for (const perfil of segmento.perfiles) {
    const resuelve: ((persona: Persona, contexto: ContextoResolucion) => boolean) | undefined =
      RESUELVE_PERFIL[perfil]
    if (!resuelve) {
      // Un valor fuera del catálogo (fila vieja o cast) NO puede degradar a
      // «nadie»: eso es exactamente el defecto que el informe describe.
      throw new Error(`Perfil de segmentación desconocido: ${String(perfil)}`)
    }
    for (const p of input.personas) {
      if (p.estadoCuenta !== "activa") continue
      if (!resuelve(p, contexto)) continue
      destinatarios.add(p.id)
    }
  }

  return [...destinatarios]
}

/**
 * Roles de vínculo que piden las tenencias del segmento. Una tenencia fuera del
 * catálogo lanza: filtrar por una palabra que ningún vínculo tiene devolvería 0
 * destinatarios sin error.
 */
function rolesDeTenencias(tenencias: readonly string[]): Set<string> {
  const roles = new Set<string>()
  for (const tenencia of tenencias) {
    const rol: string | undefined = ROL_DE_TENENCIA[tenencia as TenenciaSegmentacionRE]
    if (!rol) throw new Error(`Tenencia de segmentación desconocida: ${String(tenencia)}`)
    roles.add(rol)
  }
  return roles
}

// Tasa huérfanos ST (dangling FK / total sobre núcleos estructurales).
export function tasaHuerfanosRE(input: {
  unidades: { id: string; microSectorId: string }[]
  microSectores: { id: string }[]
  tiposUnidad?: { id: string }[]
  vinculos: Pick<VinculoUnidad, "personaId" | "unidadId">[]
  personas: { id: string }[]
}): { dangling: number; total: number; tasaPct: number } {
  let dangling = 0
  const microIds = new Set(input.microSectores.map(m => m.id))
  const personasIds = new Set(input.personas.map(p => p.id))
  for (const u of input.unidades) {
    if (!microIds.has(u.microSectorId)) dangling++
  }
  for (const v of input.vinculos) {
    if (!personasIds.has(v.personaId)) dangling++
    if (!input.unidades.some(u => u.id === v.unidadId)) dangling++
  }
  const total = input.unidades.length + input.vinculos.length + input.personas.length
  return { dangling, total, tasaPct: total === 0 ? 0 : Math.round((dangling / total) * 10000) / 100 }
}
