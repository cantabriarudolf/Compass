/** @vitest-environment node */
/**
 * R8 · modalidad de un acuerdo: una definición.
 *
 * La auditoría `odd/auditorias/catalogos-y-estados.md` (hallazgo 8) encontró
 * `electronica · presencial` en tres lugares: `MODALIDADES_DEL_ACUERDO`
 * (`lib/acuerdos.ts`), que **no importa nadie**; un `z.enum` inline en
 * `lib/schemas.ts`, que es el que valida de verdad; y un comentario en el schema
 * de Prisma. La tupla inerte es la que un colaborador encuentra buscando "la
 * definición": agregarle `mixta` no habilita nada y el acuerdo queda rechazado por
 * el `z.enum` que nadie relaciona con la constante.
 *
 * Desde ahora el catálogo vive en `lib/schemas.ts` y `lib/acuerdos.ts` reexporta.
 */

import { describe, expect, it } from "vitest"
import { MODALIDADES_DEL_ACUERDO, ModalidadAcuerdoSchema } from "@/lib/schemas"
import { MODALIDADES_DEL_ACUERDO as DESDE_ACUERDOS } from "@/lib/acuerdos"

describe("R8 — modalidad del acuerdo", () => {
  it("el catálogo es exactamente electrónica y presencial", () => {
    expect([...MODALIDADES_DEL_ACUERDO]).toEqual(["electronica", "presencial"])
  })

  it("las dos entradas son la misma referencia, no copias", () => {
    // `toBe`: una copia con los mismos valores vuelve a divergir en silencio.
    expect(DESDE_ACUERDOS).toBe(MODALIDADES_DEL_ACUERDO)
  })

  it("el validador acepta las dos y rechaza cualquier otra modalidad", () => {
    for (const modalidad of MODALIDADES_DEL_ACUERDO) {
      expect(ModalidadAcuerdoSchema.safeParse(modalidad).success).toBe(true)
    }
    // `mixta` es el caso del informe: mientras el catálogo no la declare, un
    // acuerdo mixto NO se puede registrar aunque la tupla inerte la ofrezca.
    for (const fuera of ["mixta", "Electronica", "presencial_virtual", ""]) {
      expect(ModalidadAcuerdoSchema.safeParse(fuera).success).toBe(false)
    }
  })
})
