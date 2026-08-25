import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore } from "@/lib/store"
import type { ActaGD, Persona } from "@/lib/schemas"
import { resetStore } from "./helpers"

const getState = () => useCompassStore.getState()

const directivoBase = (partial: Partial<Persona>): Persona => ({
  id: "p-dir-1",
  rut: "12.345.678-5",
  nombreCompleto: "Directivo Test Uno",
  nombres: "Directivo",
  apellidos: "Test Uno",
  email: "directivo1@test.cl",
  telefonoMovil: "+56 9 3333 1111",
  estadoCuenta: "activa",
  condicionesEspecialesIds: [],
  roles: ["directiva"],
  datosGobernanza: { id: "gob-d1", cargoDirectiva: "presidente", fechaAsuncion: "2026-01-01" },
  ...partial,
})

const actaBase = (partial: Partial<ActaGD>): ActaGD => ({
  id: "acta-gd-1",
  fecha: "2026-08-20",
  hora: "19:00",
  lugar: "Sede comunitaria",
  tablaTemas: ["Gasto común", "Mantenimiento ascensores"],
  presentes: [],
  ausentes: [],
  invitados: ["Asesor legal"],
  minuta: "Se acuerda revisar el contrato de ascensores.",
  adjuntos: [],
  estado: "borrador",
  aprobaciones: [],
  ...partial,
})

function prepararDirectiva(): void {
  getState().savePersona(directivoBase({}))
}

describe("GD - Gestión de Directiva en el store", () => {
  beforeEach(resetStore)

  describe("saveActaGD", () => {
    it("crea acta y audita GD_ACTA_CREATED + asistencia por presente", () => {
      prepararDirectiva()

      const r = getState().saveActaGD(actaBase({ presentes: ["p-dir-1"] }))

      expect(r.ok).toBe(true)
      const eventos = getState().eventos.map(e => e.tipoAccion)
      expect(eventos).toContain("GD_ACTA_CREATED")
      expect(eventos.filter(t => t === "GD_ASISTENCIA_REG")).toHaveLength(1)
      expect(getState().actasGD).toHaveLength(1)
    })

    it("rechaza asistente inexistente o sin extensión de gobernanza", () => {
      expect(getState().saveActaGD(actaBase({ presentes: ["p-fantasma"] })).ok).toBe(false)

      // Persona sin datosGobernanza no es directiva
      getState().savePersona({
        id: "p-civil", rut: "12.345.678-5", nombreCompleto: "Civil Test", nombres: "Civil", apellidos: "Test",
        email: "civil@test.cl", telefonoMovil: "+56 9 0000 0000", estadoCuenta: "activa",
        condicionesEspecialesIds: [], roles: ["propietario"],
      })
      const r = getState().saveActaGD(actaBase({ ausentes: ["p-civil"] }))
      expect(r.ok).toBe(false)
      expect(r.error).toContain("no es miembro de la directiva")
      expect(getState().actasGD).toHaveLength(0)
    })

    it("rechaza adjunto embebido (D1) por esquema ImagenReferencia", () => {
      const r = getState().saveActaGD(
        actaBase({ adjuntos: [{ nombre: "acta.pdf", tipoMime: "application/pdf", tamanoKB: 900, url: "data:application/pdf;base64,JVBERi0=" }] })
      )
      expect(r.ok).toBe(false)
      expect(r.error).toContain("Media por referencia")
    })

    it("acepta adjunto por URL http(s)", () => {
      const r = getState().saveActaGD(
        actaBase({ adjuntos: [{ nombre: "acta.pdf", tipoMime: "application/pdf", tamanoKB: 900, url: "https://cdn.example.com/acta.pdf" }] })
      )
      expect(r.ok).toBe(true)
    })
  })

  describe("aprobarActaGD", () => {
    beforeEach(() => {
      prepararDirectiva()
      getState().saveActaGD(actaBase({ id: "acta-flujo", presentes: ["p-dir-1"] }))
    })

    it("rechaza aprobación de quien no es directiva vigente", () => {
      const r = getState().aprobarActaGD("acta-flujo", "no-existe")
      expect(r.ok).toBe(false)
      expect(r.error).toContain("miembro vigente")
      expect(getState().actasGD[0]!.aprobaciones).toHaveLength(0)
    })

    it("registra firma individual sin publicar si falta quórum", () => {
      // Segunda directiva activa que aún no firma
      getState().savePersona(
        directivoBase({ id: "p-dir-2", nombreCompleto: "Directivo Test Dos", apellidos: "Test Dos", datosGobernanza: { id: "gob-d2", cargoDirectiva: "tesorero", fechaAsuncion: "2026-01-01" } })
      )

      const r = getState().aprobarActaGD("acta-flujo", "p-dir-1")

      expect(r.ok).toBe(true)
      const acta = getState().actasGD.find(a => a.id === "acta-flujo")!
      expect(acta.estado).toBe("borrador")
      expect(acta.aprobaciones).toEqual(["p-dir-1"])
      expect(getState().eventos.filter(e => e.tipoAccion === "GD_ACTA_APPROVED")).toHaveLength(1)
    })

    it("publica al completar quórum 100%, notifica a propietarios y deja referencia CV pendiente", () => {
      // Directiva vigente = seeds con gobernanza + la agregada por prepararDirectiva
      const directivaVigente = getState().personas
        .filter(p => p.datosGobernanza && p.estadoCuenta === "activa")
        .map(p => p.id)
      const notificacionesAntes = getState().notificaciones.length

      let ultimoResultado = { ok: false }
      for (const idMiembro of directivaVigente) {
        ultimoResultado = getState().aprobarActaGD("acta-flujo", idMiembro)
      }

      expect(ultimoResultado.ok).toBe(true)
      const acta = getState().actasGD.find(a => a.id === "acta-flujo")!
      expect(acta.estado).toBe("publicada")
      expect(acta.fechaPublicacion).toBeTruthy()
      expect(acta.avisoCVReferencia).toBe("pendiente")

      const propietariosSeed = new Set(
        getState().vinculos.filter(v => v.rol === "propietario" && !v.fechaFin).map(v => v.personaId)
      )
      expect(getState().notificaciones.length - notificacionesAntes).toBe(propietariosSeed.size)
      const ultimaNotif = getState().notificaciones[getState().notificaciones.length - 1]!
      expect(ultimaNotif.canal).toBe("email_simulado")
      expect(ultimaNotif.moduloOrigen).toBe("GD")
    })

    it("no permite aprobar dos veces ni re-aprobar un acta publicada", () => {
      const r1 = getState().aprobarActaGD("acta-flujo", "p-dir-1")
      expect(r1.ok).toBe(true)

      expect(getState().aprobarActaGD("acta-flujo", "p-dir-1").error).toContain("ya aprobó")

      // Nueva acta: se firma hasta el quórum y luego rechaza nuevas firmas
      const directivaVigente = getState().personas
        .filter(p => p.datosGobernanza && p.estadoCuenta === "activa")
        .map(p => p.id)
      getState().saveActaGD(actaBase({ id: "acta-2", presentes: ["p-dir-1"] }))
      for (const idMiembro of directivaVigente) {
        getState().aprobarActaGD("acta-2", idMiembro)
      }
      const acta2 = getState().actasGD.find(a => a.id === "acta-2")!
      expect(acta2.estado).toBe("publicada")
      expect(getState().aprobarActaGD("acta-2", directivaVigente[0]!).error).toContain("ya está publicada")
    })
  })
})
