/** @vitest-environment node */
/**
 * R18 · estados de un adelanto (PL): el catálogo y sus dos subconjuntos.
 *
 * La auditoría `odd/auditorias/catalogos-y-estados.md` (hallazgo 18) encontró el
 * catálogo de cinco valores (`pendiente · descontado_parcial · saldado`, más el
 * legado `descontado` y `desestimado`) con dos subconjuntos escritos a mano en
 * archivos distintos: `["pendiente","descontado_parcial"]` en la ruta de baja y
 * un `||` en la pantalla que sólo miraba `saldado` y `descontado`. Consecuencia
 * real: un adelanto parcialmente descontado se pintaba como si no tuviera
 * descuento, y el legado seguía vivo sin que nadie lo declarara.
 *
 * Ahora los dos subconjuntos se declaran una vez, con su motivo, `satisfies` el
 * catálogo.
 */

import { describe, expect, it } from "vitest"
import {
  ESTADOS_ADELANTO_CON_DESCUENTO,
  ESTADOS_ADELANTO_DESESTIMABLES,
  ESTADOS_ADELANTO_PL,
  ESTADOS_ADELANTO_VIGENTES,
} from "@/lib/schemas"

const CANONICOS = ["pendiente", "descontado_parcial", "saldado"] as const

describe("R18 — estados de un adelanto", () => {
  it("el catálogo conserva los cinco, incluidos el legado y el desestimado", () => {
    expect([...ESTADOS_ADELANTO_PL]).toEqual([
      ...CANONICOS,
      "descontado",
      "desestimado",
    ])
  })

  it("los vigentes son los tres de la doctrina, sin el legado", () => {
    expect([...ESTADOS_ADELANTO_VIGENTES]).toEqual([...CANONICOS])
    expect(ESTADOS_ADELANTO_VIGENTES).not.toContain("descontado")
    expect(ESTADOS_ADELANTO_VIGENTES).not.toContain("desestimado")
  })

  it("lo que lleva descuento incluye el parcial y el legado, no el saldado", () => {
    // El caso del informe: `descontado_parcial` estaba afuera y la pantalla lo
    // pintaba como si no tuviera descuento.
    expect([...ESTADOS_ADELANTO_CON_DESCUENTO]).toEqual(["descontado_parcial", "descontado"])
    expect(ESTADOS_ADELANTO_CON_DESCUENTO).toContain("descontado_parcial")
    expect(ESTADOS_ADELANTO_CON_DESCUENTO).not.toContain("saldado")
  })

  it("los desestimables son los que tienen saldo vivo", () => {
    expect([...ESTADOS_ADELANTO_DESESTIMABLES]).toEqual(["pendiente", "descontado_parcial"])
    expect(ESTADOS_ADELANTO_DESESTIMABLES).not.toContain("saldado")
    expect(ESTADOS_ADELANTO_DESESTIMABLES).not.toContain("desestimado")
  })

  it("todo valor de un subconjunto pertenece al catálogo", () => {
    for (const subconjunto of [
      ESTADOS_ADELANTO_VIGENTES,
      ESTADOS_ADELANTO_CON_DESCUENTO,
      ESTADOS_ADELANTO_DESESTIMABLES,
    ]) {
      for (const estado of subconjunto) {
        expect(ESTADOS_ADELANTO_PL).toContain(estado)
      }
    }
  })
})
