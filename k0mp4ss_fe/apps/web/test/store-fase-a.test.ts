import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore, STORE_VERSION, seedData, type MaestroCollections } from "@/lib/store"
import { unidades as seedUnidades } from "@/data/inventario/estructura"
import type { Unidad } from "@/data/inventario/estructura"
import { personas as seedPersonas } from "@/data/comunidad/personas"
import { configuracionDefault } from "@/data/admin/configuracion"
import { resetStore, lastEvent } from "./helpers"

const getState = () => useCompassStore.getState()
const migrate = useCompassStore.persist.getOptions().migrate

const NOMBRES_ESTADO = ["Vacante", "En Uso", "En Arriendo", "En Venta", "En Mantención"] as const

// Convierte una unidad actual al formato legacy pre-v3: `estado` textual y sin `estadoId`.
function aLegacy(u: Unidad, estadoNombre: string): Record<string, unknown> {
  const copia: Record<string, unknown> = { ...u }
  delete copia.estadoId
  copia.estado = estadoNombre
  return copia
}

function unidadesLegacy(cantidad: number): Record<string, unknown>[] {
  return seedUnidades.slice(0, cantidad).map((u, i) => aLegacy(u, NOMBRES_ESTADO[i % NOMBRES_ESTADO.length]!))
}

