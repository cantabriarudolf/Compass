import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore } from "@/lib/store"
import type { InfraccionIN } from "@/lib/schemas"
import { resetStore, lastEvent } from "./helpers"

/**
 * Fase D de cobertura del store legacy (SERIE-DEUDA-2 D4, change
 * `store-cobertura-fase-d`): `respaldarInfraccionIN` y `desestimarInfraccionIN`.
 * Se afirma el `StoreResult` y el efecto observable contra la API pública.
 */
const getState = () => useCompassStore.getState()

const unidadLibre = () => getState().unidades.find((u) => !u.id.startsWith("u-E-"))!

const infraccionIN = (partial: Partial<InfraccionIN>): InfraccionIN =>
  ({
    id: "in-d-1",
    folio: "",
    tipoInfraccionId: "tipo-in-mascotas",
    unidadId: unidadLibre().id,
    fechaSuceso: "2026-08-24",
    horaSuceso: "21:30",
    fechaRegistro: "2026-08-24",
    antecedentes:
      "Mascota sin correa reiteradamente en el jardín central según testimonios.",
    evidencias: [],
    estado: "en_revision",
    respaldosDirectiva: [],
    ...partial,
  }) as InfraccionIN

describe("respaldarInfraccionIN — validaciones del respaldo de directiva", () => {
  beforeEach(() => resetStore())

  it("rechaza una infracción inexistente", () => {
    const r = getState().respaldarInfraccionIN("in-nadie", "p-1")
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain("la infracción no existe")
  })

  it("rechaza una infracción con resolución final", () => {
    getState().saveInfraccionIN(infraccionIN({ id: "in-d-res" }))
    useCompassStore.setState((s) => ({
      infraccionesIN: s.infraccionesIN.map((i) =>
        i.id === "in-d-res" ? { ...i, estado: "aplicada" as const } : i
      ),
    }))
    const r = getState().respaldarInfraccionIN("in-d-res", "p-1")
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain("resolución final")
  })

  it("rechaza a un firmante que no es miembro vigente de la directiva", () => {
    getState().saveInfraccionIN(infraccionIN({ id: "in-d-firma" }))
    const r = getState().respaldarInfraccionIN("in-d-firma", "p-4")
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain("directiva")
    expect(
      getState().infraccionesIN.find((i) => i.id === "in-d-firma")!
        .respaldosDirectiva
    ).toHaveLength(0)
  })

  it("rechaza un respaldo duplicado", () => {
    getState().saveInfraccionIN(infraccionIN({ id: "in-d-dup" }))
    expect(getState().respaldarInfraccionIN("in-d-dup", "p-1").ok).toBe(true)
    const dup = getState().respaldarInfraccionIN("in-d-dup", "p-1")
    expect(dup.ok).toBe(false)
    expect(dup.ok === false && dup.error).toContain("ya respaldó")
    expect(
      getState().infraccionesIN.find((i) => i.id === "in-d-dup")!
        .respaldosDirectiva
    ).toEqual(["p-1"])
  })

  it("registra el respaldo vigente y emite el evento IN", () => {
    getState().saveInfraccionIN(infraccionIN({ id: "in-d-ok" }))
    const r = getState().respaldarInfraccionIN("in-d-ok", "p-1")
    expect(r.ok).toBe(true)
    expect(
      getState().infraccionesIN.find((i) => i.id === "in-d-ok")!
        .respaldosDirectiva
    ).toEqual(["p-1"])
    expect(lastEvent()?.tipoAccion).toBe("IN_RESPALDO_DIRECTIVA")
  })
})

describe("desestimarInfraccionIN — validaciones de la desestimación", () => {
  beforeEach(() => resetStore())

  it("rechaza una infracción inexistente", () => {
    const r = getState().desestimarInfraccionIN("in-nadie", "motivo válido")
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain("la infracción no existe")
  })

  it("rechaza una infracción con resolución final", () => {
    getState().saveInfraccionIN(infraccionIN({ id: "in-d-dres" }))
    useCompassStore.setState((s) => ({
      infraccionesIN: s.infraccionesIN.map((i) =>
        i.id === "in-d-dres" ? { ...i, estado: "desestimada" as const } : i
      ),
    }))
    const r = getState().desestimarInfraccionIN("in-d-dres", "motivo válido")
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain("resolución final")
  })

  it("exige justificación obligatoria", () => {
    getState().saveInfraccionIN(infraccionIN({ id: "in-d-sinjust" }))
    const r = getState().desestimarInfraccionIN("in-d-sinjust", "   ")
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain("justificación obligatoria")
    expect(
      getState().infraccionesIN.find((i) => i.id === "in-d-sinjust")!.estado
    ).toBe("en_revision")
  })

  it("desestima con la justificación recortada y emite el evento IN", () => {
    getState().saveInfraccionIN(infraccionIN({ id: "in-d-ok" }))
    const r = getState().desestimarInfraccionIN(
      "in-d-ok",
      "  Sin mérito tras revisión de antecedentes.  "
    )
    expect(r.ok).toBe(true)
    const inf = getState().infraccionesIN.find((i) => i.id === "in-d-ok")!
    expect(inf.estado).toBe("desestimada")
    expect(inf.desestimacionJustificacion).toBe(
      "Sin mérito tras revisión de antecedentes."
    )
    expect(lastEvent()?.tipoAccion).toBe("IN_DESESTIMADA")
  })
})
