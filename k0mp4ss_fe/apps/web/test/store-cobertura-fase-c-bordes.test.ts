import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore, resolverVariablesCO } from "@/lib/store"
import type {
  ActaGD,
  ElementoRA,
  ReservaRA,
  SolicitudGE,
} from "@/lib/schemas"
import { resetStore } from "./helpers"

// SERIE-DEUDA-1 P5 (fase c, borde): cobertura comportamental de los últimos
// statements de `lib/store/helpers.ts`, `slices/ad-slice.ts` y
// `slices/ge-slice.ts` que la suite previa no ejercitaba: ramas de reemplazo
// de plantillas, gate de morosidad RA §2 con deuda realmente vencida, y
// preservación de los demás registros de la colección al mover un ticket.
// Todo por API pública (`useCompassStore` + exports de `@/lib/store`).

const getState = () => useCompassStore.getState()

const hoy = () => new Date().toISOString().slice(0, 10)

function fechaFutura(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

function periodoMesesAtras(meses: number): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - meses)
  return d.toISOString().slice(0, 7)
}

// Propietario vigente (activo) con unidad real, apto para emitirle un cobro.
function propietarioVigente(): { personaId: string; unidadId: string } {
  const s = getState()
  const v = s.vinculos.find(
    (x) =>
      x.rol === "propietario" &&
      !x.fechaFin &&
      !x.unidadId.startsWith("u-E-") &&
      s.personas.find((p) => p.id === x.personaId)?.estadoCuenta === "activa"
  )
  if (!v) throw new Error("seed sin propietario vigente")
  return { personaId: v.personaId, unidadId: v.unidadId }
}

const elementoBase = (partial: Partial<ElementoRA>): ElementoRA => ({
  id: "ra-borde-el",
  nombre: "Quincho borde TEST",
  tipo: "espacio_fisico",
  franja: "bloques_horas",
  duracionBloqueHoras: 3,
  tarifaUso: 0,
  garantiaRequerida: 0,
  activo: true,
  ...partial,
})

const reservaBorde = (partial: Partial<ReservaRA>): ReservaRA => ({
  id: "ra-borde-rs",
  folio: "",
  elementoId: "ra-borde-el",
  solicitantePersonaId: propietarioVigente().personaId,
  unidadId: propietarioVigente().unidadId,
  fecha: fechaFutura(20),
  horaInicio: "10:00",
  horaFin: "12:00",
  estado: "confirmada",
  montoTarifa: 0,
  montoGarantia: 0,
  ...partial,
})

const solicitudGEBase = (partial: Partial<SolicitudGE>): SolicitudGE => ({
  id: "ge-borde-1",
  folio: "",
  tipo: "grabaciones",
  titulo: "Solicitud borde TEST",
  descripcion: "Revisión de cámaras del lobby por hurto de paquete.",
  solicitantePersonaId: undefined,
  unidadId: undefined,
  estado: "nuevo",
  fechaCreacion: hoy(),
  comentarios: [],
  detalleGrabaciones: {
    fechaSuceso: hoy(),
    horaSuceso: "18:30",
    justificacion: "Un courier retiró un paquete que no era suyo a las 18:30.",
  },
  historialEstados: [],
  ...partial,
})

const actaBase = (partial: Partial<ActaGD>): ActaGD => ({
  id: "acta-borde-1",
  fecha: hoy(),
  hora: "19:00",
  lugar: "Sede comunitaria borde",
  tablaTemas: ["Gasto común"],
  presentes: [],
  ausentes: [],
  invitados: [],
  minuta: "Se acuerda revisar el contrato de ascensores.",
  adjuntos: [],
  estado: "borrador",
  aprobaciones: [],
  ...partial,
})

describe("bordes fase c: helpers CO de plantillas", () => {
  beforeEach(resetStore)

  it("resolverVariablesCO sustituye variables y cae a 'vecino/a' sin nombre de destinatario", () => {
    const texto =
      "[Nombre_Usuario], aviso para [Nombre_Comunidad] en [Nombre_Torre]."

    const conNombre = resolverVariablesCO(getState, texto, "Ana Pérez")
    expect(conNombre).toContain("Ana Pérez")
    expect(conNombre).not.toContain("[Nombre_Usuario]")
    expect(conNombre).not.toContain("[Nombre_Comunidad]")
    expect(conNombre).not.toContain("[Nombre_Torre]")

    // Sin nombre y con nombre en blanco → reemplazo genérico.
    expect(resolverVariablesCO(getState, texto)).toContain("vecino/a")
    const soloEspacios = resolverVariablesCO(getState, texto, "   ")
    expect(soloEspacios).toContain("vecino/a")
    expect(soloEspacios).not.toContain("[Nombre_Usuario]")
  })
})

