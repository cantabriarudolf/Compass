/** @vitest-environment node */
/**
 * R19 · estado de publicación de un acta del visor (CV).
 *
 * La auditoría `odd/auditorias/catalogos-y-estados.md` (hallazgo 19) encontró el
 * catálogo y sus dos valores nombrados por separado, en archivos distintos: la
 * tupla `ESTADOS_PUBLICACION_ACTA_CV` en `lib/schemas.ts` y las constantes
 * `ESTADO_ACTA_PUBLICADA` / `ESTADO_ACTA_DESPUBLICADA` en `app/api/cv/_actas.ts`,
 * al lado del catálogo que las contiene. Cambiar el valor en la tupla (p. ej.
 * `retirado`) no cambiaba las constantes: el acta se despublicaba con un estado
 * que el schema de lectura ya no reconocía y la fila desaparecía del visor sin
 * error.
 *
 * Ahora las constantes son la fuente y la tupla se deriva de ellas; `_actas.ts`
 * las reexporta para no mover a sus consumidores.
 */

import { describe, expect, it } from "vitest"
import {
  ESTADOS_PUBLICACION_ACTA_CV,
  ESTADO_ACTA_DESPUBLICADA,
  ESTADO_ACTA_PUBLICADA,
  EstadoPublicacionActaCVSchema,
} from "@/lib/schemas"
import {
  ESTADO_ACTA_DESPUBLICADA as DESDE_ACTAS_DESPUBLICADA,
  ESTADO_ACTA_PUBLICADA as DESDE_ACTAS_PUBLICADA,
} from "@/app/api/cv/_actas"

describe("R19 — publicación de un acta en el visor", () => {
  it("el catálogo se deriva de los dos valores con nombre", () => {
    expect([...ESTADOS_PUBLICACION_ACTA_CV]).toEqual(["publicado", "despublicado"])
    expect(ESTADOS_PUBLICACION_ACTA_CV).toContain(ESTADO_ACTA_PUBLICADA)
    expect(ESTADOS_PUBLICACION_ACTA_CV).toContain(ESTADO_ACTA_DESPUBLICADA)
  })

  it("`_actas.ts` reexporta los mismos valores, no unos propios", () => {
    expect(DESDE_ACTAS_PUBLICADA).toBe(ESTADO_ACTA_PUBLICADA)
    expect(DESDE_ACTAS_DESPUBLICADA).toBe(ESTADO_ACTA_DESPUBLICADA)
  })

  it("el validador acepta los dos y rechaza cualquier otro estado", () => {
    for (const estado of ESTADOS_PUBLICACION_ACTA_CV) {
      expect(EstadoPublicacionActaCVSchema.safeParse(estado).success).toBe(true)
    }
    // `retirado` es el caso del informe: la tupla y las constantes tienen que
    // moverse juntas, y mientras no se declare, el visor no lo reconoce.
    for (const fuera of ["retirado", "Publicado", "borrador", ""]) {
      expect(EstadoPublicacionActaCVSchema.safeParse(fuera).success).toBe(false)
    }
  })
})
