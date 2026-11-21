/** @vitest-environment node */
/**
 * R22 · estado de un aviso del visor: los valores con nombre.
 *
 * La auditoría `odd/auditorias/catalogos-y-estados.md` (hallazgo 22) encontró el
 * catálogo en `lib/schemas.ts` y los literales repartidos: la purga por
 * vencimiento escribía `estado: "archivado"`, la lista filtraba por `"publicado"` y
 * la pantalla comparaba diez veces contra `"borrador"`/`"publicado"`. El tipo
 * `AvisoCV["estado"]` ya protegía las comparaciones (es la unión), pero no las
 * ESCRITURAS: ahí el valor es un `string` para Prisma, así que un typo compila y el
 * aviso no se archiva nunca.
 *
 * Ahora los tres valores tienen nombre y la tupla se deriva de ellos.
 */

import { describe, expect, it } from "vitest"
import {
  ESTADOS_AVISO_CV,
  ESTADO_AVISO_ARCHIVADO,
  ESTADO_AVISO_BORRADOR,
  ESTADO_AVISO_PUBLICADO,
  EstadoAvisoCVSchema,
} from "@/lib/schemas"

describe("R22 — estado de un aviso del visor", () => {
  it("la tupla se deriva de los tres valores con nombre", () => {
    expect([...ESTADOS_AVISO_CV]).toEqual(["borrador", "publicado", "archivado"])
    expect([...ESTADOS_AVISO_CV]).toEqual([
      ESTADO_AVISO_BORRADOR,
      ESTADO_AVISO_PUBLICADO,
      ESTADO_AVISO_ARCHIVADO,
    ])
  })

  it("el validador acepta los tres y rechaza cualquier otro", () => {
    for (const estado of ESTADOS_AVISO_CV) {
      expect(EstadoAvisoCVSchema.safeParse(estado).success).toBe(true)
    }
    // `programado` es el caso del informe: mientras no se declare, no existe.
    for (const fuera of ["programado", "Publicado", "", "vencido"]) {
      expect(EstadoAvisoCVSchema.safeParse(fuera).success).toBe(false)
    }
  })
})
