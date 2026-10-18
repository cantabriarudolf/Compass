import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore } from "@/lib/store"
import type { Persona, VinculoUnidad } from "@/lib/schemas"
import { resetStore, lastEvent } from "./helpers"

/**
 * Fase E de cobertura del store legacy (SERIE-DEUDA-2 D5, change
 * `store-cobertura-fase-e`): remanente de `saveMaestro`, `removeMaestro`,
 * `savePersona`, `saveVinculo` y `removeVinculo`.
 * Se afirma el `StoreResult` y el efecto observable contra la API pública.
 */
const getState = () => useCompassStore.getState()

/** Persona completa y válida tomada del seed (sin fabricar el fixture a mano). */
const personaDelSeed = (id = "p-11"): Persona => ({
  ...getState().personas.find((p) => p.id === id)!,
})

const vinculoBase = (partial: Partial<VinculoUnidad>): VinculoUnidad => ({
  id: "v-e-1",
  personaId: "p-11",
  unidadId: "u-A-101",
  rol: "ocupante",
  fechaInicio: "2026-01-01",
  permiteVerFinanzas: false,
  ...partial,
})

// --- MA: Maestros Administrativos ---

describe("saveMaestro / removeMaestro — guarda de hidratación", () => {
  beforeEach(() => resetStore())

  it("saveMaestro exige hidratación antes de escribir", () => {
    useCompassStore.setState({ hasHydrated: false })
    const r = getState().saveMaestro("feriados", {
      id: "feriado-e-1",
      fecha: "2027-01-01",
      nombre: "Feriado TEST E",
      irrenunciable: true,
    } as never)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain("hidratando")
    expect(
      getState().maestros.feriados.some((f) => f.id === "feriado-e-1")
    ).toBe(false)
    useCompassStore.setState({ hasHydrated: true })
  })

  it("removeMaestro exige hidratación antes de borrar", () => {
    useCompassStore.setState({ hasHydrated: false })
    const r = getState().removeMaestro("feriados", "feriado-2026-01-01")
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain("hidratando")
    useCompassStore.setState({ hasHydrated: true })
  })
})

describe("removeMaestro — ramas de integridad referencial", () => {
  beforeEach(() => resetStore())

  it("bloquea categoriasUnidad cuando una unidad comparte la etiqueta", () => {
    const s = getState()
    // `Casa` no es categoría de ningún tipo de unidad, pero sí la etiqueta de
    // una unidad: cubre la segunda mitad del OR (`unidades.some(etiqueta)`).
    useCompassStore.setState({
      unidades: [
        ...s.unidades,
        { ...s.unidades[0]!, id: "u-E-CASA", etiqueta: "Casa" } as never,
      ],
    })
    const r = getState().removeMaestro("categoriasUnidad", "casa")
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain(
      "está en uso por tipos o unidades"
    )
    expect(
      getState().maestros.categoriasUnidad.some((c) => c.id === "casa")
    ).toBe(true)
  })

  it("bloquea contratistas referenciados por un ingreso PE", () => {
    expect(
      getState().saveIngresoContratistaPE({
        id: "ing-e-1",
        contratistaId: "cont-jardineria",
        motivo: "Mantención de jardines TEST",
        fecha: "2026-08-25",
        jornadaId: "j-manana",
        agendadoPor: "administracion",
        estado: "agendado",
      }).ok
    ).toBe(true)
    const r = getState().removeMaestro("contratistas", "cont-jardineria")
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain("ingreso(s) registrados")
    expect(
      getState().maestros.contratistas.some((c) => c.id === "cont-jardineria")
    ).toBe(true)
    // El contratista libre sí se elimina (no bloquea de más).
    expect(getState().removeMaestro("contratistas", "cont-mudanzas").ok).toBe(
      true
    )
  })
})

// --- MP: Personas ---

describe("savePersona — condiciones especiales contra el maestro de MA", () => {
  beforeEach(() => resetStore())

  it("rechaza una condición especial que no existe sin mutar la ficha", () => {
    const base = personaDelSeed("p-11")
    const invalida = getState().savePersona({
      ...base,
      condicionesEspecialesIds: ["c-fantasma"],
    })
    expect(invalida.ok).toBe(false)
    expect(invalida.ok === false && invalida.error).toContain(
      "condicionEspecial c-fantasma no existe"
    )
    expect(
      getState().personas.find((p) => p.id === "p-11")!.condicionesEspecialesIds
    ).toEqual(base.condicionesEspecialesIds)
  })
})

// --- VU: Vínculos ---

describe("saveVinculo — FKs y exclusividad de titularidad", () => {
  beforeEach(() => resetStore())

  it("rechaza una unidad que no existe en el inventario", () => {
    const r = getState().saveVinculo(
      vinculoBase({ id: "v-e-ghost", unidadId: "u-fantasma" })
    )
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain("unidadId no existe")
    expect(getState().vinculos.some((v) => v.id === "v-e-ghost")).toBe(false)
  })

  it("rechaza el solapamiento de propietario reutilizando el mensaje de titularidad", () => {
    const abierto = getState().vinculos.find(
      (v) => v.rol === "propietario" && !v.fechaFin
    )!
    const libre = getState().personas.find(
      (p) =>
        p.estadoCuenta === "activa" &&
        !getState().vinculos.some((v) => v.personaId === p.id)
    )!
    const r = getState().saveVinculo(
      vinculoBase({
        id: "v-e-conf",
        personaId: libre.id,
        unidadId: abierto.unidadId,
        rol: "propietario",
        fechaInicio: "2026-01-01",
        cerrarAnterior: false,
      })
    )
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain(
      "Ya existe un tramo de propietario"
    )
    expect(getState().vinculos.some((v) => v.id === "v-e-conf")).toBe(false)
  })
})

describe("removeVinculo — referencia de unidad ausente", () => {
  beforeEach(() => resetStore())

  it("elimina el vínculo huérfano y audita con el unidadId como referencia", () => {
    useCompassStore.setState((s) => ({
      vinculos: [
        ...s.vinculos,
        vinculoBase({
          id: "v-e-huerfano",
          personaId: "p-11",
          unidadId: "u-fantasma",
          rol: "ocupante",
        }) as never,
      ],
    }))
    const r = getState().removeVinculo("v-e-huerfano")
    expect(r.ok).toBe(true)
    expect(getState().vinculos.some((v) => v.id === "v-e-huerfano")).toBe(false)
    expect(lastEvent()?.tipoAccion).toBe("VU_ASSIGN_RELEASED")
    expect(lastEvent()?.descripcion).toContain("u-fantasma")
  })
})
