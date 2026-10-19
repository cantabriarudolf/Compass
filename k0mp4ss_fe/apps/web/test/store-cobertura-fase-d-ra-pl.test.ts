import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore } from "@/lib/store"
import type { AdelantoPL, ElementoRA } from "@/lib/schemas"
import { resetStore, lastEvent } from "./helpers"

/**
 * Fase D de cobertura del store legacy (SERIE-DEUDA-2 D4, change
 * `store-cobertura-fase-d`): `saveElementoRA` y `saveAdelantoPL`.
 * Se afirma el `StoreResult` y el efecto observable contra la API pública:
 * schema, validaciones de referencia, upsert y folio correlativo.
 */
const getState = () => useCompassStore.getState()

const elementoRA = (partial: Partial<ElementoRA>): ElementoRA =>
  ({
    id: "ra-e-d-1",
    nombre: "Quincho TEST D4",
    tipo: "espacio_fisico",
    franja: "dia_completo",
    tarifaUso: 0,
    garantiaRequerida: 0,
    activo: true,
    ...partial,
  }) as ElementoRA

const adelantoPL = (partial: Partial<AdelantoPL>): AdelantoPL =>
  ({
    id: "ade-d-1",
    folio: "",
    trabajadorPersonaId: "p-4",
    fecha: "2026-01-15",
    monto: 50000,
    glosa: "Adelanto de prueba con glosa válida",
    estado: "pendiente",
    ...partial,
  }) as AdelantoPL

// --- RA: Reservas y Amenities ---

describe("saveElementoRA — schema, ubicación y upsert", () => {
  beforeEach(() => resetStore())

  it("rechaza un elemento que no cumple el schema", () => {
    const r = getState().saveElementoRA(
      elementoRA({ nombre: "" } as Partial<ElementoRA>)
    )
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain("nombre")
    expect(getState().elementosRA).toHaveLength(0)
  })

  it("exige una ubicación (sub-sector EF o activo IR)", () => {
    const r = getState().saveElementoRA(elementoRA({}))
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain("exige una ubicación")
  })

  it("rechaza un sub-sector inexistente sin mutar", () => {
    const r = getState().saveElementoRA(
      elementoRA({ microSectorId: "micro-fantasma" })
    )
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain("sub-sector indicado no existe")
    expect(getState().elementosRA).toHaveLength(0)
  })

  it("rechaza un activo IR inexistente sin mutar", () => {
    const r = getState().saveElementoRA(
      elementoRA({ activoIRId: "act-fantasma" })
    )
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain(
      "activo del catálogo IR indicado no existe"
    )
    expect(getState().elementosRA).toHaveLength(0)
  })

  it("crea y luego actualiza el elemento por id (upsert)", () => {
    const microSectorId = getState().microSectores[0]!.id
    expect(getState().saveElementoRA(elementoRA({ microSectorId })).ok).toBe(
      true
    )
    expect(getState().elementosRA).toHaveLength(1)
    expect(
      getState().saveElementoRA(
        elementoRA({ microSectorId, nombre: "Quincho TEST renombrado" })
      ).ok
    ).toBe(true)
    expect(getState().elementosRA).toHaveLength(1)
    expect(getState().elementosRA[0]!.nombre).toBe("Quincho TEST renombrado")
  })
})

// --- PL: Remuneraciones ---

describe("saveAdelantoPL — schema, ficha laboral y folio correlativo", () => {
  beforeEach(() => resetStore())

  it("rechaza un monto no positivo por schema", () => {
    const r = getState().saveAdelantoPL(adelantoPL({ monto: 0 }))
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain("monto")
    expect(getState().adelantosPL).toHaveLength(0)
  })

  it("rechaza un trabajador inexistente en MP", () => {
    const r = getState().saveAdelantoPL(
      adelantoPL({ trabajadorPersonaId: "p-fantasma" })
    )
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain("El trabajador no existe")
  })

  it("rechaza una persona sin ficha laboral de PE", () => {
    const r = getState().saveAdelantoPL(
      adelantoPL({ trabajadorPersonaId: "p-1" })
    )
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain("ficha laboral de PE")
  })

  it("alta: asigna folio correlativo, notifica y emite el evento PL", () => {
    useCompassStore.setState({
      adelantosPL: [
        adelantoPL({ id: "ade-d-prev", folio: "ADE-0007" }) as never,
      ],
    })
    const r = getState().saveAdelantoPL(adelantoPL({ id: "ade-d-nuevo" }))
    expect(r.ok).toBe(true)
    const nuevo = getState().adelantosPL.find((a) => a.id === "ade-d-nuevo")!
    expect(nuevo.folio).toBe("ADE-0008")
    expect(nuevo.estado).toBe("pendiente")
    expect(lastEvent()?.tipoAccion).toBe("PL_ADD_ADVANCE")
    expect(
      getState().notificaciones.some(
        (n) => n.moduloOrigen === "PL" && n.asunto.includes("ADE-0008")
      )
    ).toBe(true)
  })

  it("edición: conserva folio y estado y no reemite el alta", () => {
    useCompassStore.setState({
      adelantosPL: [
        adelantoPL({ id: "ade-d-edit", folio: "ADE-0009" }) as never,
      ],
    })
    const eventosAntes = getState().eventos.length
    const r = getState().saveAdelantoPL(
      adelantoPL({ id: "ade-d-edit", folio: "ADE-0009", monto: 120000 })
    )
    expect(r.ok).toBe(true)
    const editado = getState().adelantosPL.find((a) => a.id === "ade-d-edit")!
    expect(editado.folio).toBe("ADE-0009")
    expect(editado.monto).toBe(120000)
    expect(getState().adelantosPL).toHaveLength(1)
    expect(getState().eventos.length).toBe(eventosAntes)
  })
})
