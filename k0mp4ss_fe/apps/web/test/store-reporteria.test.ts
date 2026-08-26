import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore, STORE_VERSION, seedData } from "@/lib/store"
import {
  metricasDemograficasRE,
  metricasOperativasRE,
  embudoGestionesGE,
  saludCajaFI,
  resolverSegmentacionRE,
  tasaHuerfanosRE,
} from "@/lib/reporteria-utils"
import { resetStore, lastEvent } from "./helpers"

const getState = () => useCompassStore.getState()
const migrate = useCompassStore.persist.getOptions().migrate

describe("RE - utilidades puras de reportería", () => {
  it("demografía: ratio de ocupación, tenencias y condiciones especiales", () => {
    const r = metricasDemograficasRE({
      vinculos: [
        { personaId: "p1", unidadId: "u1", rol: "propietario", fechaInicio: "2026-01-01" },
        { personaId: "p2", unidadId: "u1", rol: "arrendatario", fechaInicio: "2026-01-01" },
        { personaId: "p3", unidadId: "u2", rol: "propietario", fechaInicio: "2026-01-01" },
        { personaId: "p4", unidadId: "u3", rol: "propietario", fechaFin: "2026-02-01", fechaInicio: "2026-01-01" },
      ] as never,
      personas: [
        { id: "p1", condicionesEspecialesIds: [] },
        { id: "p2", condicionesEspecialesIds: ["c1"] },
        { id: "p3", condicionesEspecialesIds: [] },
      ] as never,
      unidadesHabitablesIds: ["u1", "u2", "u3"],
    })
    expect(r.unidadesConPropietario).toBe(2)
    expect(r.unidadesConArrendatario).toBe(1)
    expect(r.ratioOcupacionPct).toBe(67)
    expect(r.unidadesConCondicionesEspeciales).toBe(1)
  })

  it("operativo: turnos cerrados hoy vs jornadas y visitas confirmadas", () => {
    const r = metricasOperativasRE({
      cierresTurnoPE: [{ fecha: "2026-08-26", jornadaReportadaId: "j-manana" }] as never,
      jornadasIds: ["j-manana", "j-tarde", "j-noche"],
      bitacoraVisitasPE: [
        { fecha: "2026-08-26", origenAgenda: "pre_agendada", estado: "ingresada" },
        { fecha: "2026-08-26", origenAgenda: "pre_agendada", estado: "agendada" },
        { fecha: "2026-08-26", origenAgenda: "sin_aviso", estado: "ingresada" },
      ],
      fecha: "2026-08-26",
    })
    expect(r.turnosTotales).toBe(3)
    expect(r.turnosCerrados).toBe(1)
    expect(r.visitasPreAgendadas).toBe(2)
    expect(r.visitasConfirmadas).toBe(1)
  })

  it("embudo GE: etapas exactas y tasa de resolución", () => {
    const r = embudoGestionesGE([
      { estado: "nuevo" },
      { estado: "en_revision" },
      { estado: "requiere_accion_vecino" },
      { estado: "en_proceso" },
      { estado: "resuelto" },
      { estado: "cerrado" },
      { estado: "cerrado" },
    ] as never[])
    expect(r.total).toBe(7)
    expect(r.nuevas).toBe(1)
    expect(r.enRevision).toBe(2)
    expect(r.enProceso).toBe(1)
    expect(r.solucionadas).toBe(1)
    expect(r.dadasEnConocimiento).toBe(2)
    expect(r.tasaResolucionPct).toBe(43)
  })

  it("salud de caja: recaudación por fondo, diferencia y termómetro", () => {
    const r = saludCajaFI({
      cobrosFI: [
        { fondoId: "f-gc", montoBase: 100000, pagos: [{ monto: 60000, fecha: "x", medio: "t" }], moras: [], diferencias: [] },
        { fondoId: "f-am", montoBase: 50000, pagos: [], moras: [], diferencias: [] },
      ] as never[],
      egresosFI: [
        { monto: 30000, esRecurrente: true },
        { monto: 20000, esRecurrente: false },
      ] as never[],
      fondos: [{ id: "f-gc", nombre: "GC" }, { id: "f-am", nombre: "Amenities" }],
    })
    const gc = r.recaudacionPorFondo.find(f => f.fondoId === "f-gc")!
    expect(gc.emitido).toBe(100000)
    expect(gc.recaudado).toBe(60000)
    expect(r.ingresosNetos).toBe(60000)
    expect(r.egresosTotales).toBe(50000)
    expect(r.diferenciaCaja).toBe(10000)
    expect(r.gastosFijosRecurrentes).toBe(30000)
    expect(r.termometroVerde).toBe(false)
  })

  it("segmentación: Torre×tenencia resuelve sin duplicados y perfiles especiales sin vínculo", () => {
    const personas = [
      { id: "prop-ta", roles: ["residente"], estadoCuenta: "activa", datosGobernanza: undefined, condicionesEspecialesIds: [] },
      { id: "arr-ta", roles: ["residente"], estadoCuenta: "activa", datosGobernanza: undefined, condicionesEspecialesIds: [] },
      { id: "conserje", roles: ["personal"], estadoCuenta: "activa", datosGobernanza: undefined, condicionesEspecialesIds: [] },
    ] as never[]
    const vinculos = [
      { personaId: "prop-ta", unidadId: "u-ta-1", rol: "propietario", fechaInicio: "2026-01-01" },
      { personaId: "arr-ta", unidadId: "u-ta-2", rol: "arrendatario", fechaInicio: "2026-01-01" },
    ] as never[]
    // Torre A completa + ambas tenencias.
    const ambos = resolverSegmentacionRE({
      segmento: { perfiles: [], tenencias: ["propietarios", "arrendatarios"] },
      unidadesAlcanceIds: ["u-ta-1", "u-ta-2"],
      vinculos: vinculos as never,
      personas: personas as never,
    }).sort()
    expect(ambos).toEqual(["arr-ta", "prop-ta"])
    // Solo propietarios.
    const soloProp = resolverSegmentacionRE({
      segmento: { perfiles: [], tenencias: ["propietarios"] },
      unidadesAlcanceIds: ["u-ta-1", "u-ta-2"],
      vinculos: vinculos as never,
      personas: personas as never,
    })
    expect(soloProp).toEqual(["prop-ta"])
    // Perfil personal sin unidad (no vive en la comunidad).
    const staff = resolverSegmentacionRE({
      segmento: { perfiles: ["personal"], tenencias: [] },
      unidadesAlcanceIds: [],
      vinculos: vinculos as never,
      personas: personas as never,
    })
    expect(staff).toEqual(["conserje"])
  })

  it("tasa huérfanos: dangling FK sobre total estructural", () => {
    const r = tasaHuerfanosRE({
      unidades: [{ id: "u-ok", microSectorId: "m1" }, { id: "u-mal", microSectorId: "m-x" }],
      microSectores: [{ id: "m1" }],
      vinculos: [{ personaId: "p-mal", unidadId: "u-ok" }],
      personas: [{ id: "p-ok" }],
    })
    expect(r.dangling).toBe(2)
    expect(r.total).toBe(4)
    expect(r.tasaPct).toBe(50)
  })
})

