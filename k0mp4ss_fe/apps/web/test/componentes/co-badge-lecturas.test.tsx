// @vitest-environment jsdom
/**
 * S9 — el badge «X/Y leídos» del administrador mide LECTURAS REALES (change
 * co-lectura-residente, tarea 1.8).
 *
 * El defecto que este test impide reintroducir: el badge contaba el arreglo
 * `lecturas` del JSON del envío, que es un dato derivado y puede quedar viejo
 * (D3). La fuente es `totalLecturas` / `totalDestinatarios`, que el servidor
 * calcula sobre `EnvioDestinatarioCO`. Cuando la respuesta no los trae, no se
 * rellena con el arreglo: se declara que faltan.
 */
import { describe, expect, it } from "vitest"
import { totalesDeEnvio } from "@/components/co/totales-envio"
import type { EnvioCO } from "@/lib/schemas"

function envio(extra: Record<string, unknown> = {}): EnvioCO {
  return {
    id: "env-1",
    asunto: "Corte de agua",
    cuerpo: "Detalle",
    destinatarios: [{ personaId: "p-1" }, { personaId: "p-2" }],
    fechaEnvio: "2026-10-20",
    lecturas: [],
    ...extra,
  } as EnvioCO
}

describe("totalesDeEnvio — la métrica sale de la tabla, no del JSON", () => {
  it("usa los totales del servidor y no el arreglo lecturas", () => {
    // JSON viejo/vacío con 3 lecturas reales en la tabla: el badge dice 3/5.
    const totales = totalesDeEnvio(
      envio({ lecturas: [], totalLecturas: 3, totalDestinatarios: 5 })
    )
    expect(totales).toEqual({ leidos: 3, total: 5 })
  })

  it("no inventa totales cuando la respuesta no los trae", () => {
    expect(totalesDeEnvio(envio({ lecturas: ["p-1"] }))).toBeNull()
  })

  it("acepta 0 leídos como un valor real, no como ausencia", () => {
    expect(totalesDeEnvio(envio({ totalLecturas: 0, totalDestinatarios: 2 }))).toEqual({
      leidos: 0,
      total: 2,
    })
  })
})
