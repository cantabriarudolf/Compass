import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore } from "@/lib/store"
import { calcularDigitoVerificador } from "@/lib/rut"
import type { Persona, TrabajoMT, ProyectoMT } from "@/lib/schemas"
import { resetStore } from "./helpers"

const getState = () => useCompassStore.getState()

const rutValido = (cuerpo: string): string => `${cuerpo.slice(0, 2)}.${cuerpo.slice(2, 5)}.${cuerpo.slice(5, 8)}-${calcularDigitoVerificador(cuerpo)}`

const personaBase = (partial: Partial<Persona>): Persona => ({
  id: "p-mt-1",
  rut: rutValido("15467892"),
  nombreCompleto: "Test Técnico Interno",
  nombres: "Test",
  apellidos: "Técnico Interno",
  email: "tecnico@test.cl",
  telefonoMovil: "+56 9 3333 3333",
  estadoCuenta: "activa",
  condicionesEspecialesIds: [],
  roles: ["personal"],
  ...partial,
})


const trabajoBase = (partial: Partial<TrabajoMT>): TrabajoMT => ({
  id: "mt-1",
  folio: "",
  titulo: "Mantención Hidropack TEST",
  descripcion: "Revisión mensual de presiones, sellos y tablero de control del hidropack.",
  activoIRId: undefined,
  responsablePersonaId: undefined,
  proveedor: { nombre: "AquaServicio TEST", contacto: "+56 9 8888 0000" },
  prioridad: "media",
  estado: "planificado",
  costoTotal: 180000,
  origenFondos: "gasto_comun",
  estadoPago: "pendiente",
  alertaGarantiaEnviada: false,
  evidencias: [],
  ...partial,
})

const proyectoBase = (partial: Partial<ProyectoMT>): ProyectoMT => ({
  id: "py-1",
  nombre: "Mantención de techos TEST",
  presupuestoEstimado: 12000000,
  plazoMeses: 120,
  estado: "planificado",
  ...partial,
})