describe("bordes fase c: gate de morosidad RA §2 (getDeudaVigenteFI)", () => {
  beforeEach(() => {
    resetStore()
    getState().saveElementoRA(
      elementoBase({ microSectorId: getState().microSectores[0]!.id })
    )
  })

  it("sin deuda vencida la reserva se confirma (control)", () => {
    const r = getState().saveReservaRA(reservaBorde({}))
    expect(r.ok).toBe(true)
    expect(getState().reservasRA).toHaveLength(1)
  })

  it("un cobro vencido impago bloquea la reserva y detalla el monto adeudado", () => {
    const { unidadId } = propietarioVigente()
    // Vencimiento ~día de corte de hace dos meses: siempre anterior a hoy.
    expect(
      getState().emitirGastoComun({
        periodo: periodoMesesAtras(2),
        gastoTotal: 200000,
        unidadIds: [unidadId],
      }).ok
    ).toBe(true)
    const cobro = getState().cobrosFI[0]!
    expect(cobro.fechaVencimiento! < hoy()).toBe(true)

    const r = getState().saveReservaRA(reservaBorde({}))
    expect(r.ok).toBe(false)
    expect(r.error).toContain("No se puede reservar")
    expect(r.error).toMatch(
      /deuda vencida en Finanzas \(\$[\d.]+ en \d+ cobro\(s\)\)/
    )
    // El bloqueo no crea la reserva.
    expect(getState().reservasRA).toHaveLength(0)

    // Al regularizar la deuda el mismo tramo vuelve a ser reservable.
    expect(
      getState().registrarPagoFI(cobro.id, {
        monto: cobro.montoBase,
        medio: "transferencia",
      }).ok
    ).toBe(true)
    expect(getState().saveReservaRA(reservaBorde({})).ok).toBe(true)
  })
})

describe("bordes fase c: transiciones GE preservan los demás tickets", () => {
  beforeEach(resetStore)

  it("abrir, responder y resolver mueven solo el ticket objetivo", () => {
    const unidadId = getState().unidades[0]!.id
    expect(
      getState().saveSolicitudGE(solicitudGEBase({ id: "ge-borde-1", unidadId }))
        .ok
    ).toBe(true)
    expect(
      getState().saveSolicitudGE(
        solicitudGEBase({
          id: "ge-borde-2",
          unidadId,
          titulo: "Solicitud paralela borde TEST",
        })
      ).ok
    ).toBe(true)
    const vecinoAntes = getState().solicitudesGE.find(
      (t) => t.id === "ge-borde-2"
    )!

    expect(getState().abrirSolicitudGE("ge-borde-1").ok).toBe(true)
    const abierto = getState().solicitudesGE.find((t) => t.id === "ge-borde-1")!
    expect(abierto.estado).toBe("en_revision")
    expect(abierto.historialEstados.map((h) => h.a)).toContain("en_revision")
    expect(
      getState().solicitudesGE.find((t) => t.id === "ge-borde-2")
    ).toEqual(vecinoAntes)

    expect(
      getState().responderSolicitudGE("ge-borde-1", {
        autorRol: "administracion",
        texto: "Necesitamos la hora exacta del suceso.",
      }).ok
    ).toBe(true)
    expect(
      getState().solicitudesGE.find((t) => t.id === "ge-borde-1")!.estado
    ).toBe("requiere_accion_vecino")
    expect(
      getState().solicitudesGE.find((t) => t.id === "ge-borde-2")
    ).toEqual(vecinoAntes)

    expect(
      getState().resolverSolicitudGE("ge-borde-1", "Cámaras revisadas con el conserje.")
        .ok
    ).toBe(true)
    const resuelto = getState().solicitudesGE.find((t) => t.id === "ge-borde-1")!
    expect(resuelto.estado).toBe("resuelto")
    expect(resuelto.resolucion).toContain("Cámaras revisadas")
    expect(
      getState().solicitudesGE.find((t) => t.id === "ge-borde-2")
    ).toEqual(vecinoAntes)
  })
})

describe("bordes fase c: publicarActaEnCV sin tabla de temas", () => {
  beforeEach(resetStore)

  it("publica el aviso sin prefijo de temas y deja intactas las demás actas", () => {
    const directivo = getState().personas[0]!
    expect(
      getState().savePersona({
        ...directivo,
        datosGobernanza: {
          id: "gob-borde-1",
          cargoDirectiva: "presidente",
          fechaAsuncion: "2026-01-01",
        },
      }).ok
    ).toBe(true)

    expect(
      getState().saveActaGD(
        actaBase({
          id: "acta-borde-1",
          tablaTemas: [],
          presentes: [directivo.id],
          minuta: "Sesión breve sin tabla de temas.",
        })
      ).ok
    ).toBe(true)
    expect(
      getState().saveActaGD(
        actaBase({ id: "acta-borde-2", lugar: "Conserjería borde" })
      ).ok
    ).toBe(true)
    const otraAntes = getState().actasGD.find((a) => a.id === "acta-borde-2")!

    for (const personaId of getState()
      .personas.filter((p) => p.datosGobernanza && p.estadoCuenta === "activa")
      .map((p) => p.id)) {
      expect(getState().aprobarActaGD("acta-borde-1", personaId).ok).toBe(true)
    }
    expect(
      getState().actasGD.find((a) => a.id === "acta-borde-1")!.estado
    ).toBe("publicada")

    expect(getState().publicarActaEnCV("acta-borde-1").ok).toBe(true)

    const acta = getState().actasGD.find((a) => a.id === "acta-borde-1")!
    const aviso = getState().avisosCV.find((a) => a.id === acta.avisoCVReferencia)!
    expect(aviso.actaId).toBe("acta-borde-1")
    expect(aviso.cuerpo).toContain("Reunión de directiva")
    expect(aviso.cuerpo).toContain("Sesión breve sin tabla de temas.")
    expect(aviso.cuerpo).not.toContain("Temas:")
    expect(getState().actasGD.find((a) => a.id === "acta-borde-2")).toEqual(
      otraAntes
    )
  })
})
