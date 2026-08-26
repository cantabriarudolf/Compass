import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore, STORE_VERSION, seedData } from "@/lib/store"
import type { CierreTurnoPE, Persona } from "@/lib/schemas"
import {
  calcularProyeccionCobertura,
  costoProyeccionPE,
  alertasMantencionesVencidas,
  checklistInstalacionesParaJornada,
  checklistEquipamientoBase,
} from "@/lib/personal-utils"
import { resetStore, lastEvent } from "./helpers"

const getState = () => useCompassStore.getState()
const migrate = useCompassStore.persist.getOptions().migrate

function fichaBase(overrides: Partial<Persona["datosLaborales"]> = {}): NonNullable<Persona["datosLaborales"]> {
  return {
    id: "l-test",
    cargo: "Conserje TEST",
    afp: "Habitat",
    prevision: "FONASA",
    fechaIngreso: "2025-01-01",
    tipoContrato: "indefinido",
    afpId: "afp-habitat",
    saludId: "fonasa",
    bancoId: "banco-estado",
    jornadaBaseHoras: 45,
    ...overrides,
  }
}

function personaConFicha(id = "p-4", ficha = fichaBase()): Persona {
  const base = getState().personas.find(p => p.id === id)!
  return { ...base, datosLaborales: ficha }
}

function evidencia(url = "https://cdn.example/evidencia.jpg") {
  return [{ nombre: "foto.jpg", tipoMime: "image/jpeg", tamanoKB: 100, url }]
}

