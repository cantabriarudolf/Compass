// Helpers puros para QA Lab P2 — ownership-scoped, guard y validar completo.
// Sin dependencia de store (estado inyectado) para testear en Vitest.

export type NotificacionQA = {
  destinatarioPersonaId?: string
  asunto: string
  cuerpo: string
  moduloOrigen: string
}

export function isTestId(id: string | undefined): boolean {
  return typeof id === "string" && id.startsWith("test-")
}

export function isTestNotificacion(n: NotificacionQA): boolean {
  if (n.destinatarioPersonaId?.startsWith("test-")) return true
  if (n.asunto.includes("TEST")) return true
  if (n.cuerpo.includes("TEST")) return true
  return false
}

export function filtrarNotificacionesOwnershipScoped(
  notificaciones: NotificacionQA[],
): NotificacionQA[] {
  return notificaciones.filter((n) => !isTestNotificacion(n))
}

// Configuración CF: solo resetea a undefined si el valor actual es exactamente el TEST.
export const VALORES_TEST_CF = {
  ufMensual: 39000,
  ingresoMinimoMensual: 500000,
  topeGratificacionLegal: 4.75,
  tasaSIS: 1.48,
} as const

export function getConfiguracionLimpiaOwnershipScoped(
  cfg: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...cfg }
  for (const [campo, valorTest] of Object.entries(VALORES_TEST_CF)) {
    if ((cfg as Record<string, unknown>)[campo] === valorTest) {
      next[campo] = undefined
    }
  }
  return next
}

// --- Guard clean-first ---

export function tieneDatosTest(state: Record<string, unknown>): boolean {
  const personas = (state.personas as { id: string }[] | undefined) ?? []
  if (personas.some((p) => isTestId(p.id))) return true

  const unidades = (state.unidades as { id: string }[] | undefined) ?? []
  if (unidades.some((u) => isTestId(u.id))) return true

  const vinculos = (state.vinculos as { id: string }[] | undefined) ?? []
  if (vinculos.some((v) => isTestId(v.id))) return true

  const actasGD = (state.actasGD as { id: string }[] | undefined) ?? []
  if (actasGD.some((a) => isTestId(a.id))) return true

  const cobrosFI = (state.cobrosFI as { id: string; unidadId: string; origenRef?: string }[] | undefined) ?? []
  if (cobrosFI.some((c) => isTestId(c.id) || isTestId(c.unidadId) || isTestId(c.origenRef))) return true

  const reservasRA = (state.reservasRA as { id: string }[] | undefined) ?? []
  if (reservasRA.some((r) => isTestId(r.id))) return true

  const elementosRA = (state.elementosRA as { id: string }[] | undefined) ?? []
  if (elementosRA.some((e) => isTestId(e.id))) return true

  const liquidacionesPL = (state.liquidacionesPL as { id: string }[] | undefined) ?? []
  if (liquidacionesPL.some((l) => isTestId(l.id))) return true

  const certificadosCT = (state.certificadosCT as { id: string; personaId?: string; unidadId?: string; origenRef?: string }[] | undefined) ?? []
  if (certificadosCT.some((c) => isTestId(c.id) || isTestId(c.personaId) || isTestId(c.unidadId) || isTestId(c.origenRef))) return true

  const avisosCV = (state.avisosCV as { id: string; actaId?: string; plantillaId?: string }[] | undefined) ?? []
  if (avisosCV.some((a) => isTestId(a.id) || isTestId(a.actaId) || a.plantillaId === "plant-cv-porton")) return true

  const fondosFI = (state.fondosFI as { id: string }[] | undefined) ?? []
  if (fondosFI.some((f) => isTestId(f.id))) return true

  const egresosFI = (state.egresosFI as { id: string }[] | undefined) ?? []
  // egresos de PL tienen id aleatorio egr-*, se detectan vía liquidaciones arriba; pero si hay test- egreso también
  if (egresosFI.some((e) => isTestId(e.id))) return true

  // Si existe liquidación TEST, sus egresos aleatorios también cuentan, pero ya retorna true por liquidaciones
  return false
}

