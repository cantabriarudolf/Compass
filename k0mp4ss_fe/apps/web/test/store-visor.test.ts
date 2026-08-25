import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore } from "@/lib/store"
import type { AvisoCV, PlantillaCV } from "@/lib/schemas"
import { resetStore } from "./helpers"

const getState = () => useCompassStore.getState()

const avisoBase = (partial: Partial<AvisoCV>): AvisoCV => ({
  id: "cv-1",
  titulo: "Aviso TEST",
  cuerpo: "Cuerpo del aviso de prueba para el carrusel.",
  tipologia: "info",
  duracionSegundos: 10,
  pantallaCompleta: false,
  tags: ["prueba"],
  estado: "borrador",
  requiereVistoBueno: false,
  origen: "manual",
  fechaCreacion: "2026-08-25",
  ...partial,
})

const plantillaBase = (partial: Partial<PlantillaCV>): PlantillaCV => ({
  id: "plant-cv-test",
  titulo: "Plantilla TEST",
  cuerpo: "Cuerpo plantilla TEST.",
  tipologia: "advertencia",
  duracionSegundosSugerida: 8,
  pantallaCompleta: false,
  tags: ["qa"],
  activa: true,
  ...partial,
})

describe("CV - Visor de Mensajes en el store", () => {
  beforeEach(resetStore)

  it("semilla con las plantillas NSGC (hidropack, portón, corte, piscina)", () => {
    expect(getState().plantillasCV.map(p => p.id)).toEqual([
      "plant-cv-hidropack",
      "plant-cv-porton",
      "plant-cv-corte",
      "plant-cv-piscina",
    ])
  })

  describe("ciclo de vida de avisos", () => {
    it("alta como borrador, edición auditada y publicación", () => {
      expect(getState().saveAvisoCV(avisoBase({})).ok).toBe(true)
      const borrador = getState().avisosCV[0]!
      expect(borrador.estado).toBe("borrador")
      expect(getState().eventos.filter(e => e.tipoAccion === "CV_DRAFT_CREATED")).toHaveLength(1)

      const editado = getState().saveAvisoCV({ ...borrador, duracionSegundos: 15 })
      expect(editado.ok).toBe(true)
      expect(getState().eventos.filter(e => e.tipoAccion === "CV_EDITED")).toHaveLength(1)

      expect(getState().publicarAvisoCV("cv-1").ok).toBe(true)
      expect(getState().avisosCV[0]!.estado).toBe("publicado")
      expect(getState().eventos.filter(e => e.tipoAccion === "CV_PUBLISHED")).toHaveLength(1)
    })

    it("solo borradores se eliminan; publicado solo se archiva; archivado inmutable", () => {
      getState().saveAvisoCV(avisoBase({}))
      expect(getState().publicarAvisoCV("cv-1").ok).toBe(true)
      expect(getState().removeAvisoCV("cv-1").ok).toBe(false)

      expect(getState().archivarAvisoCV("cv-1").ok).toBe(true)
      expect(getState().avisosCV[0]!.fechaArchivado).toBeTruthy()
      expect(getState().eventos.filter(e => e.tipoAccion === "CV_ARCHIVED")).toHaveLength(1)

      expect(getState().removeAvisoCV("cv-1").ok).toBe(false)
      const edicionTardia = getState().saveAvisoCV({ ...getState().avisosCV[0]!, titulo: "Hack" })
      expect(edicionTardia.ok).toBe(false)
      expect(edicionTardia.error).toContain("auditoría")
    })

    it("multimedia excluyente: imagen XOR video, base64 rechazado, YouTube validado", () => {
      const conAmbas = getState().saveAvisoCV(
        avisoBase({
          imagenUrl: "https://cdn.comunidad.cl/aviso.jpg",
          videoUrl: "https://www.youtube.com/watch?v=abc123",
        })
      )
      expect(conAmbas.ok).toBe(false)
      expect(conAmbas.error).toContain("excluyente")

      const base64 = getState().saveAvisoCV(avisoBase({ imagenUrl: "data:image/png;base64,iVBOR" }))
      expect(base64.ok).toBe(false)
      expect(base64.error).toContain("D1")

      const videoMalo = getState().saveAvisoCV(avisoBase({ videoUrl: "https://vimeo.com/123" }))
      expect(videoMalo.ok).toBe(false)

      const shortsOk = getState().saveAvisoCV(
        avisoBase({ id: "cv-shorts", videoUrl: "https://www.youtube.com/shorts/xYz9" })
      )
      expect(shortsOk.ok).toBe(true)

      const imgOk = getState().saveAvisoCV(
        avisoBase({ id: "cv-img", imagenUrl: "https://placeholder.supabase.co/aviso.jpg" })
      )
      expect(imgOk.ok).toBe(true)
    })

    it("caducidad automática idempotente sobre publicados vencidos", () => {
      getState().saveAvisoCV(avisoBase({ expiresAt: "2026-08-20" }))
      getState().publicarAvisoCV("cv-1")
      expect(getState().caducarAvisosCV().ok).toBe(true)
      expect(getState().avisosCV[0]!.estado).toBe("archivado")
      const eventos = getState().eventos.filter(e => e.tipoAccion === "CV_ARCHIVED")
      expect(eventos).toHaveLength(1)
      expect(eventos[0]!.descripcion).toContain("expiró automáticamente")

      getState().caducarAvisosCV()
      expect(getState().eventos.filter(e => e.tipoAccion === "CV_ARCHIVED")).toHaveLength(1)
    })
  })

  describe("creación manual supervisada", () => {
    const personaId = () => getState().personas[0]!.id

    it("tercero sin flag rechazado", () => {
      const r = getState().saveAvisoCV(avisoBase({}), personaId())
      expect(r.ok).toBe(false)
      expect(r.error).toContain("habilitación")
    })

    it("tercero habilitado nace en borrador con VB mientras el check global esté activo", () => {
      const p = getState().personas.find(x => x.id === personaId())!
      getState().savePersona({ ...p, permiteCreacionManualCV: true })
      expect(getState().configuracion.cvRequiereVistoBueno ?? true).toBe(true)

      const r = getState().saveAvisoCV(avisoBase({}), personaId())
      expect(r.ok).toBe(true)
      const aviso = getState().avisosCV[0]!
      expect(aviso.creadoPorPersonaId).toBe(personaId())
      expect(aviso.requiereVistoBueno).toBe(true)
      expect(aviso.estado).toBe("borrador")

      // La administración publica tras revisar (VB).
      expect(getState().publicarAvisoCV(aviso.id).ok).toBe(true)
      expect(getState().avisosCV[0]!.requiereVistoBueno).toBe(false)
    })

    it("con check global desactivado el tercero habilitado publica directo", () => {
      const config = getState().configuracion
      getState().saveConfiguracion({ ...config, cvRequiereVistoBueno: false })
      const p = getState().personas.find(x => x.id === personaId())!
      getState().savePersona({ ...p, permiteCreacionManualCV: true })

      getState().saveAvisoCV(avisoBase({}), personaId())
      // Sin VB global, publicarAvisoCV sigue siendo el paso formal; el borrador
      // queda listo sin bloqueo administrativo pendiente.
      expect(getState().avisosCV[0]!.requiereVistoBueno).toBe(false)
    })
  })

  describe("plantillas rápidas", () => {
    it("CRUD y activación instantánea por personal de servicio", () => {
      expect(getState().savePlantillaCV(plantillaBase({ id: "plant-cv-x" })).ok).toBe(true)
      expect(getState().removePlantillaCV("plant-cv-x").ok).toBe(true)

      expect(getState().activarPlantillaCV("plant-cv-porton").ok).toBe(true)
      const aviso = getState().avisosCV.find(a => a.plantillaId === "plant-cv-porton")!
      expect(aviso.estado).toBe("publicado")
      expect(aviso.tipologia).toBe("advertencia")
      expect(aviso.duracionSegundos).toBe(10)
      expect(aviso.requiereVistoBueno).toBe(false)
      expect(getState().eventos.filter(e => e.tipoAccion === "CV_PUBLISHED")).toHaveLength(1)

      // Plantilla desactivada no activa.
      getState().savePlantillaCV(plantillaBase({ id: "plant-cv-off", activa: false }))
      expect(getState().activarPlantillaCV("plant-cv-off").ok).toBe(false)
    })

    it("plantilla usada por avisos no eliminable", () => {
      getState().activarPlantillaCV("plant-cv-porton")
      const r = getState().removePlantillaCV("plant-cv-porton")
      expect(r.ok).toBe(false)
      expect(r.error).toContain("aviso")
    })
  })

  describe("publicarActaEnCV — materialización de avisoCVReferencia", () => {
    beforeEach(() => {
      const s = getState()
      const p99 = s.personas[0]!
      s.savePersona({
        ...p99,
        datosGobernanza: { id: "gob-cv-1", cargoDirectiva: "presidente", fechaAsuncion: "2026-01-01" },
      })
      s.saveActaGD({
        id: "acta-cv-1",
        fecha: "2026-08-24",
        hora: "19:30",
        lugar: "Sede comunitaria",
        tablaTemas: ["Fondo de amenities"],
        presentes: [p99.id],
        ausentes: [],
        invitados: [],
        minuta: "Se aprobó la tarifa del quincho para el segundo semestre.",
        adjuntos: [],
        estado: "borrador",
        aprobaciones: [],
      })
      for (const id of s.personas.filter(p => p.datosGobernanza && p.estadoCuenta === "activa").map(p => p.id)) {
        s.aprobarActaGD("acta-cv-1", id)
      }
    })

    it("publica aviso desde acta y marca la referencia con el id del aviso", () => {
      expect(getState().actasGD[0]!.estado).toBe("publicada")
      expect(getState().actasGD[0]!.avisoCVReferencia).toBe("pendiente")

      const r = getState().publicarActaEnCV("acta-cv-1")
      expect(r.ok).toBe(true)
      const acta = getState().actasGD[0]!
      const aviso = getState().avisosCV.find(a => a.id === acta.avisoCVReferencia)!
      expect(aviso.origen).toBe("acta_gd")
      expect(aviso.actaId).toBe("acta-cv-1")
      expect(aviso.tipologia).toBe("info")
      expect(aviso.tags).toEqual(["directiva", "acta"])
      expect(aviso.estado).toBe("publicado")
      expect(aviso.cuerpo).toContain("Se aprobó la tarifa")
      expect(acta.avisoCVReferencia).not.toBe("pendiente")
      expect(getState().eventos.some(e => e.tipoAccion === "CV_PUBLISHED" && e.descripcion.includes("avisoCVReferencia"))).toBe(true)
    })

    it("reintento idempotente y actas no publicadas rechazadas", () => {
      getState().publicarActaEnCV("acta-cv-1")
      const referencia = getState().actasGD[0]!.avisoCVReferencia

      const repetido = getState().publicarActaEnCV("acta-cv-1")
      expect(repetido.ok).toBe(false)
      expect(repetido.error).toContain("ya fue publicada")
      expect(getState().actasGD[0]!.avisoCVReferencia).toBe(referencia)
      expect(getState().avisosCV.filter(a => a.actaId === "acta-cv-1")).toHaveLength(1)

      // Acta en borrador: rechazada.
      getState().saveActaGD({
        id: "acta-cv-2",
        fecha: "2026-08-25",
        hora: "20:00",
        lugar: "Conserjería",
        tablaTemas: [],
        presentes: [],
        ausentes: [],
        invitados: [],
        minuta: "",
        adjuntos: [],
        estado: "borrador",
        aprobaciones: [],
      })
      const rBorrador = getState().publicarActaEnCV("acta-cv-2")
      expect(rBorrador.ok).toBe(false)
      expect(rBorrador.error).toContain("Publicada")
    })
  })
})
