import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore } from "@/lib/store"
import { resetStore } from "./helpers"

const getState = () => useCompassStore.getState()

describe("Eliminaciones bloqueadas por dependencias", () => {
  beforeEach(resetStore)

  it("removeTipoUnidad se bloquea cuando hay unidades vinculadas", () => {
    const unidadesAntes = getState().unidades.length
    const esperadas = getState().unidades.filter(u => u.tipoUnidadId === "tipo-a").length
    expect(esperadas).toBeGreaterThan(0)

    const result = getState().removeTipoUnidad("tipo-a")

    expect(result.ok).toBe(false)
    expect(result.error).toContain(`${esperadas} unidad(es) vinculada(s)`)
    expect(getState().tiposUnidad.some(t => t.id === "tipo-a")).toBe(true)
    expect(getState().unidades.length).toBe(unidadesAntes)
  })

  it("removeTipoUnidad elimina cuando no tiene unidades asociadas", () => {
    getState().saveTipoUnidad({
      id: "tipo-nuevo",
      nombre: "Bodega Tipo Z",
      categoria: "Bodega",
      metraje: 30,
      montoBaseGc: 10000,
      activo: true,
      historialTarifas: [],
    })
    expect(getState().tiposUnidad.some(t => t.id === "tipo-nuevo")).toBe(true)

    const result = getState().removeTipoUnidad("tipo-nuevo")

    expect(result.ok).toBe(true)
    expect(getState().tiposUnidad.some(t => t.id === "tipo-nuevo")).toBe(false)
  })

  it("removeMacroSector se bloquea cuando tiene micro-sectores asociados", () => {
    const esperados = getState().microSectores.filter(m => m.macroSectorId === "torre-a").length
    expect(esperados).toBe(4)

    const result = getState().removeMacroSector("torre-a")

    expect(result.ok).toBe(false)
    expect(result.error).toContain(`${esperados} sub-sector(es) asociado(s)`)
    expect(getState().macroSectores.some(m => m.id === "torre-a")).toBe(true)
  })

  it("removeMacroSector elimina cuando no tiene micro-sectores", () => {
    getState().saveMacroSector({ id: "macro-libre", nombre: "Z", etiqueta: "Sector" })

    const result = getState().removeMacroSector("macro-libre")

    expect(result.ok).toBe(true)
    expect(getState().macroSectores.some(m => m.id === "macro-libre")).toBe(false)
  })

  it("removeMicroSector se bloquea cuando tiene unidades asociadas", () => {
    const esperadas = getState().unidades.filter(u => u.microSectorId === "piso-torre-a-1").length
    expect(esperadas).toBe(4)

    const result = getState().removeMicroSector("piso-torre-a-1")

    expect(result.ok).toBe(false)
    expect(result.error).toContain(`${esperadas} unidad(es) asociada(s)`)
    expect(getState().microSectores.some(m => m.id === "piso-torre-a-1")).toBe(true)
  })

  it("removeMicroSector elimina cuando no tiene unidades", () => {
    getState().saveMicroSector({
      id: "micro-libre",
      macroSectorId: "torre-a",
      nombre: "Piso 9",
      etiqueta: "Piso",
    })

    const result = getState().removeMicroSector("micro-libre")

    expect(result.ok).toBe(true)
    expect(getState().microSectores.some(m => m.id === "micro-libre")).toBe(false)
  })

  it("removeUnidad se bloquea cuando tiene vínculos asociados", () => {
    const result = getState().removeUnidad("u-A-101")

    expect(result.ok).toBe(false)
    expect(result.error).toBe("No se puede eliminar la unidad: tiene vínculos asociados.")
    expect(getState().unidades.some(u => u.id === "u-A-101")).toBe(true)
  })

  it("removeUnidad elimina una unidad sin vínculos", () => {
    expect(getState().vinculos.some(v => v.unidadId === "u-A-302")).toBe(false)

    const result = getState().removeUnidad("u-A-302")

    expect(result.ok).toBe(true)
    expect(getState().unidades.some(u => u.id === "u-A-302")).toBe(false)
  })

  it("removePersona se bloquea cuando tiene vínculos de unidad", () => {
    const esperados = getState().vinculos.filter(v => v.personaId === "p-1").length
    expect(esperados).toBeGreaterThan(0)

    const result = getState().removePersona("p-1")

    expect(result.ok).toBe(false)
    expect(result.error).toContain(`${esperados} vínculo(s) de unidad asociado(s)`)
    expect(getState().personas.some(p => p.id === "p-1")).toBe(true)
  })

  it("removePersona elimina una persona sin vínculos", () => {
    expect(getState().vinculos.some(v => v.personaId === "p-53")).toBe(false)

    const result = getState().removePersona("p-53")

    expect(result.ok).toBe(true)
    expect(getState().personas.some(p => p.id === "p-53")).toBe(false)
  })
})