describe("MT - Mantenimiento y Proyectos en el store", () => {
  beforeEach(resetStore)

  describe("saveTrabajoMT", () => {
    it("crea con folio MT único, ubicación EF obligatoria y FKs validadas", () => {
      const sinUbicacion = getState().saveTrabajoMT(trabajoBase({}))
      expect(sinUbicacion.ok).toBe(false)
      expect(sinUbicacion.error).toContain("ubicación")

      const unidadId = getState().unidades[0]!.id
      const r1 = getState().saveTrabajoMT(trabajoBase({ unidadId }))
      const r2 = getState().saveTrabajoMT(trabajoBase({ id: "mt-2", titulo: "Cambio cerradura", descripcion: "Reemplazo de cerradura de acceso principal por deterioro.", unidadId }))
      expect(r1.ok).toBe(true)
      expect(r2.ok).toBe(true)
      expect(getState().trabajosMT.map(t => t.folio)).toEqual(["MT-0001", "MT-0002"])
      expect(getState().eventos.filter(e => e.tipoAccion === "MT_WORK_CREATED")).toHaveLength(2)

      const activoFantasma = getState().saveTrabajoMT(trabajoBase({ id: "mt-3", titulo: "Trabajo fantasma", descripcion: "Intento con activo IR inexistente para validar la FK.", unidadId, activoIRId: "ir-fantasma" }))
      expect(activoFantasma.ok).toBe(false)
    })

    it("exige responsable interno o proveedor; garantía coherente", () => {
      const unidadId = getState().unidades[0]!.id
      const sinResponsable = getState().saveTrabajoMT(trabajoBase({ unidadId, proveedor: undefined }))
      expect(sinResponsable.ok).toBe(false)
      expect(sinResponsable.error).toContain("responsable")

      const garantiaInvertida = getState().saveTrabajoMT(
        trabajoBase({ unidadId, garantiaInicio: "2026-06-01", garantiaFin: "2026-05-01" })
      )
      expect(garantiaInvertida.ok).toBe(false)

      getState().savePersona(personaBase({}))
      const interno = getState().saveTrabajoMT(trabajoBase({ id: "mt-int", unidadId, proveedor: undefined, responsablePersonaId: "p-mt-1" }))
      expect(interno.ok).toBe(true)
    })
  })

  describe("flujo preventivo", () => {
    beforeEach(() => {
      getState().saveTrabajoMT(
        trabajoBase({
          id: "mt-prev",
          unidadId: getState().unidades[0]!.id,
          preventivo: { periodicidadMeses: 1 },
        })
      )
    })

    it("iniciar → finalizar genera el próximo ciclo automáticamente", () => {
      const rIni = getState().iniciarTrabajoMT("mt-prev")
      expect(rIni.ok).toBe(true)
      expect(getState().trabajosMT.find(t => t.id === "mt-prev")!.estado).toBe("en_curso")
      expect(getState().eventos.filter(e => e.tipoAccion === "MT_WORK_STARTED")).toHaveLength(1)

      const rFin = getState().finalizarTrabajoMT("mt-prev", { fechaTermino: "2026-08-25", costoFinal: 190000 })
      expect(rFin.ok).toBe(true)
      expect(getState().eventos.filter(e => e.tipoAccion === "MT_WORK_FINISHED")).toHaveLength(1)

      const generados = getState().trabajosMT.filter(t => t.estado === "planificado" && t.id !== "mt-prev")
      expect(generados).toHaveLength(1)
      const siguiente = generados[0]!
      expect(siguiente.fechaProgramada).toBe("2026-09-25")
      expect(getState().eventos.filter(e => e.tipoAccion === "MT_PREVENTIVE_GENERATED")).toHaveLength(1)
      expect(getState().notificaciones.some(n => n.asunto.includes("preventiva programada"))).toBe(true)

      // Doble finalización rechazada.
      expect(getState().finalizarTrabajoMT("mt-prev").ok).toBe(false)
    })

    it("correctivo sin config preventiva no genera ciclo", () => {
      getState().saveTrabajoMT(
        trabajoBase({ id: "mt-corr", titulo: "Reparación luminaria", descripcion: "Cambio de balastro en luminaria del estacionamiento subterráneo.", unidadId: getState().unidades[0]!.id })
      )
      getState().iniciarTrabajoMT("mt-corr")
      getState().finalizarTrabajoMT("mt-corr", { fechaTermino: "2026-08-25" })
      expect(getState().eventos.filter(e => e.tipoAccion === "MT_PREVENTIVE_GENERATED")).toHaveLength(0)
      expect(getState().trabajosMT.filter(t => t.estado === "planificado")).toHaveLength(1) // solo mt-prev
    })

    it("cancelar solo desde planificado/en_curso", () => {
      expect(getState().cancelarTrabajoMT("mt-prev").ok).toBe(true)
      expect(getState().cancelarTrabajoMT("mt-prev").ok).toBe(false)
    })
  })

  describe("pagos y garantías", () => {
    beforeEach(() => {
      getState().saveTrabajoMT(
        trabajoBase({
          id: "mt-pago",
          unidadId: getState().unidades[0]!.id,
          estado: "finalizado",
          fechaTermino: "2026-08-01",
          garantiaInicio: "2026-08-01",
          garantiaFin: "2027-08-01",
        })
      )
    })

    it("transiciones pendiente→parcial→pagado sin saltos inválidos", () => {
      expect(getState().actualizarPagoTrabajoMT("mt-pago", "pagado").ok).toBe(true)
      expect(getState().actualizarPagoTrabajoMT("mt-pago", "parcial").ok).toBe(false)
      expect(getState().actualizarPagoTrabajoMT("mt-pago", "pendiente").ok).toBe(true)
      expect(getState().actualizarPagoTrabajoMT("mt-pago", "pagado").ok).toBe(true)
    })

    it("garantía lejana no alerta; verificación idempotente", () => {
      // Garantía hasta 2027 → sin alerta.
      expect(getState().verificarGarantiasMT().ok).toBe(true)
      expect(getState().eventos.filter(e => e.tipoAccion === "MT_GUARANTEE_EXPIRED")).toHaveLength(0)

      // Garantía vencida → una sola alerta.
      getState().saveTrabajoMT(
        trabajoBase({
          id: "mt-garan",
          titulo: "Impermeabilización TEST",
          descripcion: "Sellado de losas y muros perimetrales del estanque de agua.",
          unidadId: getState().unidades[0]!.id,
          estado: "finalizado",
          fechaTermino: "2026-01-10",
          garantiaInicio: "2026-01-10",
          garantiaFin: "2026-07-10",
        })
      )
      const r1 = getState().verificarGarantiasMT()
      expect(r1.ok).toBe(true)
      expect(getState().eventos.filter(e => e.tipoAccion === "MT_GUARANTEE_EXPIRED")).toHaveLength(1)
      expect(getState().notificaciones.some(n => n.asunto.includes("vencida"))).toBe(true)

      getState().verificarGarantiasMT()
      expect(getState().eventos.filter(e => e.tipoAccion === "MT_GUARANTEE_EXPIRED")).toHaveLength(1)
    })
  })

  describe("proyectos", () => {
    it("alta con cuota sugerida derivable y eliminación", () => {
      const r = getState().saveProyectoMT(proyectoBase({}))
      expect(r.ok).toBe(true)
      const proyecto = getState().proyectosMT[0]!
      expect(proyecto.presupuestoEstimado / proyecto.plazoMeses).toBe(100000)

      const invalido = getState().saveProyectoMT(proyectoBase({ id: "py-2", plazoMeses: 0 }))
      expect(invalido.ok).toBe(false)

      expect(getState().removeProyectoMT("py-1").ok).toBe(true)
      expect(getState().proyectosMT).toHaveLength(0)
    })
  })
})
