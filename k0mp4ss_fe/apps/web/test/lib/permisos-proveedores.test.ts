/**
 * Pestañas de /operaciones/proveedores por rol.
 *
 * La pantalla sirve tres cosas con permisos distintos: el catálogo de empresas
 * (`pe:proveedor`), el libro de visitas técnicas (`pe:visita_tecnica`) y el
 * directorio de emergencias (`pe:directorio`). Gatear la pantalla entera por el
 * primero dejaba al residente sin el directorio, que sí tiene permitido; y como
 * la pantalla abría siempre en el catálogo, aterrizaba en la única pestaña que
 * no puede leer y veía una pantalla vacía.
 */
import { describe, expect, it } from "vitest"

import { pestanaInicial, pestanasProveedores } from "@/components/pe/permisos-proveedores"

describe("pestañas de proveedores según el rol", () => {
  it("el residente solo ve el directorio de emergencias, y abre ahí", () => {
    const p = pestanasProveedores(["residente"])
    expect(p).toEqual({ catalogo: false, visitas: false, emergencias: true })
    // Lo que motivó el cambio: antes abría en el catálogo y veía vacío.
    expect(pestanaInicial(p)).toBe("emergencias")
  })

  it("conserjería lee el libro de visitas pero no el maestro de empresas", () => {
    const p = pestanasProveedores(["conserjeria"])
    expect(p).toEqual({ catalogo: true, visitas: true, emergencias: true })
    expect(pestanaInicial(p)).toBe("catalogo")
  })

  it("mantención ve las mismas tres pestañas que conserjería", () => {
    expect(pestanasProveedores(["mantencion"])).toEqual({
      catalogo: true,
      visitas: true,
      emergencias: true,
    })
  })

  it("el administrador y el comité no pierden ninguna pestaña", () => {
    for (const rol of ["administrador", "comite"]) {
      const p = pestanasProveedores([rol])
      expect(p.catalogo).toBe(true)
      expect(p.emergencias).toBe(true)
    }
  })

  it("sin rol útil abre en emergencias, que es la pestaña más restrictiva que existe", () => {
    const p = pestanasProveedores([])
    expect(p).toEqual({ catalogo: false, visitas: false, emergencias: false })
    // Con todo denegado la pestaña inicial no puede ser una que no se pinta.
    expect(pestanaInicial(p)).toBe("emergencias")
  })
})