describe("Eliminación de maestros en uso", () => {
  beforeEach(resetStore)

  it("estadosOcupacion en uso por unidades no se puede eliminar", () => {
    const usos = getState().unidades.filter(u => u.estadoId === "vacante").length
    expect(usos).toBeGreaterThan(0)

    const result = getState().removeMaestro("estadosOcupacion", "vacante")

    expect(result.ok).toBe(false)
    expect(result.error).toContain(`${usos} unidad(es) lo usan`)
    expect(getState().maestros.estadosOcupacion.some(e => e.id === "vacante")).toBe(true)
  })

  it("categoriasUnidad en uso por tipos/unidades no se puede eliminar", () => {
    const result = getState().removeMaestro("categoriasUnidad", "depto")

    expect(result.ok).toBe(false)
    expect(result.error).toContain('"Depto"')
    expect(getState().maestros.categoriasUnidad.some(c => c.id === "depto")).toBe(true)
  })

  it("categoriasMacro usada como etiqueta de sectores no se puede eliminar", () => {
    const result = getState().removeMaestro("categoriasMacro", "torre")

    expect(result.ok).toBe(false)
    expect(result.error).toContain('categoría macro "Torre"')
    expect(getState().maestros.categoriasMacro.some(c => c.id === "torre")).toBe(true)
  })

  it("categoriasMicro usada como etiqueta de sub-sectores no se puede eliminar", () => {
    const result = getState().removeMaestro("categoriasMicro", "piso")

    expect(result.ok).toBe(false)
    expect(result.error).toContain('categoría micro "Piso"')
    expect(getState().maestros.categoriasMicro.some(c => c.id === "piso")).toBe(true)
  })

  it("estadosInmobiliarios en uso por vínculos no se puede eliminar", () => {
    const usos = getState().vinculos.filter(v => v.estadoOcupacionPropiedad === "habitada").length
    expect(usos).toBeGreaterThan(0)

    const result = getState().removeMaestro("estadosInmobiliarios", "habitada")

    expect(result.ok).toBe(false)
    expect(result.error).toContain(`${usos} vínculo(s) lo usan`)
  })

  it("condicionesEspeciales asignadas a personas no se pueden eliminar", () => {
    const result = getState().removeMaestro("condicionesEspeciales", "c-2")

    expect(result.ok).toBe(false)
    expect(result.error).toBe("No se puede eliminar la condición especial: hay personas que la tienen asignada.")
    expect(getState().maestros.condicionesEspeciales.some(c => c.id === "c-2")).toBe(true)
  })

  it("un maestro sin consumo referencial sí se puede eliminar", () => {
    const banco = getState().maestros.bancos[0]
    expect(banco).toBeDefined()

    const result = getState().removeMaestro("bancos", banco!.id)

    expect(result.ok).toBe(true)
    expect(getState().maestros.bancos.some(b => b.id === banco!.id)).toBe(false)
  })
})