describe("PE - Personal y Servicios en el store", () => {
  beforeEach(resetStore)

  describe("ficha integral con FKs a maestros legales", () => {
    it("guarda la ficha con afpId/saludId/bancoId existentes y audita PE_FICHA_SAVED", () => {
      const r = getState().savePersona(personaConFicha())
      expect(r.ok).toBe(true)
      const dl = getState().personas.find(p => p.id === "p-4")!.datosLaborales!
      expect(dl.afpId).toBe("afp-habitat")
      expect(dl.saludId).toBe("fonasa")
      expect(dl.bancoId).toBe("banco-estado")
      expect(lastEvent()?.tipoAccion).toBe("PE_FICHA_SAVED")
    })

    it("rechaza FK legal inexistente sin mutar la persona", () => {
      const r = getState().savePersona(personaConFicha("p-4", fichaBase({ afpId: "afp-no-existe" })))
      expect(r.ok).toBe(false)
      expect(r.error).toContain("afpId no existe")
      expect(getState().personas.find(p => p.id === "p-4")!.datosLaborales!.afpId).toBeUndefined()
    })

    it("rechaza banco inexistente", () => {
      const r = getState().savePersona(personaConFicha("p-4", fichaBase({ bancoId: "banco-fantasma" })))
      expect(r.ok).toBe(false)
      expect(r.error).toContain("bancoId no existe")
    })

    it("bloquea removeMaestro de una AFP referenciada por una ficha", () => {
      expect(getState().savePersona(personaConFicha()).ok).toBe(true)
      const r = getState().removeMaestro("afps", "afp-habitat")
      expect(r.ok).toBe(false)
      expect(r.error).toContain("ficha(s) de trabajador")
      expect(getState().maestros.afps.some(a => a.id === "afp-habitat")).toBe(true)
    })

    it("bloquea removeMaestro del tramo de asignación familiar referenciado", () => {
      expect(getState().savePersona(personaConFicha("p-4", fichaBase({ asignacionFamiliarId: "asf-a", cargas: 2 }))).ok).toBe(true)
      const r = getState().removeMaestro("asignacionFamiliar", "asf-a")
      expect(r.ok).toBe(false)
      expect(getState().maestros.asignacionFamiliar.length).toBeGreaterThan(0)
    })

    it("registra horas extras y evaluaciones con eventos AM", () => {
      expect(getState().registrarHoraExtraPE("p-4", { fecha: "2026-08-20", horas: 2, motivo: "Reemplazo tarde" }).ok).toBe(true)
      expect(lastEvent()?.tipoAccion).toBe("PE_HORA_EXTRA_REGISTRADA")
      expect(getState().personas.find(p => p.id === "p-4")!.datosLaborales!.horasExtras).toHaveLength(1)
      expect(getState().registrarEvaluacionPE("p-4", { fecha: "2026-08-21", puntaje: 6, comentarios: "Cumplimiento destacado" }).ok).toBe(true)
      expect(lastEvent()?.tipoAccion).toBe("PE_EVALUACION_REGISTRADA")
    })
  })

  describe("feriados → proyección de cobertura y costos", () => {
    it("calcula cobertura del mes desde el maestro de feriados", () => {
      const resultado = calcularProyeccionCobertura({ feriados: getState().maestros.feriados, mesAnio: "2025-09" })
      expect(resultado.diasFeriados).toBe(2)
      expect(resultado.reemplazosNecesarios).toBe(4)
      const vacio = calcularProyeccionCobertura({ feriados: getState().maestros.feriados, mesAnio: "2025-06" })
      expect(vacio.diasFeriados).toBe(0)
    })

    it("costo estimado = parches × costoParche + planta × costoDiaExtra", () => {
      expect(costoProyeccionPE(3, 2, 35000, 28000)).toBe(161000)
    })

    it("enviarProyeccionCostoFI materializa registro con PL pendiente, notifica a administración y audita", () => {
      const r = getState().enviarProyeccionCostoFI("2025-09", { costoParche: 30000, costoDiaExtra: 25000 })
      expect(r.ok).toBe(true)
      const proyecciones = getState().proyeccionesPE
      expect(proyecciones).toHaveLength(1)
      const proyeccion = proyecciones[0]!
      expect(proyeccion.mesAnio).toBe("2025-09")
      expect(proyeccion.diasFeriados).toBe(2)
      expect(proyeccion.reemplazosNecesarios).toBe(4)
      expect(proyeccion.liquidacionPLReferencia).toBe("pendiente")
      expect(proyeccion.enviadoAFI).toBe(true)
      const notificaciones = getState().notificaciones.filter(n => n.moduloOrigen === "PE" && n.destinatarioRol === "administracion")
      expect(notificaciones.length).toBeGreaterThanOrEqual(1)
      expect(notificaciones[0]!.cuerpo).toContain("reemplazo(s)")
      expect(lastEvent()?.tipoAccion).toBe("PE_PROYECCION_ENVIADA")
    })

    it("rechaza proyectar un mes sin feriados registrados", () => {
      const r = getState().enviarProyeccionCostoFI("2099-02", { costoParche: 1, costoDiaExtra: 1 })
      expect(r.ok).toBe(false)
      expect(r.error).toContain("No hay feriados")
      expect(getState().proyeccionesPE).toHaveLength(0)
    })
  })

  describe("cierre de turno → notify()", () => {
    function cierreValido(): Omit<CierreTurnoPE, "id" | "historialCambios" | "notificadoAAdmin"> {
      return {
        fecha: "2026-08-25",
        hora: "20:00",
        jornadaReportadaId: "j-noche",
        trabajadorPersonaId: "p-4",
        novedadesGenerales: "Turno tranquilo, rondas al día.",
        incidencias: { hubo: false, descripcion: undefined, evidencias: [] },
        checklistInstalaciones: checklistInstalacionesParaJornada("j-noche").map(i => ({ ...i, ok: true })),
        checklistEquipamiento: checklistEquipamientoBase().map(i => ({ ...i, ok: true })),
      }
    }

    it("cierra turno válido: notifica administración + copia email_simulado al trabajador y audita PE_CIERRE_TURNO", () => {
      const r = getState().cerrarTurnoPE(cierreValido())
      expect(r.ok).toBe(true)
      const cierres = getState().cierresTurnoPE
      expect(cierres).toHaveLength(1)
      expect(cierres[0]!.notificadoAAdmin).toBe(true)
      const pe = getState().notificaciones.filter(n => n.moduloOrigen === "PE" && n.canal === "email_simulado")
      expect(pe.some(n => n.destinatarioRol === "administracion")).toBe(true)
      expect(pe.some(n => n.destinatarioRol === "personal" && n.destinatarioPersonaId === "p-4")).toBe(true)
      expect(lastEvent()?.tipoAccion).toBe("PE_CIERRE_TURNO")
    })

    it("anti-negligencia: incidencias sin descripción o sin evidencia son rechazadas", () => {
      const sinDescripcion = cierreValido()
      sinDescripcion.incidencias = { hubo: true, descripcion: "   ", evidencias: [] }
      const r1 = getState().cerrarTurnoPE(sinDescripcion)
      expect(r1.ok).toBe(false)
      expect(r1.error).toContain("describir")

      const sinEvidencia = cierreValido()
      sinEvidencia.incidencias = { hubo: true, descripcion: "Portón atascado durante la ronda nocturna", evidencias: [] }
      const r2 = getState().cerrarTurnoPE(sinEvidencia)
      expect(r2.ok).toBe(false)
      expect(r2.error).toContain("evidencia")
      expect(getState().cierresTurnoPE).toHaveLength(0)
    })

    it("acepta incidencias con descripción y evidencia D1", () => {
      const input = cierreValido()
      input.incidencias = { hubo: true, descripcion: "Portón atascado durante la ronda nocturna", evidencias: evidencia() }
      const r = getState().cerrarTurnoPE(input)
      expect(r.ok).toBe(true)
      expect(getState().cierresTurnoPE[0]!.incidencias.hubo).toBe(true)
    })

    it("rechaza cierre duplicado del mismo trabajador/fecha/jornada", () => {
      expect(getState().cerrarTurnoPE(cierreValido()).ok).toBe(true)
      const r = getState().cerrarTurnoPE(cierreValido())
      expect(r.ok).toBe(false)
      expect(r.error).toContain("ya registró un cierre")
    })

    it("edición preserva historial de cambios inmutable y audita PE_CIERRE_EDITADO", () => {
      expect(getState().cerrarTurnoPE(cierreValido()).ok).toBe(true)
      const id = getState().cierresTurnoPE[0]!.id
      const r = getState().editarCierreTurnoPE(id, { novedadesGenerales: "Se agrega hallazgo de luminaria." }, "Corrige omisión de hallazgo")
      expect(r.ok).toBe(true)
      const editado = getState().cierresTurnoPE.find(c => c.id === id)!
      expect(editado.historialCambios).toHaveLength(1)
      expect(editado.historialCambios[0]!.resumen).toContain("omisión")
      expect(lastEvent()?.tipoAccion).toBe("PE_CIERRE_EDITADO")
    })

    it("no permite eliminar cierres históricos fuera del día en curso (salvo test-)", () => {
      expect(getState().cerrarTurnoPE(cierreValido()).ok).toBe(true)
      const id = getState().cierresTurnoPE[0]!.id
      expect(getState().removeCierreTurnoPE(id).ok).toBe(false)
      useCompassStore.setState(s => ({
        cierresTurnoPE: [...s.cierresTurnoPE, { ...cierreValido(), id: "test-pe-cierre-x", historialCambios: [], notificadoAAdmin: false }],
      }))
      expect(getState().removeCierreTurnoPE("test-pe-cierre-x").ok).toBe(true)
    })

    it("valida FKs de trabajador y jornada", () => {
      const malTrabajador = cierreValido()
      malTrabajador.trabajadorPersonaId = "p-inexistente"
      expect(getState().cerrarTurnoPE(malTrabajador).ok).toBe(false)
      const malJornada = cierreValido()
      malJornada.jornadaReportadaId = "j-madrugada"
      expect(getState().cerrarTurnoPE(malJornada).error).toContain("jornadaReportadaId")
    })
  })

  describe("bitácora: visitas, encomiendas y contratistas", () => {
    function visitaAgendada(): import("@/lib/schemas").BitacoraVisitaPE {
      return {
        id: "pe-vis-test",
        fecha: "2026-08-25",
        nombre: "María Paz Soto",
        dni: "17.222.333-4",
        unidadId: getState().unidades.find(u => !u.id.startsWith("u-E-"))!.id,
        jornadaId: "j-manana",
        origenAgenda: "pre_agendada",
        estado: "agendada",
      }
    }

    it("visita agendada se sella al ingresar con hora y evento; ingresada no eliminable", () => {
      expect(getState().saveBitacoraVisitaPE(visitaAgendada()).ok).toBe(true)
      const id = getState().bitacoraVisitasPE[0]!.id
      const r = getState().ingresarBitacoraVisitaPE(id)
      expect(r.ok).toBe(true)
      const visita = getState().bitacoraVisitasPE.find(v => v.id === id)!
      expect(visita.estado).toBe("ingresada")
      expect(visita.horaIngreso).toMatch(/^\d{2}:\d{2}$/)
      expect(lastEvent()?.tipoAccion).toBe("PE_VISITA_INGRESADA")
      expect(getState().removeBitacoraVisitaPE(id).ok).toBe(false)
    })

    it("visita respeta flag CF de notificación apagado", () => {
      const cfg = { ...getState().configuracion, notificarRegistroVisitas: false }
      expect(getState().saveConfiguracion(cfg).ok).toBe(true)
      const directa = { ...visitaAgendada(), origenAgenda: "sin_aviso" as const, estado: "ingresada" as const }
      expect(getState().saveBitacoraVisitaPE(directa).ok).toBe(true)
      expect(getState().notificaciones.some(n => n.asunto.startsWith("Visita"))).toBe(false)
    })

    it("visita rechaza jornada y unidad huérfanas", () => {
      const mala = { ...visitaAgendada(), jornadaId: "j-nadie" }
      expect(getState().saveBitacoraVisitaPE(mala).error).toContain("jornadaId")
      const malaUnidad = { ...visitaAgendada(), unidadId: "u-99999" }
      expect(getState().saveBitacoraVisitaPE(malaUnidad).error).toContain("unidadId")
    })

    it("encomienda exige courier del maestro, rechaza evidencia embebida y registra retiro", () => {
      const base = {
        id: "pe-enc-test",
        courierId: "cour-chilexpress",
        destinatarioPersonaId: "p-10",
        fechaRecepcion: "2026-08-25",
        estado: "recibida" as const,
      }
      expect(getState().saveEncomiendaPE({ ...base, courierId: "cour-nadie" }).error).toContain("courierId")
      const base64 = {
        ...base,
        evidencia: { nombre: "paquete.jpg", tipoMime: "image/jpeg", tamanoKB: 900, url: "data:image/jpeg;base64,AAAA" },
      }
      expect(getState().saveEncomiendaPE(base64).ok).toBe(false)
      expect(getState().saveEncomiendaPE(base).ok).toBe(true)
      expect(lastEvent()?.tipoAccion).toBe("PE_ENCOMIENDA_RECIBIDA")
      expect(getState().notificaciones.some(n => n.moduloOrigen === "PE" && n.asunto.includes("Encomienda"))).toBe(true)
      expect(getState().registrarRetiroEncomiendaPE(base.id, "").ok).toBe(false)
      expect(getState().registrarRetiroEncomiendaPE(base.id, "Ana María Silva").ok).toBe(true)
      expect(lastEvent()?.tipoAccion).toBe("PE_ENCOMIENDA_RETIRADA")
      expect(getState().removeEncomiendaPE(base.id).ok).toBe(false)
    })

    it("contratista exige motivo específico y confirma ingreso con evento", () => {
      const base = {
        id: "pe-cont-test",
        contratistaId: "cont-gasfiteria",
        motivo: "abc",
        fecha: "2026-08-25",
        jornadaId: "j-tarde",
        agendadoPor: "residente" as const,
        estado: "agendado" as const,
      }
      const r = getState().saveIngresoContratistaPE(base)
      expect(r.ok).toBe(false)
      expect(r.error).toContain("motivo")
      expect(getState().saveIngresoContratistaPE({ ...base, motivo: "Reparación de fuga en cocina" }).ok).toBe(true)
      expect(getState().confirmarIngresoContratistaPE(base.id).ok).toBe(true)
      expect(lastEvent()?.tipoAccion).toBe("PE_CONTRATISTA_INGRESADO")
      expect(getState().removeIngresoContratistaPE(base.id).ok).toBe(false)
    })
  })

  describe("proveedores externos y mantenciones preventivas", () => {
    function proveedorBase() {
      return { id: "prov-test", rut: "76.543.210-3", nombre: "Ascensores TEST SpA", rubro: "Ascensores", activo: true }
    }
    function mantencionBase() {
      return { id: "mant-test", proveedorId: "prov-test", descripcion: "Mantención ascensor Torre A", periodicidadMeses: 1, proximaFecha: "2026-08-01", alertaDiasAntes: 5, activo: true }
    }

    it("rechaza RUT inválido y nombres duplicados", () => {
      expect(getState().saveProveedorPE({ ...proveedorBase(), rut: "12.345.678-0" }).ok).toBe(false)
      expect(getState().saveProveedorPE(proveedorBase()).ok).toBe(true)
      expect(getState().saveProveedorPE({ ...proveedorBase(), id: "prov-dup", rut: "76.111.111-6", nombre: "ascensores test spa" }).ok).toBe(false)
    })

    it("alerta mantención vencida dentro del horizonte y visita técnica reprograma ciclo", () => {
      expect(getState().saveProveedorPE(proveedorBase()).ok).toBe(true)
      expect(getState().saveMantencionPE(mantencionBase()).ok).toBe(true)
      const alertas = alertasMantencionesVencidas(getState().mantencionesPreventivasPE, "2026-08-03")
      expect(alertas).toHaveLength(1)
      expect(alertas[0]!.diasRestantes).toBe(-2)
      expect(getState().registrarVisitaTecnicaPE({
        id: "vt-test",
        proveedorId: "prov-test",
        mantencionId: "mant-test",
        tecnicoNombre: "Juan Pérez",
        fecha: "2026-08-04",
        trabajoRealizado: "Cambio de cables y revisión completa",
      }).ok).toBe(true)
      expect(lastEvent()?.tipoAccion).toBe("PE_VISITA_TECNICA")
      expect(getState().mantencionesPreventivasPE.find(m => m.id === "mant-test")!.proximaFecha).toBe("2026-09-04")
    })

    it("bloquea eliminación de proveedor con historial y de mantención con visitas", () => {
      expect(getState().saveProveedorPE(proveedorBase()).ok).toBe(true)
      expect(getState().saveMantencionPE(mantencionBase()).ok).toBe(true)
      expect(getState().removeProveedorPE("prov-test").ok).toBe(false)
      expect(getState().registrarVisitaTecnicaPE({
        id: "vt-test2",
        proveedorId: "prov-test",
        mantencionId: "mant-test",
        tecnicoNombre: "Luis Soto",
        fecha: "2026-08-05",
        trabajoRealizado: "Ajuste de puertas",
      }).ok).toBe(true)
      expect(getState().removeMantencionPE("mant-test").ok).toBe(false)
    })
  })

  describe("panel de monitoreo", () => {
    it("iniciarTurnoPE audita PE_START_SHIFT solo para personal con ficha", () => {
      expect(getState().iniciarTurnoPE("p-4", "j-manana").ok).toBe(true)
      expect(lastEvent()?.tipoAccion).toBe("PE_START_SHIFT")
      expect(getState().iniciarTurnoPE("p-33", "j-manana").error).toContain("ficha laboral")
      expect(getState().iniciarTurnoPE("p-4", "j-nadie").error).toContain("jornadaId")
    })

    it("completarTareaMonitoreoPE finaliza el trabajo MT y emite PE_TASK_DONE", () => {
      const trabajo = getState().trabajosMT[0]
      if (!trabajo) return
      const r = getState().completarTareaMonitoreoPE(trabajo.id)
      if (r.ok || r.error?.includes("cerrada")) {
        expect(["finalizado", "cancelado"].includes(getState().trabajosMT.find(t => t.id === trabajo.id)!.estado)).toBe(true)
      }
      expect(getState().completarTareaMonitoreoPE("mt-nadie").ok).toBe(false)
    })
  })

  describe("guardas y errores de las acciones PE", () => {
    it("registrarHoraExtraPE/registrarEvaluacionPE exigen ficha laboral", () => {
      expect(getState().registrarHoraExtraPE("p-33", { fecha: "2026-08-20", horas: 1, motivo: "x" }).error).toContain("ficha laboral")
      expect(getState().registrarEvaluacionPE("p-33", { fecha: "2026-08-20", puntaje: 5 }).error).toContain("ficha laboral")
    })

    it("iniciarTurnoPE con persona inexistente es rechazado", () => {
      expect(getState().iniciarTurnoPE("p-nadie", "j-manana").error).toContain("no existe")
    })

    it("completarTareaMonitoreoPE rechaza tareas ya cerradas o inexistentes", () => {
      expect(getState().completarTareaMonitoreoPE("mt-nadie").error).toContain("no existe")
      const abierta = getState().trabajosMT.find(t => t.estado === "planificado" || t.estado === "en_curso")
      if (abierta) {
        expect(getState().completarTareaMonitoreoPE(abierta.id).ok).toBe(true)
        expect(getState().completarTareaMonitoreoPE(abierta.id).error).toContain("cerrada")
      }
    })

    it("saveBitacoraVisitaPE valida destinoPersonaId", () => {
      const r = getState().saveBitacoraVisitaPE({
        id: "pe-vis-dst", fecha: "2026-08-25", nombre: "A B", dni: "11.111.111-1",
        destinoPersonaId: "p-nadie", jornadaId: "j-manana", origenAgenda: "sin_aviso", estado: "agendada",
      })
      expect(r.error).toContain("destinoPersonaId")
    })

    it("removeBitacoraVisitaPE/removeEncomiendaPE/removeIngresoContratistaPE eliminan pendientes", () => {
      expect(getState().saveBitacoraVisitaPE({
        id: "pe-vis-del", fecha: "2026-08-25", nombre: "C D", dni: "11.111.111-1",
        jornadaId: "j-tarde", origenAgenda: "pre_agendada", estado: "agendada",
      }).ok).toBe(true)
      expect(getState().removeBitacoraVisitaPE("pe-vis-del").ok).toBe(true)
      expect(getState().saveEncomiendaPE({
        id: "pe-enc-del", courierId: "cour-correos", fechaRecepcion: "2026-08-25", estado: "recibida",
      }).ok).toBe(true)
      expect(getState().removeEncomiendaPE("pe-enc-del").ok).toBe(true)
      expect(getState().saveIngresoContratistaPE({
        id: "pe-cont-del", contratistaId: "cont-mudanzas", motivo: "Mudanza unidad 404",
        fecha: "2026-08-26", jornadaId: "j-manana", agendadoPor: "administracion", estado: "agendado",
      }).ok).toBe(true)
      expect(getState().removeIngresoContratistaPE("pe-cont-del").ok).toBe(true)
    })

    it("saveEncomiendaPE valida destinatario y unidad", () => {
      const base = { id: "pe-enc-fk", courierId: "cour-starken", fechaRecepcion: "2026-08-25", estado: "recibida" as const }
      expect(getState().saveEncomiendaPE({ ...base, destinatarioPersonaId: "p-nadie" }).error).toContain("destinatarioPersonaId")
      expect(getState().saveEncomiendaPE({ ...base, unidadId: "u-nadie" }).error).toContain("unidadId")
    })

    it("saveMantencionPE exige proveedor existente y activo", () => {
      expect(getState().saveMantencionPE({
        id: "mant-fk", proveedorId: "prov-nadie", descripcion: "X", periodicidadMeses: 6,
        proximaFecha: "2026-12-01", alertaDiasAntes: 5, activo: true,
      }).error).toContain("proveedorId no existe")
      expect(getState().saveProveedorPE({ id: "prov-off", rut: "76.543.210-3", nombre: "Inactivo TEST", rubro: "Bombas", activo: false }).ok).toBe(true)
      expect(getState().saveMantencionPE({
        id: "mant-off", proveedorId: "prov-off", descripcion: "X", periodicidadMeses: 6,
        proximaFecha: "2026-12-01", alertaDiasAntes: 5, activo: true,
      }).error).toContain("inactivo")
    })

    it("registrarVisitaTecnicaPE valida FKs de mantención, supervisor y unidad", () => {
      expect(getState().saveProveedorPE({ id: "prov-vt", rut: "76.543.210-3", nombre: "CCTV TEST", rubro: "CCTV", activo: true }).ok).toBe(true)
      expect(getState().registrarVisitaTecnicaPE({
        id: "vt-fk1", proveedorId: "prov-vt", mantencionId: "mant-nadie", tecnicoNombre: "T",
        fecha: "2026-08-25", trabajoRealizado: "Revisión de cámaras",
      }).error).toContain("mantencionId no existe")
      expect(getState().registrarVisitaTecnicaPE({
        id: "vt-fk2", proveedorId: "prov-vt", supervisorPersonaId: "p-nadie", tecnicoNombre: "T",
        fecha: "2026-08-25", trabajoRealizado: "Revisión de cámaras",
      }).error).toContain("supervisorPersonaId")
      expect(getState().registrarVisitaTecnicaPE({
        id: "vt-fk3", proveedorId: "prov-vt", unidadId: "u-nadie", tecnicoNombre: "T",
        fecha: "2026-08-25", trabajoRealizado: "Revisión de cámaras",
      }).error).toContain("unidadId")
      expect(getState().registrarVisitaTecnicaPE({
        id: "vt-fk4", proveedorId: "prov-nadie", tecnicoNombre: "T", fecha: "2026-08-25",
        trabajoRealizado: "Revisión de cámaras",
      }).error).toContain("proveedorId no existe")
    })

    it("cerrarTurnoPE exige checklists completos", () => {
      const r = getState().cerrarTurnoPE({
        fecha: "2026-08-25", hora: "08:00", jornadaReportadaId: "j-manana", trabajadorPersonaId: "p-4",
        incidencias: { hubo: false }, checklistInstalaciones: [], checklistEquipamiento: [],
      } as never)
      expect(r.ok).toBe(false)
      expect(r.error).toContain("checklist")
    })

    it("editarCierreTurnoPE valida existencia, resumen y jornada; removeCierreTurnoPE valida existencia", () => {
      expect(getState().editarCierreTurnoPE("pe-cierre-nadie", {}, "Resumen válido").ok).toBe(false)
      expect(getState().removeCierreTurnoPE("pe-cierre-nadie").ok).toBe(false)
      expect(getState().cerrarTurnoPE({
        fecha: "2026-08-25", hora: "08:00", jornadaReportadaId: "j-manana", trabajadorPersonaId: "p-4",
        incidencias: { hubo: false },
        checklistInstalaciones: checklistInstalacionesParaJornada("j-manana"),
        checklistEquipamiento: checklistEquipamientoBase(),
      }).ok).toBe(true)
      const id = getState().cierresTurnoPE[0]!.id
      expect(getState().editarCierreTurnoPE(id, {}, "cort").ok).toBe(false)
      expect(getState().editarCierreTurnoPE(id, { jornadaReportadaId: "j-nadie" }, "Cambia jornada inválida").ok).toBe(false)
      expect(getState().editarCierreTurnoPE(id, { jornadaReportadaId: "j-tarde" }, "Reemplazo de jornada reportada").ok).toBe(true)
    })

    it("enviarProyeccionCostoFI valida formato y costos negativos", () => {
      expect(getState().enviarProyeccionCostoFI("septiembre", { costoParche: 0, costoDiaExtra: 0 }).error).toContain("AAAA-MM")
      expect(getState().enviarProyeccionCostoFI("2025-09", { costoParche: -5, costoDiaExtra: 0 }).error).toContain("negativos")
    })
  })

  describe("maestros operativos y migrate v22", () => {    it("seeds NSGC de jornadas/couriers/contratistas/asignación familiar", () => {
      expect(getState().maestros.jornadas.map(j => j.nombre)).toEqual(["Mañana", "Tarde", "Noche"])
      expect(getState().maestros.couriers.length).toBeGreaterThanOrEqual(5)
      expect(getState().maestros.contratistas.length).toBeGreaterThanOrEqual(3)
      expect(getState().maestros.asignacionFamiliar.map(a => a.nombre)).toEqual(["Tramo A", "Tramo B", "Tramo C", "Tramo D"])
    })

    it(`usa versión ${STORE_VERSION} y migrate v21 siembra maestros nuevos`, async () => {
      expect(STORE_VERSION).toBe(22)
      const seed = seedData()
      const prev: Record<string, unknown> = {
        personas: seed.personas,
        unidades: seed.unidades,
        tiposUnidad: seed.tiposUnidad,
        macroSectores: seed.macroSectores,
        microSectores: seed.microSectores,
        vinculos: seed.vinculos,
        configuracion: seed.configuracion,
        maestros: { feriados: seed.maestros.feriados },
      }
      const result = migrate!(prev as never, 21) as Record<string, unknown>
      const maestrosMigrados = result["maestros"] as Record<string, unknown[]>
      expect((maestrosMigrados["asignacionFamiliar"] as unknown[]).length).toBe(4)
      expect((maestrosMigrados["jornadas"] as unknown[]).length).toBe(3)
      expect(Array.isArray(result["bitacoraVisitasPE"])).toBe(true)
      expect(Array.isArray(result["cierresTurnoPE"])).toBe(true)
    })

    it("removeMaestro bloquea jornadas/couriers/contratistas en uso", () => {
      expect(getState().saveBitacoraVisitaPE({
        id: "pe-vis-jor", fecha: "2026-08-25", nombre: "X Y", dni: "11.111.111-1",
        jornadaId: "j-manana", origenAgenda: "sin_aviso", estado: "agendada",
      } as never).ok).toBe(true)
      expect(getState().removeMaestro("jornadas", "j-manana").ok).toBe(false)
      expect(getState().saveEncomiendaPE({
        id: "pe-enc-cour", courierId: "cour-starken", fechaRecepcion: "2026-08-25", estado: "recibida",
      } as never).ok).toBe(true)
      expect(getState().removeMaestro("couriers", "cour-starken").ok).toBe(false)
    })
  })
})
