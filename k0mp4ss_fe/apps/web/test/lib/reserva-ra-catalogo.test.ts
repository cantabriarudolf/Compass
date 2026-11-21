/** @vitest-environment node */
/**
 * R16 · estados de una reserva (RA): el catálogo y qué estados ocupan su tramo.
 *
 * La auditoría `odd/auditorias/catalogos-y-estados.md` (hallazgo 16) encontró el
 * catálogo en `lib/schemas.ts` pero los filtros escritos a mano en cada ruta: el
 * control de solape preguntaba `estado: { not: "cancelada" }`, es decir definía su
 * conjunto por negación. Con un estado nuevo (`vencida`) el control cambia de
 * significado sin que nadie lo decida, y el vecino puede reservar dos veces el mismo
 * tramo —o quedar bloqueado por una reserva que ya no ocupa nada—.
 *
 * Ahora el conjunto que ocupa el tramo se declara una vez, con su motivo, y el
 * control de solape lo usa. La invariante pineada: lo que ocupa más lo cancelado es
 * el catálogo entero, así que un estado nuevo obliga a decidir de qué lado cae.
 */

import { describe, expect, it } from "vitest"
import {
  ESTADOS_RESERVA_OCUPAN,
  ESTADOS_RESERVA_RA,
  EstadoReservaRASchema,
  esReservaQueOcupa,
} from "@/lib/schemas"

describe("R16 — estados de una reserva", () => {
  it("el catálogo es el de hoy", () => {
    expect([...ESTADOS_RESERVA_RA]).toEqual(["confirmada", "cancelada", "solicitada"])
  })

  it("lo que ocupa el tramo es el catálogo menos la cancelada", () => {
    expect([...ESTADOS_RESERVA_OCUPAN]).toEqual(["confirmada", "solicitada"])
    expect(ESTADOS_RESERVA_OCUPAN).not.toContain("cancelada")
    // La invariante: un estado nuevo tiene que decidirse, o este test se cae.
    expect([...ESTADOS_RESERVA_OCUPAN, "cancelada"].sort()).toEqual([...ESTADOS_RESERVA_RA].sort())
  })

  it("el predicado responde con el conjunto declarado", () => {
    expect(esReservaQueOcupa("solicitada")).toBe(true)
    expect(esReservaQueOcupa("confirmada")).toBe(true)
    expect(esReservaQueOcupa("cancelada")).toBe(false)
    // Un estado fuera del catálogo no ocupa: el control de solape no lo inventa.
    expect(esReservaQueOcupa("vencida")).toBe(false)
  })

  it("el validador rechaza cualquier estado fuera del catálogo", () => {
    for (const estado of ESTADOS_RESERVA_RA) {
      expect(EstadoReservaRASchema.safeParse(estado).success).toBe(true)
    }
    for (const fuera of ["vencida", "Confirmada", "pendiente", ""]) {
      expect(EstadoReservaRASchema.safeParse(fuera).success).toBe(false)
    }
  })
})
