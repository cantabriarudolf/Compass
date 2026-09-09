// Helpers puros de RE - Reportería y Dashboards (ventana 8). Sin acceso al
// store: reciben slices tipados y devuelven derivaciones testables.
import type { CierreTurnoPE, SolicitudGE, CobroFI, EgresoFI, Persona, VinculoUnidad } from "./schemas"

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

export function saludCajaFI(input: {
  cobrosFI: Pick<CobroFI, "fondoId" | "montoBase" | "pagos" | "moras" | "diferencias">[]
  egresosFI: Pick<EgresoFI, "monto" | "esRecurrente">[]
  fondos: { id: string; nombre: string }[]
}): SaludCajaRE {
  const recaudacionPorFondo: RecaudacionFondoRE[] = input.fondos.map(f => {
    const delFondo = input.cobrosFI.filter(c => c.fondoId === f.id)
    const emitido = delFondo.reduce((acc, c) => acc + c.montoBase, 0)
    const recaudado = delFondo.reduce((acc, c) => acc + c.pagos.reduce((a2, p) => a2 + p.monto, 0), 0)
    return { fondoId: f.id, nombre: f.nombre, emitido, recaudado }
  })
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

export const PERFILES_SEGMENTACION_RE = ["administracion", "personal", "propietario", "residente"] as const
export type PerfilSegmentacionRE = (typeof PERFILES_SEGMENTACION_RE)[number]

export const TENENCIAS_SEGMENTACION_RE = ["propietarios", "arrendatarios"] as const
export type TenenciaSegmentacionRE = (typeof TENENCIAS_SEGMENTACION_RE)[number]

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
export function resolverSegmentacionRE(input: {
  segmento: Pick<SegmentoRE, "perfiles" | "tenencias">
  unidadesAlcanceIds: string[]
  vinculos: VinculoUnidad[]
  personas: Persona[]
}): string[] {
  const { segmento, unidadesAlcanceIds } = input
  const destinatarios = new Set<string>()
  const tenencias = new Set(segmento.tenencias)

  // Piscina por EF + tenencia.
  if (unidadesAlcanceIds.length > 0 || tenencias.size > 0) {
    for (const v of input.vinculos.filter(v => !v.fechaFin)) {
      if (unidadesAlcanceIds.length > 0 && !unidadesAlcanceIds.includes(v.unidadId)) continue
      if (tenencias.size > 0 && !(
        (v.rol === "propietario" && tenencias.has("propietarios")) ||
        (v.rol === "arrendatario" && tenencias.has("arrendatarios"))
      )) continue
      destinatarios.add(v.personaId)
    }
  }

  // Perfiles sin exigencia de unidad.
  for (const perfil of segmento.perfiles) {
    for (const p of input.personas) {
      if (p.estadoCuenta !== "activa") continue
      if (perfil === "personal" && p.roles.includes("personal")) destinatarios.add(p.id)
      if (perfil === "administracion" && (p.roles.includes("directiva") || p.datosGobernanza !== undefined)) destinatarios.add(p.id)
      if ((perfil === "propietario" || perfil === "residente")) {
        const tieneVinculo = input.vinculos.some(
          v => v.personaId === p.id && !v.fechaFin &&
            (perfil === "propietario" ? v.rol === "propietario" : true)
        )
        if (tieneVinculo && (unidadesAlcanceIds.length === 0)) destinatarios.add(p.id)
      }
    }
  }

  return [...destinatarios]
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
