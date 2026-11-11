/**
 * @vitest-environment node
 *
 * Serie «Vigencia del Registro» — el calendario que hoy no existe (S2, S3, S1).
 *
 * Lo que se prueba es el **paso del tiempo**, que es lo único que no se puede
 * probar a mano: se recorre el año de una unidad —mes 10, mes 12, los 60 días y
 * el día siguiente— con fechas fijas. Nada de `new Date()` escondido: si el
 * reloj se leyera solo, el mismo dato daría dos respuestas distintas en dos
 * corridas y el test no probaría nada.
 */
import { describe, expect, it } from "vitest"

import {
  DIAS_PARA_RESPONDER,
  estadoDeVigencia,
  estadoDelCaso,
  habilitaPropuestaDeMulta,
  multaDisponible,
  vencimientoDelRequerimiento,
} from "@/lib/vigencia-registro"

/** Última actualización de referencia: 1 de enero de 2026. */
const ULTIMA = "2026-01-01"

describe("vigencia del registro — el año del dato", () => {
  it("el mes 1 está al día y sabe cuándo empieza a correr el aviso", () => {
    const v = estadoDeVigencia({ ultimaActualizacion: ULTIMA }, "2026-01-15")
    expect(v.estado).toBe("al_dia")
    // Aviso a los 10 meses: 1 de noviembre de 2026.
    expect(v.cambiaEl).toBe("2026-11-01")
  })

  it("el mes 10 avisa al propietario: «por vencer», todavía sin requerir", () => {
    const v = estadoDeVigencia({ ultimaActualizacion: ULTIMA }, "2026-11-02")
    expect(v.estado).toBe("por_vencer")
    // El siguiente hito es el requerimiento, a los 12 meses.
    expect(v.cambiaEl).toBe("2027-01-01")
  })

  it("el mes 12 pide requerir: es el acto que arranca los 60 días", () => {
    const v = estadoDeVigencia({ ultimaActualizacion: ULTIMA }, "2027-01-01")
    expect(v.estado).toBe("requerido")
    expect(v.descripcion).toContain("corresponde requerir")
  })

  it("sin requerimiento NUNCA se habilita la multa, aunque pasen los 14 meses", () => {
    // Decisión escrita en el módulo: no se multa a quien no fue requerido.
    const v = estadoDeVigencia({ ultimaActualizacion: ULTIMA }, "2027-06-01")
    expect(v.estado).toBe("requerido")
    expect(habilitaPropuestaDeMulta(v)).toBe(false)
  })
})

describe("vigencia del registro — los 60 días del requerimiento", () => {
  const requerido = { ultimaActualizacion: ULTIMA, requerimientoEn: "2027-01-10" }

  it("el mismo día del requerimiento quedan los 60 días completos", () => {
    const v = estadoDeVigencia(requerido, "2027-01-10")
    expect(v.estado).toBe("requerido")
    expect(v.diasParaCambiar).toBe(DIAS_PARA_RESPONDER)
  })

  it("el día 59 sigue teniendo plazo", () => {
    const v = estadoDeVigencia(requerido, "2027-03-10")
    expect(v.estado).toBe("requerido")
    expect(v.diasParaCambiar).toBeGreaterThan(0)
  })

  it("el día 61 habilita la propuesta de multa, con la fecha de vencimiento", () => {
    const v = estadoDeVigencia(requerido, "2027-03-12")
    expect(v.estado).toBe("habilitado_para_multa")
    expect(v.cambiaEl).toBe("2027-03-11")
    expect(habilitaPropuestaDeMulta(v)).toBe(true)
  })

  it("revalidar sin cambios cumple: al limpiar el requerimiento vuelve a al día", () => {
    // S3: confirmar que sigue igual es cumplir. La revalidación mueve
    // `ultimaActualizacion` y borra el requerimiento.
    const v = estadoDeVigencia(
      { ultimaActualizacion: "2027-03-10", requerimientoEn: null },
      "2027-03-10"
    )
    expect(v.estado).toBe("al_dia")
  })
})

describe("vigencia del registro — el caso persistido (S2, S6)", () => {
  it("una unidad sin declaración no se puede multar: se reporta como incidente de datos", () => {
    const v = estadoDelCaso({}, "2027-06-01")
    expect(v.estado).toBe("sin_declaracion")
    expect(habilitaPropuestaDeMulta(v)).toBe(false)
  })

  it("requerir una unidad sin declaración arranca los 60 días igual", () => {
    // La obligación nace del acto de requerir, no de una fecha de dato que no consta.
    const v = estadoDelCaso({ requerimientoEn: "2027-01-10" }, "2027-01-11")
    expect(v.estado).toBe("requerido")
    expect(v.diasParaCambiar).toBe(DIAS_PARA_RESPONDER - 1)
  })

  it("pasados los 60 días de ese requerimiento, el caso habilita la multa", () => {
    const v = estadoDelCaso({ requerimientoEn: "2027-01-10" }, "2027-03-12")
    expect(v.estado).toBe("habilitado_para_multa")
    expect(habilitaPropuestaDeMulta(v)).toBe(true)
  })

  it("el vencimiento del requerimiento se congela a 60 días corridos", () => {
    // S6: la fecha de vencimiento queda fijada en el acto, no se recalcula después.
    expect(vencimientoDelRequerimiento("2027-01-10").toISOString()).toBe(
      "2027-03-11T00:00:00.000Z"
    )
    // Cruza fin de año sin corrimientos de zona ni de mes.
    expect(vencimientoDelRequerimiento("2026-12-31").toISOString()).toBe(
      "2027-03-01T00:00:00.000Z"
    )
  })
})

describe("vigencia del registro — el monto lo declara la comunidad (S1)", () => {
  it("sin tipo declarado no se multa y el motivo lo dice", () => {
    const r = multaDisponible(null)
    expect(r.disponible).toBe(false)
    if (!r.disponible) expect(r.motivo).toContain("no se multa")
  })

  it("con tipo y monto declarados, la multa sale del maestro de la comunidad", () => {
    const r = multaDisponible({
      nombre: "Registro de Copropietarios no actualizado",
      valor: 35000,
    })
    expect(r).toEqual({
      disponible: true,
      monto: 35000,
      tipo: "Registro de Copropietarios no actualizado",
    })
  })

  it("un monto en cero o inválido no habilita multa (no hay monto por defecto)", () => {
    expect(multaDisponible({ nombre: "x", valor: 0 }).disponible).toBe(false)
    expect(multaDisponible({ nombre: "x", valor: Number.NaN }).disponible).toBe(
      false
    )
  })
})
