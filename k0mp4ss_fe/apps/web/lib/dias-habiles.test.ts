/**
 * `lib/dias-habiles` — el día hábil siguiente se DERIVA del calendario.
 *
 * Ley 21.442 art. 20 N°9: regularizada la deuda, la reposición del servicio corre
 * «al día hábil siguiente». Un día tipeado a mano envejece mal (un viernes no es
 * un día hábil siguiente si el sábado y el domingo no lo son) y un feriado
 * tampoco: por eso la regla es una función pura —sin base y sin reloj— que
 * recibe la fecha y los feriados, y devuelve el día en que de verdad procede.
 *
 * Los feriados entran por parámetro porque la fuente del repo es el maestro
 * `Feriado` de la comunidad (tabla `maestros_feriado`): la regla no consulta la
 * base, el llamador le pasa las fechas.
 */
import { describe, it, expect } from "vitest"
import { siguienteDiaHabil, esDiaHabil } from "@/lib/dias-habiles"

/** ISO de la fecha de calendario UTC (AAAA-MM-DD): lo que se compara acá. */
const dia = (fecha: Date): string => fecha.toISOString().slice(0, 10)

describe("siguienteDiaHabil — el día hábil siguiente (Ley 21.442 art. 20 N°9)", () => {
  // 2026-03-06 es viernes; el sábado 7 y el domingo 8 no son días hábiles, así que
  // el día hábil siguiente del viernes es el lunes 9.
  it("un viernes devuelve el lunes: ni el sábado ni el domingo son días hábiles", () => {
    const viernes = new Date("2026-03-06T15:30:00.000Z")
    expect(dia(siguienteDiaHabil(viernes))).toBe("2026-03-09")
  })

  it("un sábado devuelve el lunes, no el domingo", () => {
    const sabado = new Date("2026-03-07T00:00:00.000Z")
    expect(dia(siguienteDiaHabil(sabado))).toBe("2026-03-09")
  })

  it("un domingo devuelve el lunes", () => {
    const domingo = new Date("2026-03-08T12:00:00.000Z")
    expect(dia(siguienteDiaHabil(domingo))).toBe("2026-03-09")
  })

  it("un lunes devuelve el martes: el día hábil siguiente no es el mismo día", () => {
    const lunes = new Date("2026-03-09T09:00:00.000Z")
    expect(dia(siguienteDiaHabil(lunes))).toBe("2026-03-10")
  })

  it("un feriado del maestro se salta: el lunes feriado devuelve el martes", () => {
    // El lunes 9 es hábil por calendario, pero el maestro lo declara feriado.
    const viernes = new Date("2026-03-06T10:00:00.000Z")
    expect(dia(siguienteDiaHabil(viernes, ["2026-03-09"]))).toBe("2026-03-10")
  })

  it("devuelve el INICIO del día hábil y no muta la fecha que recibe", () => {
    const viernes = new Date("2026-03-06T23:59:59.000Z")
    const resultado = siguienteDiaHabil(viernes)
    expect(resultado.toISOString()).toBe("2026-03-09T00:00:00.000Z")
    // La entrada queda intacta: la regla devuelve una fecha nueva.
    expect(viernes.toISOString()).toBe("2026-03-06T23:59:59.000Z")
  })
})

describe("esDiaHabil — el predicado del calendario", () => {
  it("el lunes es hábil, el sábado no y el feriado tampoco", () => {
    expect(esDiaHabil(new Date("2026-03-09T00:00:00.000Z"))).toBe(true)
    expect(esDiaHabil(new Date("2026-03-07T00:00:00.000Z"))).toBe(false)
    expect(esDiaHabil(new Date("2026-03-09T00:00:00.000Z"), ["2026-03-09"])).toBe(false)
  })
})
