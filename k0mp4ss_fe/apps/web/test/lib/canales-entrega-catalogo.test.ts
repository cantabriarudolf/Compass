/** @vitest-environment node */
/**
 * R13 · canales de entrega: un vocabulario, cuatro nombres.
 *
 * La auditoría `odd/auditorias/catalogos-y-estados.md` (hallazgo 13) encontró
 * `visor · email` declarado cuatro veces: `CANALES_ENTREGA_AVISO` y
 * `CANALES_COBRANZA_FI` en `lib/schemas.ts`, `CANALES_ENVIO_DOCUMENTO` en
 * `app/api/documentos/_lib/envio-documento.ts` y `CANALES_ENVIO_RE` otra vez en
 * schemas. Los tipos eran compatibles por VALOR, no por tipo: agregar `sms` a
 * `CANALES_ENVIO_DOCUMENTO` hacía que `planDeCanal` recibiera un canal que no
 * conoce y cayera en la rama del correo (sólo corta en `visor`), así que el
 * documento se «entregaba» por SMS mandando un mail y quedaba registrado con canal
 * `sms`.
 *
 * Ahora `CANALES_ENTREGA_CORREO` es la definición y los cuatro nombres son la
 * MISMA referencia.
 */

import { describe, expect, it } from "vitest"
import {
  CANALES_COBRANZA_FI,
  CANALES_ENTREGA_AVISO,
  CANALES_ENTREGA_CORREO,
  CANALES_ENVIO_RE,
  CanalEntregaCorreoSchema,
} from "@/lib/schemas"
import { CANALES_ENVIO_DOCUMENTO } from "@/app/api/documentos/_lib/envio-documento"

describe("R13 — canales de entrega", () => {
  it("el catálogo es exactamente el visor y el correo", () => {
    expect([...CANALES_ENTREGA_CORREO]).toEqual(["visor", "email"])
  })

  it("los cuatro nombres son la misma referencia, no copias", () => {
    // `toBe`: una copia con los mismos valores vuelve a divergir en silencio, y el
    // tipo deja de proteger el paso de un canal de una entidad a otra.
    expect(CANALES_ENTREGA_AVISO).toBe(CANALES_ENTREGA_CORREO)
    expect(CANALES_COBRANZA_FI).toBe(CANALES_ENTREGA_CORREO)
    expect(CANALES_ENVIO_RE).toBe(CANALES_ENTREGA_CORREO)
    expect(CANALES_ENVIO_DOCUMENTO).toBe(CANALES_ENTREGA_CORREO)
  })

  it("el validador acepta los dos canales y rechaza cualquier otro", () => {
    for (const canal of CANALES_ENTREGA_CORREO) {
      expect(CanalEntregaCorreoSchema.safeParse(canal).success).toBe(true)
    }
    // `sms` es el caso del informe: mientras no exista el canal, no se puede
    // entregar por ahí ni registrar una entrega con ese nombre.
    for (const fuera of ["sms", "Visor", "whatsapp", ""]) {
      expect(CanalEntregaCorreoSchema.safeParse(fuera).success).toBe(false)
    }
  })
})
