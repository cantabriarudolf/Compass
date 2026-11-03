/**
 * Pestañas de /operaciones/proveedores por rol.
 *
 * La pantalla quedó con dos cosas, y las dos son privilegiadas: el catálogo de
 * empresas (`pe:proveedor`) y el libro de visitas técnicas
 * (`pe:visita_tecnica`). El directorio de emergencias SALIÓ de acá: su permiso
 * (`pe:directorio`) lo tienen todos los roles, así que una cosa que todos leen
 * no puede vivir dentro de una pantalla que casi nadie puede abrir. Su superficie
 * es `/comunidad/directorio`.
 *
 * Lo que estos casos siguen protegiendo (era lo que protegían antes del traslado):
 * - ninguna pestaña se pinta sin el permiso de su propio recurso;
 * - la pestaña inicial nunca es una que no se pinta (el residente no aterriza en
 *   el catálogo que no puede leer);
 * - el rol que no puede leer ninguna de las dos pestañas no recibe ninguna, y la
 *   pestaña inicial lo declara en vez de inventar una tercera.
 */
import { describe, expect, it } from "vitest"

import { pestanaInicial, pestanasProveedores } from "@/components/pe/permisos-proveedores"

describe("pestañas de proveedores según el rol", () => {
  it("el residente no recibe ninguna pestaña: el directorio ya no vive acá", () => {
    const p = pestanasProveedores(["residente"])
    expect(p).toEqual({ catalogo: false, visitas: false })
    // El traslado retiró la pestaña `emergencias`: el permiso sigue existiendo en
    // la matriz, pero su superficie es /comunidad/directorio.
    expect(Object.keys(p)).toEqual(["catalogo", "visitas"])
    // Sin pestañas legibles no hay pestaña inicial que pintar.
    expect(pestanaInicial(p)).toBe("")
  })

  it("conserjería lee el catálogo y el libro de visitas, y abre en el catálogo", () => {
    const p = pestanasProveedores(["conserjeria"])
    expect(p).toEqual({ catalogo: true, visitas: true })
    expect(pestanaInicial(p)).toBe("catalogo")
  })

  it("mantención ve las mismas dos pestañas que conserjería", () => {
    expect(pestanasProveedores(["mantencion"])).toEqual({
      catalogo: true,
      visitas: true,
    })
  })

  it("el administrador y el comité no pierden ninguna pestaña de esta pantalla", () => {
    for (const rol of ["administrador", "comite"]) {
      const p = pestanasProveedores([rol])
      expect(p).toEqual({ catalogo: true, visitas: true })
    }
  })

  it("sin rol útil no hay ninguna pestaña ni pestaña inicial", () => {
    const p = pestanasProveedores([])
    expect(p).toEqual({ catalogo: false, visitas: false })
    // Con todo denegado la pestaña inicial no puede ser una que no se pinta.
    expect(pestanaInicial(p)).toBe("")
  })
})
