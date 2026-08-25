import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore, STORE_VERSION } from "@/lib/store"
import { tiposUnidad, macroSectores, microSectores, unidades } from "@/data/inventario/estructura"
import { personas } from "@/data/comunidad/personas"
import { vinculos } from "@/data/comunidad/vinculos"
import { AFPS } from "@/data/admin/maestros"
import { configuracionDefault } from "@/data/admin/configuracion"
import { resetStore } from "./helpers"

const getState = () => useCompassStore.getState()
const migrate = useCompassStore.persist.getOptions().migrate

function estadoPersistido(extra: Record<string, unknown>): Record<string, unknown> {
  return {
    tiposUnidad: [],
    macroSectores: [],
    microSectores: [],
    unidades: [],
    personas: [],
    vinculos: [],
    eventos: [],
    ...extra,
  }
}

describe("Seed inicial desde apps/web/data/", () => {
  beforeEach(resetStore)

  it("puebla el store con los datos semilla de inventario", () => {
    expect(getState().tiposUnidad).toEqual(tiposUnidad)
    expect(getState().macroSectores).toEqual(macroSectores)
    expect(getState().microSectores).toEqual(microSectores)
    expect(getState().unidades).toEqual(unidades)
    expect(getState().unidades.length).toBeGreaterThan(0)
  })

  it("puebla el store con los datos semilla de comunidad", () => {
    expect(getState().personas).toEqual(personas)
    expect(getState().vinculos).toEqual(vinculos)
  })

  it("puebla maestros administrativos y configuración global", () => {
    expect(getState().maestros.afps).toEqual(AFPS)
    expect(getState().configuracion).toEqual(configuracionDefault)
    expect(getState().eventos).toEqual([])
  })

  it(`usa versión de store ${STORE_VERSION} y exige hidratación para operar`, () => {
    expect(STORE_VERSION).toBe(18)
    useCompassStore.setState({ hasHydrated: false })
    const result = getState().saveVinculo({
      id: "x", personaId: "p-1", unidadId: "u-A-302", rol: "ocupante",
      fechaInicio: "2026-01-01", permiteVerFinanzas: false,
    })
    expect(result.ok).toBe(false)
    useCompassStore.setState({ hasHydrated: true })
  })
})

describe("Migración v7 → v8 (función migrate)", () => {
  beforeEach(resetStore)

  it("fusiona por id estructuras previas con el seed y limpia claves legacy v7", () => {
    const prev = estadoPersistido({
      macroSectores: [{ id: "macro-prev", nombre: "Previo", etiqueta: "Torre" }],
      microSectores: [{ id: "micro-prev", macroSectorId: "macro-prev", nombre: "Piso Previo", etiqueta: "Piso" }],
      estacionamientos: [{ id: "est-legado" }],
      maestros: {
        categoriasMacro: [{ id: "torre", nombre: "Torre" }],
        ubicacionesEstacionamiento: [{ id: "ub-legado", nombre: "Subterráneo A" }],
      },
    })

    const result = migrate!(prev, 7) as unknown as Record<string, unknown>

    const idsMacro = (result.macroSectores as { id: string }[]).map(m => m.id)
    expect(idsMacro).toContain("macro-prev")
    expect(idsMacro).toContain("torre-a")
    expect(new Set(idsMacro).size).toBe(idsMacro.length)

    const idsMicro = (result.microSectores as { id: string }[]).map(m => m.id)
    expect(idsMicro).toContain("micro-prev")
    expect(idsMicro).toContain("piso-torre-a-1")

    expect(result.unidades).toHaveLength(unidades.length)

    const maestros = result.maestros as unknown as Record<string, unknown>
    const idsCategoriasMacro = (maestros.categoriasMacro as { id: string }[]).map(c => c.id)
    expect(idsCategoriasMacro[0]).toBe("torre")
    expect(idsCategoriasMacro).toContain("manzana")
    expect(new Set(idsCategoriasMacro).size).toBe(idsCategoriasMacro.length)

    expect(result["estacionamientos"]).toBeUndefined()
    expect(maestros["ubicacionesEstacionamiento"]).toBeUndefined()
  })

  it("conserva vínculos y personas previas sin duplicarlas contra el seed", () => {
    const prev = estadoPersistido({
      personas: [{ ...personas[0], id: "p-previa" }, personas[1]],
      vinculos: [vinculos[0]],
      maestros: {},
    })

    const result = migrate!(prev, 7) as unknown as {
      personas: typeof personas
      vinculos: typeof vinculos
      maestros: { afps: typeof AFPS }
    }

    expect(result.personas).toEqual([{ ...personas[0], id: "p-previa" }, personas[1]])
    expect(result.vinculos).toEqual([vinculos[0]])
    expect(result.maestros.afps).toEqual(AFPS)
  })
})

describe("Hidratación desde localStorage", () => {
  beforeEach(resetStore)

  it("aplica migrate al rehidratar un persistido v7 y marca hasHydrated", async () => {
    window.localStorage.setItem(
      "compass-store",
      JSON.stringify({
        state: estadoPersistido({
          macroSectores: [{ id: "macro-rehidrato", nombre: "R", etiqueta: "Torre" }],
          maestros: { categoriasMacro: [{ id: "torre", nombre: "Torre" }] },
        }),
        version: 7,
      })
    )

    await useCompassStore.persist.rehydrate()

    const state = getState()
    expect(state.hasHydrated).toBe(true)
    expect(state.macroSectores.some(m => m.id === "macro-rehidrato")).toBe(true)
    expect(state.macroSectores.some(m => m.id === "torre-a")).toBe(true)
  })

  it("no ejecuta migración cuando la versión persistida ya es la actual", async () => {
    const personaPersistida = {
      ...personas[0],
      id: "p-propia",
      nombres: "Guardada",
      apellidos: "En LocalStorage",
    }
    window.localStorage.setItem(
      "compass-store",
      JSON.stringify({
        state: {
          tiposUnidad,
          macroSectores,
          microSectores,
          unidades,
          personas: [personaPersistida],
          vinculos,
          eventos: [],
          configuracion: configuracionDefault,
        },
        version: STORE_VERSION,
      })
    )

    await useCompassStore.persist.rehydrate()

    expect(getState().personas).toEqual([personaPersistida])
    expect(getState().personas.some(p => p.id === "p-propia")).toBe(true)
  })
})