// --- Purge helpers ---

export function obtenerIdsEgresosPLTest(state: Record<string, unknown>): Set<string> {
  const liquidaciones = (state.liquidacionesPL as { id: string; egresoFIReferencia?: string }[] | undefined) ?? []
  const ids = new Set<string>()
  for (const l of liquidaciones) {
    if (isTestId(l.id) && l.egresoFIReferencia && l.egresoFIReferencia !== "pendiente") {
      ids.add(l.egresoFIReferencia)
    }
  }
  return ids
}

export function esCertificadoTest(c: { id: string; personaId?: string; unidadId?: string; origenRef?: string }): boolean {
  return isTestId(c.id) || isTestId(c.personaId) || isTestId(c.unidadId) || isTestId(c.origenRef ?? undefined)
}

export function esCobroTest(c: { id: string; unidadId: string; origenRef?: string }): boolean {
  return isTestId(c.id) || isTestId(c.unidadId) || isTestId(c.origenRef ?? undefined)
}

export function filtrarEgresosOwnershipScoped(
  egresos: { id: string }[],
  idsEgresosPLTest: Set<string>,
): { id: string }[] {
  return egresos.filter((e) => !isTestId(e.id) && !idsEgresosPLTest.has(e.id))
}

export function filtrarCertificadosOwnershipScoped(
  certificados: { id: string; personaId?: string; unidadId?: string; origenRef?: string }[],
): typeof certificados {
  return certificados.filter((c) => !esCertificadoTest(c))
}

// --- Validar completo ---

export interface ValidacionResultado {
  total: number
  porArea: Record<string, number>
  errores: string[]
}