describe("RE - store y acciones", () => {
  beforeEach(resetStore)

  it("vista dashboard auditada con RE_DASHBOARD_VIEW", () => {
    getState().registrarVistaDashboardRE("financiero")
    expect(lastEvent()?.tipoAccion).toBe("RE_DASHBOARD_VIEW")
    expect(getState().eventos[getState().eventos.length - 1]!.referenciaId).toBe("financiero")
  })

  it("genera reporte con snapshot inmutable y valida FKs del segmento", () => {
    const macro = getState().macroSectores[0]!
    const mal = getState().generarReporteRE({
      titulo: "Segmento fantasma TEST",
      bloques: ["morosidad"],
      segmento: { macroSectorIds: [`${macro.id}-no-existe`] },
    })
    expect(mal.ok).toBe(false)
    expect(mal.error).toContain("macroSectorId")
    const r = getState().generarReporteRE({
      titulo: "Morosidad general TEST",
      bloques: ["morosidad", "gastos_mes"],
      segmento: { tenencias: ["propietarios"] },
    })
    expect(r.ok).toBe(true)
    const rep = getState().reportesRE[0]!
    expect(rep.bloques).toHaveLength(2)
    expect(rep.payloadSnapshot.find(b => b.bloque === "morosidad")!.lineas.some(l => l.etiqueta === "Deuda vencida total")).toBe(true)
    expect(rep.distribuidoA).toBe(0)
    expect(lastEvent()?.tipoAccion).toBe("RE_REPORT_GENERATED")
    const vacio = getState().generarReporteRE({ titulo: "Sin bloques TEST", bloques: [], segmento: {} })
    expect(vacio.ok).toBe(false)
    expect(vacio.error).toContain("bloque")
  })

  it("distribución resuelve destinatarios vigentes, notifica y es idempotente", () => {
    // Segmento a todo propietario del seed + personal activo.
    const rGen = getState().generarReporteRE({
      titulo: "Boletín TEST distribución",
      bloques: ["gastos_mes"],
      segmento: { perfiles: ["personal"], tenencias: ["propietarios"] },
      id: "test-re-rep-1",
    })
    expect(rGen.ok).toBe(true)
    const antesNotif = getState().notificaciones.filter(n => n.moduloOrigen === "RE").length
    const r = getState().distribuirReporteRE("test-re-rep-1")
    expect(r.ok).toBe(true)
    const rep = getState().reportesRE.find(x => x.id === "test-re-rep-1")!
    expect(rep.distribuidoA).toBe(rep.destinatariosPersonaId.length)
    expect(rep.distribuidoA).toBeGreaterThan(0)
    expect(getState().notificaciones.filter(n => n.moduloOrigen === "RE").length - antesNotif).toBe(rep.distribuidoA)
    expect(lastEvent()?.tipoAccion).toBe("RE_REPORT_DISTRIBUTED")
    // Idempotencia: segunda distribución rechazada.
    const dup = getState().distribuirReporteRE("test-re-rep-1")
    expect(dup.ok).toBe(false)
    expect(dup.error).toContain("ya fue distribuido")
  })

  it("eliminación restringida a reportes TEST; inexistentes bloqueados", () => {
    expect(getState().removeReporteRE("re-nadie").error).toContain("no existe")
    expect(getState().generarReporteRE({ titulo: "Permanente TEST", bloques: ["morosidad"], segmento: {} }).ok).toBe(true)
    const idReal = getState().reportesRE[0]!.id
    const bloqueado = getState().removeReporteRE(idReal)
    expect(bloqueado.ok).toBe(false)
    expect(bloqueado.error).toContain("TEST")
  })

  it(`usa versión ${STORE_VERSION} y migrate v25 siembra reportesRE`, async () => {
    expect(STORE_VERSION).toBeGreaterThanOrEqual(25)
    const seed = seedData()
    const prev: Record<string, unknown> = {
      personas: seed.personas,
      configuracion: seed.configuracion,
      maestros: { feriados: seed.maestros.feriados },
    }
    const result = migrate!(prev as never, 24) as Record<string, unknown>
    expect(Array.isArray(result["reportesRE"])).toBe(true)
  })
})
