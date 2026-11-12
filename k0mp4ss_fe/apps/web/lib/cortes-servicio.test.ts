/**
 * @vitest-environment node
 *
 * F28 — corte de servicios por morosidad (Ley 21.442 art. 20 N°9).
 *
 * Lo que se fija acá es la REGLA PURA del trámite, sin base y sin reloj: el corte
 * exige TRES O MÁS cuotas impagas, lo prohíbe la electrodependencia y la deuda
 * devengada bajo estado de catástrofe, no admite dos servicios suspendidos a la
 * vez y se ejecuta recién cumplidos CINCO días corridos desde el preaviso (el día
 * del preaviso no cuenta; el quinto sí).
 *
 * Todo se mide desde las funciones públicas: no se inspecciona ninguna estructura
 * interna y no se toca la base.
 */
import { describe, expect, it } from "vitest"

import {
  CUOTAS_MINIMAS_PARA_CORTE,
  DIAS_DE_PREAVISO,
  cortePermitido,
  fechaHabilitadaDelCorte,
  puedeEjecutarse,
} from "./cortes-servicio"

/** `AAAA-MM-DD` de una fecha, en UTC (la regla no depende de la zona del host). */
const dia = (fecha: Date): string => fecha.toISOString().slice(0, 10)

/** Instante UTC exacto, para comparar sin depender de la zona del host. */
const utc = (iso: string): Date => new Date(iso)

/** Entrada del dictamen con lo mínimo que la ley prohíbe en falso. */
const entrada = (extra: Record<string, unknown> = {}) => ({
  cuotasImpagas: 3,
  electrodependiente: false,
  deudaDeCatastrofe: false,
  otroServicioYaCortado: false,
  ...extra,
})

describe("cortePermitido — tres o más cuotas impagas", () => {
  it("habilita el corte con tres cuotas impagas, continuas o discontinuas", () => {
    expect(cortePermitido(entrada({ cuotasImpagas: CUOTAS_MINIMAS_PARA_CORTE }))).toEqual({
      permitido: true,
    })
    expect(cortePermitido(entrada({ cuotasImpagas: 10 }))).toEqual({ permitido: true })
  })

  it("no habilita el corte con dos cuotas, una o ninguna", () => {
    for (const cuotas of [0, 1, 2]) {
      const dictamen = cortePermitido(entrada({ cuotasImpagas: cuotas }))
      expect(dictamen.permitido).toBe(false)
      if (dictamen.permitido) throw new Error("el dictamen debía negar el corte")
      // El motivo dice la regla, no el número de la fila.
      expect(dictamen.motivo).toContain("tres o más cuotas")
    }
  })
})

describe("cortePermitido — prohibiciones del artículo 20 N°9", () => {
  it("la electrodependencia bloquea SIEMPRE, aunque haya diez cuotas impagas", () => {
    const dictamen = cortePermitido(
      entrada({ cuotasImpagas: 10, electrodependiente: true })
    )
    expect(dictamen.permitido).toBe(false)
    if (dictamen.permitido) throw new Error("el dictamen debía negar el corte")
    expect(dictamen.motivo).toContain("electrodependiente")
    expect(dictamen.motivo).toContain("art. 20 N°9")
  })

  it("la deuda devengada bajo estado de catástrofe bloquea el corte", () => {
    const dictamen = cortePermitido(entrada({ deudaDeCatastrofe: true }))
    expect(dictamen.permitido).toBe(false)
    if (dictamen.permitido) throw new Error("el dictamen debía negar el corte")
    expect(dictamen.motivo).toContain("catástrofe")
  })

  it("un segundo servicio no se suspende mientras otro esté cortado", () => {
    const dictamen = cortePermitido(entrada({ otroServicioYaCortado: true }))
    expect(dictamen.permitido).toBe(false)
    if (dictamen.permitido) throw new Error("el dictamen debía negar el corte")
    expect(dictamen.motivo).toContain("dos servicios")
    expect(dictamen.motivo).toContain("art. 20 N°9")
  })

  it("es puro: la misma entrada da el mismo dictamen y no muta nada", () => {
    const unaVez = { cuotasImpagas: 4, electrodependiente: false, deudaDeCatastrofe: false, otroServicioYaCortado: false }
    const copia = { ...unaVez }
    expect(cortePermitido(unaVez)).toEqual(cortePermitido(unaVez))
    expect(unaVez).toEqual(copia)
  })
})

