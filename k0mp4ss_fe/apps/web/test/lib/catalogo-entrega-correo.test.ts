/** @vitest-environment node */
/**
 * R1 · un solo vocabulario para el estado de una entrega de correo.
 *
 * La auditoría `odd/auditorias/catalogos-y-estados.md` (hallazgo 1) encontró el
 * mismo vocabulario —`pendiente · enviado · fallido`, más `entregado` del visor—
 * declarado en cinco lugares para cuatro columnas distintas, y `EstadoRegistroSMTP`
 * escrito a mano con una unión más. `prisma/schema.prisma` no tiene ni un `enum`:
 * todas las columnas de estado son `String`, así que el único guardián posible es
 * la tupla de `lib/` — y sólo si el escritor **y** el lector la importan. Con una
 * copia por entidad, agregar un desenlace real (p. ej. `rebotado`) compila en
 * todo: el planificador lo devuelve, el traductor del documento lo pasa sin
 * traducir y queda escrita en `envios_documento` una palabra que su catálogo no
 * conoce, que el diálogo pinta cruda porque acepta `| string`.
 *
 * Este archivo hace esa divergencia imposible por construcción:
 *
 *   1. Hay UN catálogo (`ESTADOS_ENTREGA_CORREO`) y UN subconjunto canónico de
 *      lo que un emisor real produce (`ESTADOS_ENVIO_SMTP`).
 *   2. Los tres consumidores cuyo conjunto es idéntico al del emisor (invitación,
 *      cobranza FI, cola CO) no declaran el suyo: son la MISMA referencia.
 *   3. El consumidor que sí tiene un subconjunto distinto (el documento, que
 *      normaliza `enviado` a `entregado`) lo declara `satisfies` el catálogo: un
 *      valor que no esté allá no compila, y uno nuevo en el catálogo obliga a
 *      decidir acá.
 *   4. La traducción al documento es una función total, no un `?:` que deja pasar
 *      cualquier palabra: un desenlace desconocido se registra `fallido` —nunca
 *      se declara entregado— en vez de persistirse tal cual.
 */

import { describe, expect, it, vi } from "vitest"
import {
  ESTADOS_ENTREGA_CORREO,
  ESTADOS_ENVIO_COBRANZA_FI,
  ESTADOS_ENVIO_DOCUMENTO,
  ESTADOS_ENVIO_INVITACION,
  ESTADOS_ENVIO_SMTP,
  EstadoEntregaCorreoSchema,
  type EstadoEntregaCorreo,
} from "@/lib/schemas"
import { ESTADOS_COLA_SALIDA_CO } from "@/lib/co-cola"
import { estadoRegistroSMTP } from "@/lib/smtp"
import {
  estadoDocumentoDesdeEntrega,
  planDeEnvioDocumento,
} from "@/app/api/documentos/_lib/envio-documento"
import * as moduloEnviosDocumento from "@/app/api/documentos/_lib/envio-documento"

/**
 * El planificador se dobla: acá se mide el vocabulario y la traducción, no el
 * diálogo SMTP (eso lo cubren las pruebas de la ruta del aviso).
 */
const { planMock } = vi.hoisted(() => ({ planMock: vi.fn() }))
vi.mock("@/lib/entrega-aviso", () => ({ planDeCanal: planMock }))

/** Los cuatro desenlaces que una entrega puede tener hoy, escritos a mano. */
const CATALOGO_ESCRITO_HOY = ["entregado", "enviado", "pendiente", "fallido"] as const

/** Lo que un emisor real (SMTP) puede producir: sin `entregado`, que es del visor. */
const ENVIO_ESCRITO_HOY = ["enviado", "pendiente", "fallido"] as const

