/** @vitest-environment node */
/**
 * R9 · estados del corte de servicios: el catálogo y su subconjunto vigente.
 *
 * La auditoría `odd/auditorias/catalogos-y-estados.md` (hallazgo 9) encontró el
 * par `preaviso · ejecutado` escrito dos veces, una en cada ruta del trámite: en
 * `app/api/cortes-servicio/route.ts` como `ESTADOS_VIGENTES` (con su motivo
 * escrito) y en `app/api/cortes-servicio/revocar/route.ts` como
 * `ESTADOS_REVOCABLES` (el mismo par, otra vez). El riesgo: un estado intermedio
 * real —`notificado`, entre preaviso y ejecutado— que deba bloquear un segundo
 * corte no entra en ninguna de las dos, así que la unidad puede recibir dos cortes
 * del mismo servicio y la revocación responde 409 «no hay corte vigente» sobre un
 * corte que sí existe.
 *
 * El subconjunto es A PROPÓSITO (S5): `revocado` deja la unidad habilitada, así que
 * no bloquea un corte nuevo ni es revocable. Lo que se unifica es la definición.
 */

import { describe, expect, it } from "vitest"
import {
  ESTADOS_DEL_CORTE,
  ESTADOS_VIGENTES_DEL_CORTE,
  esEstadoDelCorte,
} from "@/lib/cortes-servicio"

describe("R9 — estados del corte de servicios", () => {
  it("el catálogo es exactamente preaviso, ejecutado y revocado", () => {
    expect([...ESTADOS_DEL_CORTE]).toEqual(["preaviso", "ejecutado", "revocado"])
  })

  it("lo vigente es el catálogo menos `revocado`, y es un subconjunto declarado", () => {
    expect([...ESTADOS_VIGENTES_DEL_CORTE]).toEqual(["preaviso", "ejecutado"])
    expect(ESTADOS_VIGENTES_DEL_CORTE).not.toContain("revocado")
    for (const estado of ESTADOS_VIGENTES_DEL_CORTE) {
      expect(ESTADOS_DEL_CORTE).toContain(estado)
    }
  })

  it("el validador del catálogo conoce los tres, incluido el revocado", () => {
    for (const estado of ESTADOS_DEL_CORTE) {
      expect(esEstadoDelCorte(estado)).toBe(true)
    }
    // Un estado intermedio nuevo no está hasta que se declare en el catálogo.
    for (const fuera of ["notificado", "Preaviso", ""]) {
      expect(esEstadoDelCorte(fuera)).toBe(false)
    }
  })
})
