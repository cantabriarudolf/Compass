/** @vitest-environment node */
/**
 * R7 · cuerpos que adoptan un acuerdo: una definición.
 *
 * La auditoría `odd/auditorias/catalogos-y-estados.md` (hallazgo 7) encontró el
 * mismo par `comite · asamblea` en tres lugares: `CUERPOS_DEL_ACUERDO`
 * (`lib/acuerdos.ts`), que **no importa nadie** —parece canónica y no gobierna
 * nada—; `CUERPOS_DEL_PRESUPUESTO` (`lib/presupuesto.ts`), la única con validador;
 * y un `z.enum` inline en `lib/schemas.ts`, que es el que realmente valida la fila
 * persistida. Sumar `consejo` a la primera no cambiaba nada en ejecución: la ruta
 * de presupuestos seguía rechazándolo con la otra tupla.
 *
 * Desde ahora el catálogo vive en `lib/schemas.ts` —el contrato persistido— y las
 * dos tuplas de `lib/` son la MISMA referencia, no copias.
 */

import { describe, expect, it } from "vitest"
import { CUERPOS_DEL_ACUERDO, CuerpoAcuerdoSchema } from "@/lib/schemas"
import { CUERPOS_DEL_PRESUPUESTO, esCuerpoDelPresupuesto } from "@/lib/presupuesto"
import { CUERPOS_DEL_ACUERDO as CUERPOS_DESDE_ACUERDOS } from "@/lib/acuerdos"

describe("R7 — cuerpos que adoptan acuerdos", () => {
  it("el catálogo es exactamente el comité y la asamblea", () => {
    expect([...CUERPOS_DEL_ACUERDO]).toEqual(["comite", "asamblea"])
  })

  it("el validador del contrato acepta los dos y rechaza cualquier otro cuerpo", () => {
    for (const cuerpo of CUERPOS_DEL_ACUERDO) {
      expect(CuerpoAcuerdoSchema.safeParse(cuerpo).success).toBe(true)
    }
    for (const fuera of ["consejo", "Comite", "asamblea_general", ""]) {
      expect(CuerpoAcuerdoSchema.safeParse(fuera).success).toBe(false)
    }
  })

  it("las dos tuplas de `lib/` son la misma referencia, no copias", () => {
    // `toBe` y no `toEqual`: una copia con los mismos valores volvería a divergir
    // en silencio, que es exactamente lo que el informe describe.
    expect(CUERPOS_DEL_PRESUPUESTO).toBe(CUERPOS_DEL_ACUERDO)
    expect(CUERPOS_DESDE_ACUERDOS).toBe(CUERPOS_DEL_ACUERDO)
  })

  it("el validador del presupuesto responde con el catálogo", () => {
    for (const cuerpo of CUERPOS_DEL_ACUERDO) {
      expect(esCuerpoDelPresupuesto(cuerpo)).toBe(true)
    }
    expect(esCuerpoDelPresupuesto("consejo")).toBe(false)
  })
})
