/** @vitest-environment node */
/**
 * R15 · el canal de una notificación in-app tiene nombre en el código.
 *
 * La auditoría `odd/auditorias/catalogos-y-estados.md` (hallazgo 15) encontró el
 * valor `email_simulado` escrito como literal en ocho escritores, más un
 * `z.literal` en el contrato y un `@default` en Prisma. El valor no tenía nombre:
 * para agregar un canal real había que tocar ocho archivos y el `z.literal`, y el
 * que se olvidaba seguía escribiendo `email_simulado`. Peor: el `@default` de
 * Prisma hace que un `create` sin `canal` **parezca correcto**.
 *
 * Ahora el valor vive en una constante y el schema se deriva de ella, así que el
 * compilador señala a cada escritor que use el literal suelto.
 */

import { describe, expect, it } from "vitest"
import { CANAL_NOTIFICACION_EMAIL_SIMULADO, NotificacionSchema } from "@/lib/schemas"

describe("R15 — canal de notificación", () => {
  it("el canal simulado tiene nombre y es el que la base ya tiene", () => {
    expect(CANAL_NOTIFICACION_EMAIL_SIMULADO).toBe("email_simulado")
  })

  it("el contrato acepta ese canal y rechaza cualquier otro", () => {
    const canal = NotificacionSchema.shape.canal
    expect(canal.safeParse(CANAL_NOTIFICACION_EMAIL_SIMULADO).success).toBe(true)
    // Un canal real todavía no existe: hasta que se declare, no se puede escribir.
    for (const fuera of ["email", "sms", "Email_Simulado", ""]) {
      expect(canal.safeParse(fuera).success).toBe(false)
    }
  })
})
