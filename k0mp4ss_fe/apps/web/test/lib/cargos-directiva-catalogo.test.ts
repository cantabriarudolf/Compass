/** @vitest-environment node */
/**
 * R6 · cargos de la directiva: una definición, dos fichas.
 *
 * La auditoría `odd/auditorias/catalogos-y-estados.md` (hallazgo 6) encontró
 * `presidente · tesorero · secretario · director` escrito cuatro veces: dos
 * `z.enum` inline **en el mismo archivo** (`ExtensionGobernanzaSchema` y
 * `MiembroPeriodoSchema`), el array `CARGOS` del formulario de gobernanza y la
 * unión de la semilla. El riesgo concreto: agregar un cargo que el reglamento
 * admite (art. 18) en una sola ficha hace que la ficha de gobernanza lo acepte y
 * el período de la directiva lo rechace, así que el acta no puede registrar al
 * miembro aunque la pantalla lo ofrezca.
 *
 * Este archivo pina el catálogo y la consistencia de la semilla. La garantía de
 * que las DOS fichas usan el mismo schema es de compilación: las dos declaran
 * `CargoDirectivaSchema`, y por eso el compilador no deja que una diverja.
 */

import { describe, expect, it } from "vitest"
import { CARGOS_DIRECTIVA, CargoDirectivaSchema } from "@/lib/schemas"
import { personas } from "@/data/comunidad/personas"

describe("R6 — cargos de la directiva", () => {
  it("el catálogo es exactamente los cuatro cargos del reglamento", () => {
    expect([...CARGOS_DIRECTIVA]).toEqual(["presidente", "tesorero", "secretario", "director"])
  })

  it("el validador acepta los cuatro y rechaza cualquier otro cargo", () => {
    for (const cargo of CARGOS_DIRECTIVA) {
      expect(CargoDirectivaSchema.safeParse(cargo).success).toBe(true)
    }
    // `vicepresidente` es el caso del informe: el reglamento admite otros cargos,
    // pero hasta que el catálogo lo declare, el acta NO puede registrarlo.
    for (const fuera of ["vicepresidente", "Presidente", "presidenta", ""]) {
      expect(CargoDirectivaSchema.safeParse(fuera).success).toBe(false)
    }
  })

  it("ninguna ficha de la semilla usa un cargo fuera del catálogo", () => {
    // Las fichas de gobernanza de la semilla se escriben a mano: un cargo que el
    // catálogo no conoce deja una persona fuera de la nómina de la directiva.
    const fichas = personas.filter((p) => p.datosGobernanza !== undefined)
    expect(fichas.length).toBeGreaterThan(0)
    for (const ficha of fichas) {
      expect(CARGOS_DIRECTIVA).toContain(ficha.datosGobernanza?.cargoDirectiva)
    }
  })
})