function basePersistido(extra: Record<string, unknown>): Record<string, unknown> {
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

describe("Fase A — Regresión TST-002: conversión estado→estadoId sobrevive a migrate", () => {
  beforeEach(resetStore)

  it("persistido v0 → v9: unidades legacy quedan con estadoId y sin `estado` (migración directa)", () => {
    const prev = basePersistido({
      unidades: unidadesLegacy(5),
      estacionamientos: [{ id: "est-viejo" }],
      personas: [{ ...seedPersonas[0], id: "p-previa" }],
    })

    const result = migrate!(prev, 0) as unknown as Record<string, unknown>
    const unidades = result.unidades as Record<string, unknown>[]

    // La rama <8 fusiona con el seed por id: los 5 legacy se conservan y el resto se completa.
    expect(unidades).toHaveLength(seedUnidades.length)
    for (const u of unidades) {
      expect(typeof u.estadoId).toBe("string")
      expect(u.estadoId).not.toBe("")
      expect(u.estado).toBeUndefined()
    }
    // Mapeos concretos nombre→id del diccionario ESTADO_NOMBRE_A_ID sobre los legacy
    const estadoPorId = new Map(unidades.map(u => [u.id, u.estadoId]))
    expect(estadoPorId.get(seedUnidades[0]!.id)).toBe("vacante")
    expect(estadoPorId.get(seedUnidades[1]!.id)).toBe("en-uso")
    expect(estadoPorId.get(seedUnidades[2]!.id)).toBe("en-arriendo")
    expect(estadoPorId.get(seedUnidades[3]!.id)).toBe("en-venta")
    expect(estadoPorId.get(seedUnidades[4]!.id)).toBe("en-mantencion")
    expect(result["estacionamientos"]).toBeUndefined()
  })

  it("persistido v0 → v9 end-to-end por rehidratación: filtros y removeMaestro('estadosOcupacion') funcionan", async () => {
    window.localStorage.setItem(
      "compass-store",
      JSON.stringify({
        state: basePersistido({
          unidades: [
            ...unidadesLegacy(4),
            { ...aLegacy(seedUnidades[7]!, "En Mantención"), id: "u-custom-legacy" },
          ],
        }),
        version: 0,
      })
    )

    await useCompassStore.persist.rehydrate()

    const state = getState()
    expect(state.hasHydrated).toBe(true)
    expect(state.unidades).toHaveLength(seedUnidades.length + 1)
    expect(state.unidades.every(u => typeof u.estadoId === "string" && u.estadoId !== "")).toBe(true)
    expect((state.unidades as unknown as { estado?: string }[]).some(u => "estado" in u)).toBe(false)

    // La unidad cuyo id no existe en el seed conserva sus datos migrados
    const custom = state.unidades.find(u => u.id === "u-custom-legacy")!
    expect(custom.estadoId).toBe("en-mantencion")

    // Pre-fix: sin estadoId, la unidad legacy no contaba como usuaria del estado.
    const usos = state.unidades.filter(u => u.estadoId === "en-mantencion").length
    expect(usos).toBeGreaterThan(1)
    const resultado = state.removeMaestro("estadosOcupacion", "en-mantencion")
    expect(resultado.ok).toBe(false)
    expect(resultado.error).toContain(`${usos} unidad(es) lo usan`)
    expect(state.maestros.estadosOcupacion.some(e => e.id === "en-mantencion")).toBe(true)
  })

  it("persistido v7 con unidad semi-legacy → v9: convierte la dañada y preserva las sanas", () => {
    const sana1 = seedUnidades[0]!
    const sana2 = seedUnidades[1]!
    const danada = aLegacy(seedUnidades[2]!, "En Arriendo")
    const prev = basePersistido({
      unidades: [
        { ...sana1 },
        { ...sana2 },
        danada,
      ],
    })

    const result = migrate!(prev, 7) as unknown as { unidades: Unidad[] }

    expect(result.unidades[0]).toEqual(sana1)
    expect(result.unidades[1]).toEqual(sana2)
    expect((result.unidades[2] as unknown as Record<string, unknown>).estado).toBeUndefined()
    expect(result.unidades[2]!.estadoId).toBe("en-arriendo")
    expect(result.unidades[2]!.id).toBe(seedUnidades[2]!.id)
  })

  it("persistido v8 dañado por el bug (unidades con estado sin estadoId) → v9: rescate, no re-siembra", () => {
    const prev = basePersistido({
      unidades: unidadesLegacy(3),
    })

    const result = migrate!(prev, 8) as unknown as { unidades: Unidad[] }

    expect(result.unidades).toHaveLength(3)
    expect(result.unidades.every(u => typeof u.estadoId === "string" && u.estadoId !== "")).toBe(true)
    expect(result.unidades.map(u => u.id)).toEqual(seedUnidades.slice(0, 3).map(u => u.id))
  })
})

describe("Fase A — VAL-006: safeParse por colección en v9", () => {
  beforeEach(resetStore)

  it("migrate descarta la colección corrupta y re-siembra solo esa; el resto queda intacto", () => {
    const personaCustom = { ...seedPersonas[0]!, id: "p-custom" }
    const vinculoCustom = {
      id: "v-custom",
      personaId: "p-custom",
      unidadId: "u-A-302",
      rol: "ocupante" as const,
      fechaInicio: "2026-01-01",
      permiteVerFinanzas: false,
    }
    const configCustom = { ...configuracionDefault, nombreComunidad: "Comunidad Personalizada" }
    const prev = basePersistido({
      unidades: [{ id: "u-rota" }], // inválida: faltan campos obligatorios
      personas: [personaCustom],
      vinculos: [vinculoCustom],
      configuracion: configCustom,
      maestros: { bancos: "no-soy-un-arreglo" },
    })

    const result = migrate!(prev, STORE_VERSION) as unknown as Record<string, unknown>

    expect(result.unidades).toEqual(seedData().unidades)
    expect(result.personas).toEqual([personaCustom])
    expect(result.vinculos).toEqual([vinculoCustom])
    expect(result.configuracion).toEqual(configCustom)
    const maestros = result.maestros as unknown as MaestroCollections
    expect(maestros.bancos).toEqual(seedData().maestros.bancos)
  })

  it("rehidratación v9 con colecciones corruptas: re-siembra parcial y resto intacto", async () => {
    const personaCustom = { ...seedPersonas[1]!, id: "p-propia-rehidrato" }
    window.localStorage.setItem(
      "compass-store",
      JSON.stringify({
        state: {
          tiposUnidad: [],
          macroSectores: [],
          microSectores: [],
          unidades: [{ id: "u-rota", metraje: -1 }],
          personas: [personaCustom],
          vinculos: [],
          eventos: [{ foo: "bar" }],
          maestros: { afps: [{ id: "afp-rota" }] },
        },
        version: STORE_VERSION,
      })
    )

    await useCompassStore.persist.rehydrate()

    const state = getState()
    expect(state.hasHydrated).toBe(true)
    // Colecciones corruptas → re-sembradas desde seed
    expect(state.unidades).toEqual(seedData().unidades)
    expect(state.eventos).toEqual([])
    expect(state.maestros.afps).toEqual(seedData().maestros.afps)
    // Colecciones válidas → intactas
    expect(state.personas).toEqual([personaCustom])
  })

  it("una colección inválida no impide que el resto del store cargue (nunca rompe la hidratación)", async () => {
    window.localStorage.setItem(
      "compass-store",
      JSON.stringify({
        state: {
          tiposUnidad: null,
          macroSectores: 42,
          microSectores: [],
          unidades: [],
          personas: "no-soy-lista",
          vinculos: [],
          eventos: [],
          maestros: null,
        },
        version: STORE_VERSION,
      })
    )

    await useCompassStore.persist.rehydrate()

    const state = getState()
    expect(state.hasHydrated).toBe(true)
    expect(state.tiposUnidad).toEqual(seedData().tiposUnidad)
    expect(state.macroSectores).toEqual(seedData().macroSectores)
    expect(state.personas).toEqual(seedData().personas)
    expect(state.maestros.bancos).toEqual(seedData().maestros.bancos)
    expect(state.maestros.feriados.length).toBeGreaterThan(0)
  })
})

describe("Fase A — TST-001: saveVinculo rechaza cuentas bloqueadas (D6 bloqueo duro)", () => {
  beforeEach(resetStore)

  it("rechaza vínculo para p-10 (bloqueada) y no muta vínculos", () => {
    const persona = getState().personas.find(p => p.id === "p-10")
    expect(persona?.estadoCuenta).toBe("bloqueada")
    const antes = getState().vinculos.length

    const result = getState().saveVinculo({
      id: "v-bloqueada",
      personaId: "p-10",
      unidadId: "u-A-302",
      rol: "ocupante",
      fechaInicio: "2026-09-01",
      permiteVerFinanzas: false,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain("bloqueada")
    expect(result.error).not.toContain("inactiva")
    expect(getState().vinculos.length).toBe(antes)
  })

  it("rechaza vínculo para p-54 (bloqueada, sin vínculos)", () => {
    const antes = getState().vinculos.length

    const result = getState().saveVinculo({
      id: "v-bloqueada-2",
      personaId: "p-54",
      unidadId: "u-A-302",
      rol: "ocupante",
      fechaInicio: "2026-09-01",
      permiteVerFinanzas: false,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain("bloqueada")
    expect(getState().vinculos.length).toBe(antes)
  })
})

describe("Fase A — TST-003: saveMaestro", () => {
  beforeEach(resetStore)

  it("agrega un maestro nuevo válido", () => {
    const antes = getState().maestros.afps.length

    const result = getState().saveMaestro("afps", {
      id: "afp-nueva",
      nombre: "Protección Test",
      tasaCotizacion: 0.05,
    })

    expect(result.ok).toBe(true)
    expect(getState().maestros.afps.length).toBe(antes + 1)
    expect(getState().maestros.afps.some(a => a.id === "afp-nueva")).toBe(true)
  })

  it("actualiza (upsert) un maestro existente sin duplicar", () => {
    const original = getState().maestros.afps[0]!
    const antes = getState().maestros.afps.length

    const result = getState().saveMaestro("afps", { ...original, nombre: "AFP Renombrada" })

    expect(result.ok).toBe(true)
    expect(getState().maestros.afps.length).toBe(antes)
    expect(getState().maestros.afps.find(a => a.id === original.id)?.nombre).toBe("AFP Renombrada")
  })

  it("rechaza un maestro inválido según su esquema sin mutar", () => {
    const antes = getState().maestros.afps.length

    const result = getState().saveMaestro("afps", {
      id: "afp-mala",
      nombre: "AFP Negativa",
      tasaCotizacion: -0.02,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain("Datos inválidos")
    expect(getState().maestros.afps.length).toBe(antes)
  })

  it("rechaza una clave de maestro no soportada", () => {
    const result = getState().saveMaestro("coloresMagicos" as keyof MaestroCollections, { id: "x" } as never)

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Maestro "coloresMagicos" no soportado.')
  })
})

describe("Fase A — TST-003: autosolapamiento mismo rol en saveVinculo", () => {
  beforeEach(resetStore)

  function tramoOcupante(id: string, inicio: string, fin?: string) {
    return {
      id,
      personaId: "p-14",
      unidadId: "u-A-302",
      rol: "ocupante" as const,
      fechaInicio: inicio,
      fechaFin: fin,
      permiteVerFinanzas: false,
    }
  }

  it("rechaza un segundo tramo del mismo rol solapado para la misma persona/unidad", () => {
    const primero = getState().saveVinculo(tramoOcupante("v-auto-1", "2026-01-01", "2026-03-31"))
    expect(primero.ok).toBe(true)

    const result = getState().saveVinculo(tramoOcupante("v-auto-2", "2026-03-01", "2026-05-31"))

    expect(result.ok).toBe(false)
    expect(result.error).toBe(
      "Esta persona ya registra un tramo del mismo rol que se solapa con las fechas indicadas en esta unidad."
    )
    expect(getState().vinculos.some(v => v.id === "v-auto-2")).toBe(false)
  })

  it("permite tramos consecutivos del mismo rol (sin solape)", () => {
    expect(getState().saveVinculo(tramoOcupante("v-auto-1", "2026-01-01", "2026-03-31")).ok).toBe(true)

    const result = getState().saveVinculo(tramoOcupante("v-auto-2", "2026-04-01", "2026-12-31"))

    expect(result.ok).toBe(true)
    expect(getState().vinculos.filter(v => v.unidadId === "u-A-302" && v.rol === "ocupante")).toHaveLength(2)
  })
})

describe("Fase A — TST-003: ramas de migración <2…<6", () => {
  beforeEach(resetStore)

  const maestroCustom = {
    afps: [{ id: "afp-custom", nombre: "AFP Custom", tasaCotizacion: 0.07 }],
  }

  it("rama <2 (v1): rellena maestros desde seed conservando overrides previos", () => {
    const result = migrate!(basePersistido({ maestros: maestroCustom }), 1) as unknown as {
      maestros: MaestroCollections
    }

    expect(result.maestros?.afps).toEqual(maestroCustom.afps)
    expect(result.maestros?.bancos).toEqual(seedData().maestros.bancos)
    expect(result.maestros?.feriados.length).toBeGreaterThan(0)
  })

  it("rama <3 (v2): convierte estado→estadoId (incluido slug para desconocidos) y las ramas acumulativas rellenan maestros", () => {
    const result = migrate!(
      basePersistido({
        unidades: [...unidadesLegacy(2), aLegacy(seedUnidades[9]!, "Ocupado")],
      }),
      2
    ) as unknown as Record<string, unknown>

    const unidades = result.unidades as Record<string, unknown>[]
    const estadoPorId = new Map(unidades.map(u => [u.id, u.estadoId]))
    expect(estadoPorId.get(seedUnidades[0]!.id)).toBe("vacante")
    expect(estadoPorId.get(seedUnidades[1]!.id)).toBe("en-uso")
    expect(estadoPorId.get(seedUnidades[9]!.id)).toBe("ocupado") // desconocido → slug
    for (const u of unidades) expect(u.estado).toBeUndefined()
    // v2 también dispara <4…<6 y <8: los maestros quedan rellenos desde el seed
    expect((result.maestros as unknown as MaestroCollections)?.afps).toEqual(seedData().maestros.afps)
  })

  it("rama <4 (v3): rellena maestros ausentes desde seed", () => {
    const result = migrate!(basePersistido({}), 3) as unknown as { maestros: MaestroCollections }

    expect(result.maestros?.afps).toEqual(seedData().maestros.afps)
    expect(result.maestros?.previsionesSalud).toEqual(seedData().maestros.previsionesSalud)
  })

  it("rama <5 (v4): merge de maestros conserva override y rellena resto", () => {
    const result = migrate!(basePersistido({ maestros: maestroCustom }), 4) as unknown as {
      maestros: MaestroCollections
    }

    expect(result.maestros?.afps).toEqual(maestroCustom.afps)
    expect(result.maestros?.bancos).toEqual(seedData().maestros.bancos)
    expect(result.maestros?.condicionesEspeciales.length).toBeGreaterThan(0)
  })

  it("rama <6 (v5): merge de maestros conserva override y rellena resto", () => {
    const result = migrate!(basePersistido({ maestros: maestroCustom }), 5) as unknown as {
      maestros: MaestroCollections
    }

    expect(result.maestros?.afps).toEqual(maestroCustom.afps)
    expect(result.maestros?.indicesAjuste).toEqual(seedData().maestros.indicesAjuste)
  })
})

describe("Fase A — TST-003: eventos VU_NEW_TENANT y VU_DELETE histórico", () => {
  beforeEach(resetStore)

  it("cambio de arrendatario registra VU_NEW_TENANT con nombres saliente y entrante", () => {
    const anterior = getState().vinculos.find(v => v.id === "v-53")!
    expect(anterior.rol).toBe("arrendatario")
    expect(anterior.fechaFin).toBeUndefined()

    const result = getState().saveVinculo({
      id: "v-tenant-nuevo",
      personaId: "p-13",
      unidadId: "u-LC-02",
      rol: "arrendatario",
      fechaInicio: "2026-09-01",
      permiteVerFinanzas: false,
    })

    expect(result.ok).toBe(true)
    expect(getState().vinculos.find(v => v.id === "v-53")?.fechaFin).toBe("2026-08-31")

    const tipos = getState().eventos.map(e => e.tipoAccion)
    expect(tipos).toContain("VU_ASSIGN_RELEASED")
    expect(tipos).toContain("VU_NEW_TENANT")

    const tenant = getState().eventos.find(e => e.tipoAccion === "VU_NEW_TENANT")
    expect(tenant?.descripcion).toContain("Valentina Reyes López")
    expect(tenant?.descripcion).toContain("Farmacia Salud Total SpA")
  })

  it("eliminar un tramo histórico (con fechaFin) registra VU_DELETE", () => {
    const historico = getState().vinculos.find(v => v.id === "v-8")!
    expect(historico.fechaFin).toBe("2023-11-19")

    const result = getState().removeVinculo("v-8")

    expect(result.ok).toBe(true)
    expect(getState().vinculos.some(v => v.id === "v-8")).toBe(false)
    expect(lastEvent()?.tipoAccion).toBe("VU_DELETE")
    expect(lastEvent()?.descripcion).toContain("Tramo histórico")
  })
})
