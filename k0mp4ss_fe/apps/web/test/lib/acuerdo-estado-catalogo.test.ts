/** @vitest-environment node */
/**
 * R10 · estado de un acuerdo: el catálogo y sus tres valores con nombre.
 *
 * La auditoría `odd/auditorias/catalogos-y-estados.md` (hallazgo 10) encontró que
 * este catálogo **no existía en código**: vivía en un comentario de
 * `prisma/schema.prisma` y en una decena de literales repartidos por rutas y
 * pantallas. Un typo en cualquiera de esos sitios compila —la columna es `String`—
 * y el acuerdo aprobado deja de habilitar el convenio de pago y el corte de
 * servicios, con el mensaje «el acuerdo no está aprobado» sobre un acuerdo que sí lo
 * está.
 *
 * Ahora el catálogo y sus tres valores con nombre están en `lib/schemas.ts`, y los
 * consumidores comparan contra la constante. Igual que en R11, **no se estrecha el
 * contrato de lectura**: lo que se ataca es el typo, no la forma de leer.
 */

import { describe, expect, it } from "vitest"
import {
  ESTADOS_ACUERDO,
  ESTADO_ACUERDO_ABIERTO,
  ESTADO_ACUERDO_APROBADO,
  ESTADO_ACUERDO_RECHAZADO,
} from "@/lib/schemas"

describe("R10 — estado de un acuerdo", () => {
  it("el catálogo es el de la base", () => {
    expect([...ESTADOS_ACUERDO]).toEqual(["abierto", "aprobado", "rechazado"])
  })

  it("los tres valores con nombre son los del catálogo y no se repiten", () => {
    const nombrados = [
      ESTADO_ACUERDO_ABIERTO,
      ESTADO_ACUERDO_APROBADO,
      ESTADO_ACUERDO_RECHAZADO,
    ]
    expect(nombrados).toEqual([...ESTADOS_ACUERDO])
    expect(new Set(nombrados).size).toBe(ESTADOS_ACUERDO.length)
    for (const valor of nombrados) {
      expect(ESTADOS_ACUERDO).toContain(valor)
    }
  })

  it("el valor que habilita convenio y corte es el aprobado, y es uno solo", () => {
    // El consumidor compara contra `ESTADO_ACUERDO_APROBADO`: si alguien declara
    // otro valor como «el aprobado», este test lo delata.
    expect(ESTADO_ACUERDO_APROBADO).toBe("aprobado")
    expect(ESTADOS_ACUERDO.filter((e) => e === ESTADO_ACUERDO_APROBADO)).toHaveLength(1)
  })
})
