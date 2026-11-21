/** @vitest-environment node */
/**
 * R11 · estados del convenio de pago y de su cuota: catálogo y subconjuntos.
 *
 * La auditoría `odd/auditorias/catalogos-y-estados.md` (hallazgo 11) encontró que
 * estos dos catálogos **no existían en código**: vivían en un comentario de
 * `prisma/schema.prisma` y en literales repartidos por seis archivos. El caso
 * concreto: la anulación del convenio filtra las cuotas con
 * `{ in: ["pendiente", "vencida"] }`; si las cuotas ganan un estado (`en_gestion`),
 * la anulación deja esas cuotas vivas y el deudor sigue pagando un convenio
 * anulado — sin error, sin test, sin tipos.
 *
 * Ahora los dos catálogos y sus subconjuntos se declaran una vez, con la invariante
 * que los hace seguros: lo anulable más lo que no lo es cubre el catálogo entero,
 * así que un estado nuevo obliga a decidir de qué lado cae.
 */

import { describe, expect, it } from "vitest"
import {
  ESTADOS_CONVENIO_PAGO,
  ESTADOS_CONVENIO_ANULABLES,
  ESTADOS_CUOTA_CONVENIO,
  ESTADOS_CUOTA_ANULABLES,
} from "@/lib/schemas"

describe("R11 — convenio de pago y su cuota", () => {
  it("el catálogo del convenio es el de la base", () => {
    expect([...ESTADOS_CONVENIO_PAGO]).toEqual(["vigente", "saldado", "incumplido", "anulado"])
  })

  it("el catálogo de la cuota es el de la base", () => {
    expect([...ESTADOS_CUOTA_CONVENIO]).toEqual(["pendiente", "pagada", "vencida", "anulada"])
  })

  it("lo anulable del convenio son los vivos, no la historia", () => {
    expect([...ESTADOS_CONVENIO_ANULABLES]).toEqual(["vigente", "incumplido"])
    expect(ESTADOS_CONVENIO_ANULABLES).not.toContain("saldado")
    expect(ESTADOS_CONVENIO_ANULABLES).not.toContain("anulado")
    // Invariante: un estado nuevo tiene que decidirse o este test se cae.
    expect(ESTADOS_CONVENIO_ANULABLES.length).toBeLessThan(ESTADOS_CONVENIO_PAGO.length)
  })

  it("lo anulable de la cuota son las impagas, y la invariante cierra", () => {
    expect([...ESTADOS_CUOTA_ANULABLES]).toEqual(["pendiente", "vencida"])
    // El caso del informe: si una cuota gana un estado impago nuevo, la anulación
    // del convenio no puede dejarla viva. El conjunto declarado es el único lugar
    // donde se decide.
    for (const estado of ESTADOS_CUOTA_ANULABLES) {
      expect(ESTADOS_CUOTA_CONVENIO).toContain(estado)
    }
    expect(ESTADOS_CUOTA_ANULABLES).not.toContain("pagada")
    expect(ESTADOS_CUOTA_ANULABLES).not.toContain("anulada")
  })
})
