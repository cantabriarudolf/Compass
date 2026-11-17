/**
 * @vitest-environment node
 *
 * La resolución del acuerdo PRESENCIAL (`lib/acuerdos.ts`): el resultado se
 * PROCLAMA en la sala, no se deduce de votos (S2 — pedido textual del owner,
 * L1). El camino electrónico ya está fijado en `test/api/acuerdos.test.ts` (y
 * su regla pura en `test/lib`); acá se fija el contraste con lo proclamado:
 *
 *   1. `quorumAlcanzado: true` → `aprobado`, con los números del acta como
 *      evidencia y el motivo nombrando la regla APLICADA (`quorumRequerido`);
 *   2. `quorumAlcanzado: false` → `rechazado`: la sala votó, aunque no pase, y
 *      el resultado queda registrado igual;
 *   3. una regla no reconocida no resuelve (defensa: la ruta no debe cerrar);
 *   4. `esResultadoProclamado` distingue el acta completa de cualquier otra
 *      cosa que pueda venir de una columna Json.
 */
import { describe, it, expect } from "vitest"
import {
  esResultadoProclamado,
  resolucionPresencial,
} from "@/lib/acuerdos"

describe("lib/acuerdos — resolución presencial: se registra lo proclamado (S2)", () => {
  const proclamadoAprobado = {
    aFavor: 3,
    enContra: 1,
    abstenciones: 0,
    presentes: 4,
    quorumAlcanzado: true,
  }

  it("la sala proclamó que se alcanzó la mayoría → aprobado, con el acta como evidencia", () => {
    const computo = resolucionPresencial({
      quorumRequerido: "un_voto_por_miembro",
      proclamado: proclamadoAprobado,
    })
    expect(computo.resultado).toBe("aprobado")
    // Los números del acta se registran, no se recalculan: son la evidencia.
    expect(computo.aFavor).toBe(3)
    expect(computo.enContra).toBe(1)
    expect(computo.abstenciones).toBe(0)
    // El motivo contrasta la proclama con la regla APLICADA, por su nombre.
    expect(computo.motivo).toContain(
      "Mayoría absoluta de los votos emitidos por el comité"
    )
    expect(computo.motivo).toContain("proclamado")
    expect(computo.motivo).toContain("se alcanzó")
  })

  it("la sala proclamó que no se alcanzó → rechazado, y el resultado queda registrado igual", () => {
    const computo = resolucionPresencial({
      quorumRequerido: "un_voto_por_miembro",
      proclamado: {
        aFavor: 1,
        enContra: 2,
        abstenciones: 1,
        presentes: 4,
        quorumAlcanzado: false,
      },
    })
    expect(computo.resultado).toBe("rechazado")
    expect(computo.aFavor).toBe(1)
    expect(computo.enContra).toBe(2)
    expect(computo.abstenciones).toBe(1)
    expect(computo.motivo).toContain("no se alcanzó")
    expect(computo.motivo).toContain("registrado")
  })

  it("la regla de la asamblea se nombra en el motivo: el contraste es contra la regla registrada", () => {
    const computo = resolucionPresencial({
      quorumRequerido: "mayoria_absoluta_presentes",
      proclamado: {
        aFavor: 45,
        enContra: 10,
        abstenciones: 25,
        presentes: 80,
        quorumAlcanzado: true,
      },
    })
    expect(computo.resultado).toBe("aprobado")
    expect(computo.motivo).toContain(
      "Mayoría absoluta de los derechos presentes"
    )
    expect(computo.aFavor).toBe(45)
    expect(computo.abstenciones).toBe(25)
  })

  it("una regla no reconocida no resuelve: el cierre no puede apoyarse en ella", () => {
    const computo = resolucionPresencial({
      quorumRequerido: "regla_inventada",
      proclamado: proclamadoAprobado,
    })
    expect(computo.resultado).toBe("pendiente")
    expect(computo.motivo).toContain("No se reconoce la regla de quórum")
  })

  it("esResultadoProclamado acepta el acta completa y rechaza cualquier otra cosa", () => {
    expect(esResultadoProclamado(proclamadoAprobado)).toBe(true)
    expect(esResultadoProclamado(null)).toBe(false)
    expect(esResultadoProclamado("aprobado")).toBe(false)
    expect(
      esResultadoProclamado({ aFavor: 3, enContra: 1, abstenciones: 0, presentes: 4 })
    ).toBe(false)
    expect(
      esResultadoProclamado({
        aFavor: -1,
        enContra: 1,
        abstenciones: 0,
        presentes: 4,
        quorumAlcanzado: true,
      })
    ).toBe(false)
    expect(
      esResultadoProclamado({
        aFavor: Number.POSITIVE_INFINITY,
        enContra: 1,
        abstenciones: 0,
        presentes: 4,
        quorumAlcanzado: true,
      })
    ).toBe(false)
  })
})
