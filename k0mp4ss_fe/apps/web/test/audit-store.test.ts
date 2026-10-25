/**
 * @vitest-environment node
 *
 * Candado `audit:store`: el store legacy no puede volver a crecer como fuente de datos.
 *
 * Los casos fijan las tres reglas del script, sin leer el árbol real: archivo nuevo sin excepción
 * falla, excepción viva pasa, y excepción que ya no usa el store también falla (para que la lista
 * sólo se achique).
 */
import { describe, expect, it } from "vitest"
import { evaluar, EXCEPCIONES } from "../scripts/audit-store.mjs"

const USO = 'const x = useCompassStore((s) => s.unidades)\n'
const SIN_USO = 'export const nada = 1\n'

describe("audit:store", () => {
  it("un archivo nuevo que usa el store falla", () => {
    const r = evaluar([{ ruta: "components/nuevo-panel.tsx", texto: USO }], [])

    expect(r.sinExcepcion).toEqual(["components/nuevo-panel.tsx"])
    expect(r.obsoletas).toEqual([])
  })

  it("un archivo declarado en la allowlist pasa", () => {
    const excepciones = [{ archivo: "components/pe/visitas-panel.tsx", motivo: "deuda", desde: "2026-10-25" }]
    const r = evaluar([{ ruta: "components/pe/visitas-panel.tsx", texto: USO }], excepciones)

    expect(r.sinExcepcion).toEqual([])
    expect(r.obsoletas).toEqual([])
  })

  it("una excepción cuyo archivo ya no usa el store es un hallazgo", () => {
    const excepciones = [{ archivo: "components/pe/visitas-panel.tsx", motivo: "deuda", desde: "2026-10-25" }]
    const r = evaluar([{ ruta: "components/pe/visitas-panel.tsx", texto: SIN_USO }], excepciones)

    expect(r.sinExcepcion).toEqual([])
    expect(r.obsoletas).toEqual(["components/pe/visitas-panel.tsx"])
  })

  it("toda excepción declara motivo y fecha", () => {
    for (const e of EXCEPCIONES) {
      expect(e.motivo.length, `${e.archivo} sin motivo`).toBeGreaterThan(10)
      expect(e.desde, `${e.archivo} sin fecha`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})