describe("S1 — un vocabulario, una tupla", () => {
  it("el catálogo completo es exactamente lo que una entrega puede ser", () => {
    expect([...ESTADOS_ENTREGA_CORREO]).toEqual([...CATALOGO_ESCRITO_HOY])
  })

  it("lo que un emisor produce es el catálogo sin lo que sólo el visor prueba", () => {
    expect([...ESTADOS_ENVIO_SMTP]).toEqual([...ENVIO_ESCRITO_HOY])
    expect([...ESTADOS_ENVIO_SMTP]).not.toContain("entregado")
  })

  it("invitación, cobranza FI y cola CO no declaran el suyo: son la misma referencia", () => {
    // `toBe` y no `toEqual`: una copia con los mismos valores volvería a divergir
    // en silencio en cuanto alguien edite una de las dos listas.
    expect(ESTADOS_ENVIO_INVITACION).toBe(ESTADOS_ENVIO_SMTP)
    expect(ESTADOS_ENVIO_COBRANZA_FI).toBe(ESTADOS_ENVIO_SMTP)
    expect(ESTADOS_COLA_SALIDA_CO).toBe(ESTADOS_ENVIO_SMTP)
  })

  it("el documento declara su subconjunto: registra `entregado`, nunca `enviado`", () => {
    expect([...ESTADOS_ENVIO_DOCUMENTO]).toEqual(["entregado", "pendiente", "fallido"])
  })

  it("el documento no vuelve a declarar el catálogo: usa el subconjunto de `schemas`", () => {
    // El hueco que una copia con los MISMOS valores dejaría abierto: el `satisfies`
    // del subconjunto la aceptaría. Esto pina que el módulo del documento no lo declare.
    expect(moduloEnviosDocumento).not.toHaveProperty("ESTADOS_ENVIO_DOCUMENTO")
  })

  it("todo valor de un subconjunto pertenece al catálogo", () => {
    const subconjuntos = [
      ESTADOS_ENVIO_SMTP,
      ESTADOS_ENVIO_INVITACION,
      ESTADOS_ENVIO_COBRANZA_FI,
      ESTADOS_COLA_SALIDA_CO,
      ESTADOS_ENVIO_DOCUMENTO,
    ]
    for (const subconjunto of subconjuntos) {
      for (const estado of subconjunto) {
        expect(ESTADOS_ENTREGA_CORREO).toContain(estado)
      }
    }
  })
})

describe("S1 — el validador del catálogo rechaza lo que no está", () => {
  it("acepta los cuatro desenlaces", () => {
    for (const estado of CATALOGO_ESCRITO_HOY) {
      expect(EstadoEntregaCorreoSchema.safeParse(estado).success).toBe(true)
    }
  })

  it("rechaza cualquier otra palabra, incluso en mayúsculas", () => {
    for (const fuera of ["rebotado", "ENVIADO", "Entregado", "", "publicado"]) {
      expect(EstadoEntregaCorreoSchema.safeParse(fuera).success).toBe(false)
    }
  })
})

describe("S1 — el emisor no puede producir un estado que la columna no persiste", () => {
  it("traduce cada desenlace del SMTP a un estado del subconjunto de envío", () => {
    const enviado = estadoRegistroSMTP({ estado: "enviado", messageId: "msg-1" })
    const sinEmisor = estadoRegistroSMTP({ estado: "no_configurado", motivo: "Sin emisor." })
    const fallido = estadoRegistroSMTP({ estado: "fallido", motivo: "Rebotó." })

    expect(enviado).toBe("enviado")
    expect(sinEmisor).toBe("pendiente")
    expect(fallido).toBe("fallido")
    for (const estado of [enviado, sinEmisor, fallido]) {
      expect(ESTADOS_ENVIO_SMTP).toContain(estado)
    }
  })
})

describe("S1 — la traducción al documento es total", () => {
  it("normaliza `enviado` a `entregado` y conserva el resto", () => {
    expect(estadoDocumentoDesdeEntrega("enviado")).toBe("entregado")
    expect(estadoDocumentoDesdeEntrega("entregado")).toBe("entregado")
    expect(estadoDocumentoDesdeEntrega("pendiente")).toBe("pendiente")
    expect(estadoDocumentoDesdeEntrega("fallido")).toBe("fallido")
  })

  it("un desenlace fuera del catálogo no se persiste tal cual: queda `fallido`", () => {
    // El caso del informe: un estado nuevo devuelto por el planificador se
    // escribía sin traducir en `envios_documento`. Nunca se declara entregado.
    expect(estadoDocumentoDesdeEntrega("rebotado" as EstadoEntregaCorreo)).toBe("fallido")
  })

  it("el plan del documento nunca devuelve un estado fuera de su columna", async () => {
    planMock.mockResolvedValue({ canal: "email", estado: "rebotado", motivo: "Rebotó." })

    const plan = await planDeEnvioDocumento("email", {
      comunidadId: "com-1",
      destinatario: "ana@ejemplo.test",
      asunto: "Asunto",
      cuerpo: "Cuerpo",
    })

    expect(ESTADOS_ENVIO_DOCUMENTO).toContain(plan.estado)
    expect(plan.estado).toBe("fallido")
  })
})