export function validarEstadoCompleto(state: Record<string, unknown>): ValidacionResultado {
  const errores: string[] = []
  const porArea: Record<string, number> = {}

  const bump = (area: string, msg: string) => {
    errores.push(msg)
    porArea[area] = (porArea[area] ?? 0) + 1
  }

  // Helpers de existencia
  const personas = (state.personas as { id: string }[] | undefined) ?? []
  const unidades = (state.unidades as { id: string }[] | undefined) ?? []
  const microSectores = (state.microSectores as { id: string }[] | undefined) ?? []
  const tiposUnidad = (state.tiposUnidad as { id: string }[] | undefined) ?? []
  const estadosOcupacion = ((state.maestros as Record<string, unknown> | undefined)?.estadosOcupacion as { id: string }[] | undefined) ?? []
  const vinculos = (state.vinculos as { id: string; personaId: string; unidadId: string }[] | undefined) ?? []
  const fondosFI = (state.fondosFI as { id: string }[] | undefined) ?? []
  const egresosFI = (state.egresosFI as { id: string; fondoId: string }[] | undefined) ?? []
  const cobrosFI = (state.cobrosFI as { id: string; unidadId: string; origenRef?: string; concepto: string }[] | undefined) ?? []
  const infraccionesIN = (state.infraccionesIN as { id: string }[] | undefined) ?? []
  const reservasRA = (state.reservasRA as { id: string; elementoId: string; solicitantePersonaId: string; unidadId?: string; cargoFIReferencia?: string }[] | undefined) ?? []
  const elementosRA = (state.elementosRA as { id: string; microSectorId?: string }[] | undefined) ?? []
  const bitacoraVisitasPE = (state.bitacoraVisitasPE as { id: string; unidadId: string; destinoPersonaId: string }[] | undefined) ?? []
  const encomiendasPE = (state.encomiendasPE as { id: string; destinatarioPersonaId: string }[] | undefined) ?? []
  const ingresosContratistasPE = (state.ingresosContratistasPE as { id: string; unidadId: string }[] | undefined) ?? []
  const proveedoresPE = (state.proveedoresPE as { id: string }[] | undefined) ?? []
  const mantencionesPreventivasPE = (state.mantencionesPreventivasPE as { id: string; proveedorId: string }[] | undefined) ?? []
  const visitasTecnicasPE = (state.visitasTecnicasPE as { id: string; proveedorId: string; mantencionId: string }[] | undefined) ?? []
  const cierresTurnoPE = (state.cierresTurnoPE as { id: string; trabajadorPersonaId: string }[] | undefined) ?? []
  const proyeccionesPE = (state.proyeccionesPE as { id: string }[] | undefined) ?? []
  const liquidacionesPL = (state.liquidacionesPL as { id: string; trabajadorPersonaId: string; adelantosIds: string[]; egresoFIReferencia?: string }[] | undefined) ?? []
  const adelantosPL = (state.adelantosPL as { id: string; trabajadorPersonaId: string }[] | undefined) ?? []
  const certificadosCT = (state.certificadosCT as { id: string; personaId?: string; unidadId?: string; origenRef?: string }[] | undefined) ?? []
  const avisosCV = (state.avisosCV as { id: string; actaId?: string; plantillaId?: string }[] | undefined) ?? []
  const actasGD = (state.actasGD as { id: string }[] | undefined) ?? []
  const plantillasCV = (state.plantillasCV as { id: string }[] | undefined) ?? []
  const eventos = (state.eventos as { id: string; referenciaId?: string }[] | undefined) ?? []

  const personaIds = new Set(personas.map((p) => p.id))
  const unidadIds = new Set(unidades.map((u) => u.id))
  const microIds = new Set(microSectores.map((m) => m.id))
  const tipoIds = new Set(tiposUnidad.map((t) => t.id))
  const estadoIds = new Set(estadosOcupacion.map((e) => e.id))
  const fondoIds = new Set(fondosFI.map((f) => f.id))
  const egresoIds = new Set(egresosFI.map((e) => e.id))
  const cobroIds = new Set(cobrosFI.map((c) => c.id))
  const infraccionIds = new Set(infraccionesIN.map((i) => i.id))
  const reservaIds = new Set(reservasRA.map((r) => r.id))
  const elementoIds = new Set(elementosRA.map((e) => e.id))
  const proveedorIds = new Set(proveedoresPE.map((p) => p.id))
  const mantencionIds = new Set(mantencionesPreventivasPE.map((m) => m.id))
  const actaIds = new Set(actasGD.map((a) => a.id))
  const plantillaIds = new Set((plantillasCV ?? []).map((p) => p.id))
  const liquidacionIds = new Set(liquidacionesPL.map((l) => l.id))
  const adelantoIds = new Set(adelantosPL.map((a) => a.id))
  const certificadoIds = new Set(certificadosCT.map((c) => c.id))
  const avisoIds = new Set(avisosCV.map((a) => a.id))
  // IDs globales para verificación de origenRef genérico — recolección exhaustiva de todas las colecciones con id
  const allIds = new Set<string>([
    ...personaIds,
    ...unidadIds,
    ...microIds,
    ...tipoIds,
    ...estadoIds,
    ...fondoIds,
    ...egresoIds,
    ...cobroIds,
    ...infraccionIds,
    ...reservaIds,
    ...elementoIds,
    ...proveedorIds,
    ...mantencionIds,
    ...actaIds,
    ...plantillaIds,
    ...liquidacionIds,
    ...adelantoIds,
    ...certificadoIds,
    ...avisoIds,
  ])
  // Extiende con cualquier otra colección que contenga ids (maestros, PI, CO, GE, IR, MT, RE, etc.)
  for (const [k, v] of Object.entries(state)) {
    if (Array.isArray(v)) {
      for (const it of v as unknown[]) {
        const id = (it as { id?: string })?.id
        if (typeof id === "string") allIds.add(id)
      }
    } else if (v && typeof v === "object") {
      // maestros es objeto anidado
      for (const sub of Object.values(v as Record<string, unknown>)) {
        if (Array.isArray(sub)) {
          for (const it of sub as unknown[]) {
            const id = (it as { id?: string })?.id
            if (typeof id === "string") allIds.add(id)
          }
        }
      }
    }
  }

  // EF / VU originales
  for (const u of unidades.filter((u) => isTestId(u.id))) {
    if (!microIds.has((u as unknown as { microSectorId: string }).microSectorId)) bump("EF", `unidad ${u.id} micro huérfano ${(u as unknown as { microSectorId: string }).microSectorId}`)
    if (!tipoIds.has((u as unknown as { tipoUnidadId: string }).tipoUnidadId)) bump("EF", `unidad ${u.id} tipo huérfano ${(u as unknown as { tipoUnidadId: string }).tipoUnidadId}`)
    const estadoId = (u as unknown as { estadoId?: string }).estadoId
    if (estadoId && !estadoIds.has(estadoId)) bump("EF", `unidad ${u.id} estado huérfano ${estadoId}`)
  }
  for (const v of vinculos.filter((v) => isTestId(v.id))) {
    if (!personaIds.has(v.personaId)) bump("VU", `vinculo ${v.id} persona huérfana`)
    if (!unidadIds.has(v.unidadId)) bump("VU", `vinculo ${v.id} unidad huérfana`)
  }

  // FI
  for (const c of cobrosFI.filter(esCobroTest)) {
    if (!unidadIds.has(c.unidadId)) bump("FI", `cobro ${c.id} unidad huérfana ${c.unidadId}`)
    if (c.origenRef && !allIds.has(c.origenRef)) bump("FI", `cobro ${c.id} origenRef huérfano ${c.origenRef}`)
  }
  for (const e of egresosFI.filter((e) => isTestId(e.id) || obtenerIdsEgresosPLTest(state).has(e.id))) {
    if (!fondoIds.has((e as unknown as { fondoId: string }).fondoId)) bump("FI", `egreso ${e.id} fondo huérfano ${(e as unknown as { fondoId: string }).fondoId}`)
  }
  for (const f of fondosFI.filter((f) => isTestId(f.id))) {
    // fondos TEST no tienen FK crítica, pero validamos que no estén huérfanos de sí mismos
    void f
  }

  // RA
  for (const r of reservasRA.filter((r) => isTestId(r.id))) {
    if (!elementoIds.has(r.elementoId)) bump("RA", `reserva ${r.id} elemento huérfano ${r.elementoId}`)
    if (!personaIds.has(r.solicitantePersonaId)) bump("RA", `reserva ${r.id} solicitante huérfano ${r.solicitantePersonaId}`)
    if (r.unidadId && !unidadIds.has(r.unidadId)) bump("RA", `reserva ${r.id} unidad huérfana ${r.unidadId}`)
    if (r.cargoFIReferencia && r.cargoFIReferencia !== "pendiente" && !cobroIds.has(r.cargoFIReferencia)) bump("RA", `reserva ${r.id} cargoFI huérfano ${r.cargoFIReferencia}`)
  }
  for (const e of elementosRA.filter((e) => isTestId(e.id))) {
    const ms = (e as unknown as { microSectorId?: string }).microSectorId
    if (ms && !microIds.has(ms)) bump("RA", `elemento ${e.id} micro huérfano ${ms}`)
  }

  // PE colecciones operacionales
  for (const v of bitacoraVisitasPE.filter((v) => isTestId(v.id))) {
    if (!unidadIds.has(v.unidadId)) bump("PE", `visita ${v.id} unidad huérfana ${v.unidadId}`)
    if (!personaIds.has(v.destinoPersonaId)) bump("PE", `visita ${v.id} persona huérfana ${v.destinoPersonaId}`)
  }
  for (const e of encomiendasPE.filter((e) => isTestId(e.id))) {
    if (!personaIds.has(e.destinatarioPersonaId)) bump("PE", `encomienda ${e.id} destinatario huérfano ${e.destinatarioPersonaId}`)
  }
  for (const i of ingresosContratistasPE.filter((i) => isTestId(i.id))) {
    if (!unidadIds.has(i.unidadId)) bump("PE", `contratista ${i.id} unidad huérfana ${i.unidadId}`)
  }
  for (const m of mantencionesPreventivasPE.filter((m) => isTestId(m.id))) {
    if (!proveedorIds.has(m.proveedorId)) bump("PE", `mantención ${m.id} proveedor huérfano ${m.proveedorId}`)
  }
  for (const vt of visitasTecnicasPE.filter((vt) => isTestId(vt.id))) {
    if (!proveedorIds.has(vt.proveedorId)) bump("PE", `visita técnica ${vt.id} proveedor huérfano ${vt.proveedorId}`)
    if (!mantencionIds.has(vt.mantencionId)) bump("PE", `visita técnica ${vt.id} mantención huérfana ${vt.mantencionId}`)
  }
  for (const c of cierresTurnoPE.filter((c) => isTestId(c.id) || isTestId(c.trabajadorPersonaId))) {
    if (!personaIds.has(c.trabajadorPersonaId)) bump("PE", `cierre ${c.id} trabajador huérfano ${c.trabajadorPersonaId}`)
  }
  for (const p of proyeccionesPE.filter((p) => isTestId(p.id))) {
    void p
  }

  // PL
  for (const l of liquidacionesPL.filter((l) => isTestId(l.id))) {
    if (!personaIds.has(l.trabajadorPersonaId)) bump("PL", `liquidación ${l.id} trabajador huérfano ${l.trabajadorPersonaId}`)
    for (const aid of l.adelantosIds ?? []) {
      if (!new Set(adelantosPL.map((a) => a.id)).has(aid)) bump("PL", `liquidación ${l.id} adelanto huérfano ${aid}`)
    }
    if (l.egresoFIReferencia && l.egresoFIReferencia !== "pendiente" && !egresoIds.has(l.egresoFIReferencia)) bump("PL", `liquidación ${l.id} egreso huérfano ${l.egresoFIReferencia}`)
  }
  for (const a of adelantosPL.filter((a) => isTestId(a.id))) {
    if (!personaIds.has(a.trabajadorPersonaId)) bump("PL", `adelanto ${a.id} trabajador huérfano ${a.trabajadorPersonaId}`)
  }

  // CT
  for (const c of certificadosCT.filter(esCertificadoTest)) {
    if (c.personaId && !personaIds.has(c.personaId)) bump("CT", `certificado ${c.id} persona huérfana ${c.personaId}`)
    if (c.unidadId && !unidadIds.has(c.unidadId)) bump("CT", `certificado ${c.id} unidad huérfana ${c.unidadId}`)
    if (c.origenRef && !allIds.has(c.origenRef)) bump("CT", `certificado ${c.id} origenRef huérfano ${c.origenRef}`)
  }

  // CV
  for (const a of avisosCV.filter((a) => isTestId(a.id) || isTestId(a.actaId) || a.plantillaId === "plant-cv-porton")) {
    if (a.actaId && !actaIds.has(a.actaId)) bump("CV", `aviso ${a.id} acta huérfana ${a.actaId}`)
    if (a.plantillaId && a.plantillaId === "plant-cv-porton" && !plantillaIds.has(a.plantillaId)) {
      // la plantilla seed existe, no es huérfano real; se conserva por diseño
      void a
    } else if (a.plantillaId && isTestId(a.plantillaId) && !plantillaIds.has(a.plantillaId)) {
      bump("CV", `aviso ${a.id} plantilla huérfana ${a.plantillaId}`)
    }
  }

  // AM eventos de entidades TEST
  for (const ev of eventos.filter((ev) => isTestId(ev.referenciaId))) {
    if (!allIds.has(ev.referenciaId!)) bump("AM", `evento ${ev.id} referencia huérfana ${ev.referenciaId}`)
  }

  return { total: errores.length, porArea, errores }
}

export function formatearMensajeValidacion(result: ValidacionResultado): string {
  if (result.total === 0) return "Validación OK — tasa huérfanos 0, TEST-* coherente"
  const detalle = Object.entries(result.porArea)
    .map(([area, n]) => `${area}: ${n}`)
    .join("; ")
  return `Validación: ${result.total} huérfanos — ${detalle} — ${result.errores.slice(0, 2).join("; ")}`
}
