/** @vitest-environment node */
/**
 * R2 · el tipo del cliente de la cobranza FI conoce todos los desenlaces que el
 * servidor devuelve.
 *
 * La auditoría `odd/auditorias/catalogos-y-estados.md` (hallazgo 2) encontró tres
 * listas para la misma cosa: la de la ruta (`enviado|pendiente|fallido|omitido|
 * duplicado`), otra inline para la persistencia y la del cliente
 * (`enviado|pendiente|omitido|duplicado`) — a la del cliente le faltaba
 * `fallido`, que el servidor SÍ escribe. Consecuencia real: cualquier mapa de
 * etiquetas o `switch` exhaustivo sobre `ResumenCanalCobranza` no tenía rama para
 * el rebote y la pantalla de gastos comunes imprimía el valor crudo
 * (`${canal} ${estado}`), justo en el caso donde el motivo importa.
 *
 * Este archivo pina dos cosas:
 *
 *   1. El vocabulario de la respuesta es uno solo (`ESTADOS_CANAL_COBRANZA_FI`),
 *      deriva del catálogo de envío y lo comparten la ruta y el hook.
 *   2. La etiqueta de cada desenlace es un `Record` de la unión completa: un
 *      estado nuevo rompe la compilación en vez de pintarse crudo.
 */

import { describe, expect, it } from "vitest"
import { ESTADOS_CANAL_COBRANZA_FI, ESTADOS_ENVIO_SMTP } from "@/lib/schemas"
import {
  ETIQUETA_ESTADO_CANAL,
  resumenDeCanales,
  type ResumenCanalCobranza,
} from "@/lib/api/use-cobros-fi"

/** Los cinco desenlaces que la gestión reporta por canal, escritos a mano. */
const DESENLACES_HOY = ["enviado", "pendiente", "fallido", "omitido", "duplicado"] as const

const canal = (
  nombre: "visor" | "email",
  estado: ResumenCanalCobranza["estado"],
  motivo?: string
): ResumenCanalCobranza => ({ canal: nombre, estado, motivo })

describe("R2 — un solo vocabulario para el desenlace por canal", () => {
  it("son los tres del emisor más los dos que no son estado de la columna", () => {
    expect([...ESTADOS_CANAL_COBRANZA_FI]).toEqual([...DESENLACES_HOY])
    for (const estado of ESTADOS_ENVIO_SMTP) {
      expect(ESTADOS_CANAL_COBRANZA_FI).toContain(estado)
    }
  })

  it("el rebote está en el vocabulario: el servidor lo escribe y el cliente lo lee", () => {
    // El caso concreto del hallazgo: `fallido` faltaba en el tipo del cliente.
    expect(ESTADOS_CANAL_COBRANZA_FI).toContain("fallido")
  })

  it("cada desenlace tiene etiqueta: ninguna pantalla pinta el valor crudo", () => {
    for (const estado of DESENLACES_HOY) {
      const etiqueta = ETIQUETA_ESTADO_CANAL[estado]
      expect(etiqueta).toBeTruthy()
      expect(etiqueta).not.toBe(estado)
    }
  })
})

describe("R2 — la pantalla pinta el desenlace, no el valor de la base", () => {
  it("un correo rebotado dice Fallido y su motivo, no `email fallido`", () => {
    const resumen = resumenDeCanales({
      email: canal("email", "fallido", "El servidor SMTP rechazó el mensaje."),
    })

    expect(resumen).toBe("email Fallido (El servidor SMTP rechazó el mensaje.)")
    expect(resumen).not.toContain("email fallido")
  })

  it("un canal apagado conserva su motivo, y sin motivo lo dice", () => {
    expect(resumenDeCanales({ visor: canal("visor", "omitido", "Sin preferencia.") })).toBe(
      "visor Omitido (Sin preferencia.)"
    )
    expect(resumenDeCanales({ visor: canal("visor", "omitido") })).toBe("visor Omitido (sin motivo)")
  })

  it("resume los dos canales en orden visor → email", () => {
    const resumen = resumenDeCanales({
      email: canal("email", "fallido", "Rebotó."),
      visor: canal("visor", "enviado"),
    })

    expect(resumen).toBe("visor Enviado · email Fallido (Rebotó.)")
  })

  it("sin canales no inventa texto", () => {
    expect(resumenDeCanales(undefined)).toBe("")
    expect(resumenDeCanales({})).toBe("")
  })
})
