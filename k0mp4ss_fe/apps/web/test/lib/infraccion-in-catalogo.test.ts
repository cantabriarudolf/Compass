/** @vitest-environment node */
/**
 * R17 · estados de una infracción (IN): el catálogo y sus dos subconjuntos.
 *
 * La auditoría `odd/auditorias/catalogos-y-estados.md` (hallazgo 17) encontró el
 * catálogo `en_revision · apelada · aplicada · desestimada` con subconjuntos
 * escritos a mano en cada ruta: `["en_revision","apelada"]` dos veces en
 * `aplicar/route.ts` (el guard y el `where`) y otra en `desestimar/route.ts`;
 * `["aplicada","desestimada"]` en `respaldar/route.ts`. Los subconjuntos son
 * correctos hoy y no declaran por qué. Con un estado nuevo (p. ej. `prescrita`)
 * queda fuera de los dos guards, así que la infracción prescrita se puede aplicar
 * y el acto queda en la bitácora como legítimo.
 *
 * Ahora los dos subconjuntos se declaran una vez, `satisfies` el catálogo, con su
 * motivo escrito. La invariante que se pina abajo es lo que los hace seguros:
 * todo estado está en trámite o resuelto, y ninguna de las dos a la vez. Un estado
 * nuevo sin decidir su lado rompe este test.
 */

import { describe, expect, it } from "vitest"
import {
  ESTADOS_INFRACCION_EN_TRAMITE,
  ESTADOS_INFRACCION_IN,
  ESTADOS_INFRACCION_RESUELTAS,
  EstadoInfraccionINSchema,
} from "@/lib/schemas"

describe("R17 — estados de una infracción", () => {
  it("el catálogo es el de hoy", () => {
    expect([...ESTADOS_INFRACCION_IN]).toEqual([
      "en_revision",
      "apelada",
      "aplicada",
      "desestimada",
    ])
  })

  it("cada estado está en trámite o resuelto, nunca en los dos", () => {
    for (const estado of ESTADOS_INFRACCION_IN) {
      const enTramite = ESTADOS_INFRACCION_EN_TRAMITE.includes(estado as never)
      const resuelto = ESTADOS_INFRACCION_RESUELTAS.includes(estado as never)
      expect(enTramite !== resuelto).toBe(true)
    }
    // Los dos subconjuntos cubren el catálogo exactamente: no sobra ni falta nada.
    expect([...ESTADOS_INFRACCION_EN_TRAMITE, ...ESTADOS_INFRACCION_RESUELTAS].sort()).toEqual(
      [...ESTADOS_INFRACCION_IN].sort()
    )
  })

  it("el validador rechaza cualquier estado fuera del catálogo", () => {
    for (const estado of ESTADOS_INFRACCION_IN) {
      expect(EstadoInfraccionINSchema.safeParse(estado).success).toBe(true)
    }
    // `prescrita` es el caso del informe: mientras no se declare, no existe.
    for (const fuera of ["prescrita", "En_Revision", "cerrada", ""]) {
      expect(EstadoInfraccionINSchema.safeParse(fuera).success).toBe(false)
    }
  })
})