describe("fechaHabilitadaDelCorte — cinco días corridos desde el preaviso", () => {
  it("el día del preaviso no cuenta y el quinto sí", () => {
    // Preaviso el domingo 1 de marzo: 2, 3, 4 y 5 son los días corridos 1..4; el
    // quinto es el 6. Se habilita al empezar ese día en UTC, no 120 horas después
    // de la hora exacta del preaviso.
    expect(dia(fechaHabilitadaDelCorte(utc("2026-03-01T10:00:00.000Z")))).toBe("2026-03-06")
    expect(dia(fechaHabilitadaDelCorte(utc("2026-03-01T23:59:59.000Z")))).toBe("2026-03-06")
    expect(
      fechaHabilitadaDelCorte(utc("2026-03-01T23:59:59.000Z")).toISOString()
    ).toBe("2026-03-06T00:00:00.000Z")
  })

  it("son días corridos: el fin de semana y el feriado también cuentan", () => {
    // Preaviso el jueves 5 de marzo de 2026: el quinto día corrido cae el martes
    // 10, no el miércoles 11 (los días hábiles no mandan acá).
    expect(dia(fechaHabilitadaDelCorte(utc("2026-03-05T12:00:00.000Z")))).toBe("2026-03-10")
  })

  it("cruza fin de mes, fin de año y el 29 de febrero bisiesto", () => {
    expect(dia(fechaHabilitadaDelCorte(utc("2026-02-25T08:00:00.000Z")))).toBe("2026-03-02")
    expect(dia(fechaHabilitadaDelCorte(utc("2026-12-28T08:00:00.000Z")))).toBe("2027-01-02")
    // 2024 es bisiesto: del 26 de febrero al 2 de marzo hay cinco días corridos
    // contando el 29.
    expect(dia(fechaHabilitadaDelCorte(utc("2024-02-26T08:00:00.000Z")))).toBe("2024-03-02")
  })

  it("no muta la fecha del preaviso que recibe", () => {
    const preaviso = utc("2026-03-01T10:00:00.000Z")
    fechaHabilitadaDelCorte(preaviso)
    expect(preaviso.toISOString()).toBe("2026-03-01T10:00:00.000Z")
    expect(DIAS_DE_PREAVISO).toBe(5)
  })
})

describe("puedeEjecutarse — el corte no se adelanta al quinto día", () => {
  const preaviso = utc("2026-03-01T10:00:00.000Z")
  const habilitada = fechaHabilitadaDelCorte(preaviso)

  it("el día del preaviso y el cuarto día corrido no habilitan la ejecución", () => {
    const mismoDia = puedeEjecutarse({ fechaHabilitada: habilitada, hoy: preaviso, estado: "preaviso" })
    expect(mismoDia.ejecutable).toBe(false)

    const cuartoDia = puedeEjecutarse({
      fechaHabilitada: habilitada,
      hoy: utc("2026-03-05T23:59:59.000Z"),
      estado: "preaviso",
    })
    expect(cuartoDia.ejecutable).toBe(false)
    if (cuartoDia.ejecutable) throw new Error("el corte no podía ejecutarse antes del quinto día")
    expect(cuartoDia.motivo).toContain("cinco días corridos")
  })

  it("el quinto día habilita la ejecución, y también los días siguientes", () => {
    expect(
      puedeEjecutarse({
        fechaHabilitada: habilitada,
        hoy: utc("2026-03-06T00:00:00.000Z"),
        estado: "preaviso",
      })
    ).toEqual({ ejecutable: true })
    expect(
      puedeEjecutarse({
        fechaHabilitada: habilitada,
        hoy: utc("2026-03-20T15:30:00.000Z"),
        estado: "preaviso",
      })
    ).toEqual({ ejecutable: true })
  })

  it("un corte ya ejecutado o revocado no se re-ejecuta", () => {
    for (const estado of ["ejecutado", "revocado"]) {
      const dictamen = puedeEjecutarse({
        fechaHabilitada: habilitada,
        hoy: utc("2026-04-01T12:00:00.000Z"),
        estado,
      })
      expect(dictamen.ejecutable).toBe(false)
      if (dictamen.ejecutable) throw new Error("el corte no podía re-ejecutarse")
      expect(dictamen.motivo).toContain(estado)
    }
  })

  it("un estado fuera del contrato tampoco se ejecuta", () => {
    const dictamen = puedeEjecutarse({
      fechaHabilitada: habilitada,
      hoy: utc("2026-04-01T12:00:00.000Z"),
      estado: "desconocido",
    })
    expect(dictamen.ejecutable).toBe(false)
    if (dictamen.ejecutable) throw new Error("el corte no podía ejecutarse")
    expect(dictamen.motivo).toContain("preaviso")
  })
})
