/**
 * @vitest-environment node
 *
 * `registrarLimiteVolumen` — el dedup del evento del techo de volumen.
 *
 * El evento `RP_VOLUME_LIMITED` es por EVENTO del limitador (uno por ventana de
 * 60 s por usuario), no por respuesta. La revisión nativa de `91df430` encontró
 * que la poda oportunista heredada del contador —`clear()` del Map entero
 * arriba de mil entradas— borraba las ventanas VIGENTES de todos los demás:
 * pasados mil usuarios distintos dentro de la ventana, un usuario que ya había
 * emitido volvía a emitir, o sea justo la inundación de log que el dedup existe
 * para frenar. Este caso pinea la propiedad que el `clear()` rompía.
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import { logger } from "@/lib/logger"
import { registrarLimiteVolumen } from "@/app/api/co/_lib/denegacion"

describe("registrarLimiteVolumen — la poda no borra ventanas vigentes", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("mil quinientos usuarios distintos en la misma ventana no reabren el dedup del primero", () => {
    // Se silencia la salida del logger: el espía cuenta las emisiones.
    const espia = vi.spyOn(logger, "warn").mockImplementation(() => {})
    const t = 1_760_000_000_000

    // El primero emite; el segundo aviso del MISMO usuario, dentro de la
    // ventana, tiene que quedar deduplicado sin importar cuántos otros usuarios
    // empujen el Map por encima del tope de poda.
    registrarLimiteVolumen("usuario-0", t)
    for (let n = 1; n <= 1500; n++) registrarLimiteVolumen(`usuario-${n}`, t)

    registrarLimiteVolumen("usuario-0", t + 1_000)

    const emisionesDelPrimero = (espia.mock.calls as unknown as [Record<string, unknown>][]).filter(
      ([cuerpo]) => cuerpo?.usuarioId === "usuario-0"
    )
    expect(emisionesDelPrimero).toHaveLength(1)
    expect(emisionesDelPrimero[0]?.[0]).toMatchObject({ event: "RP_VOLUME_LIMITED" })
  })
})

describe("registrarLimiteVolumen de lib/aviso-volumen — el helper neutro para las rutas con techo (T21)", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** Emisiones del espía, ya filtradas por el campo `event`. */
  function emisionesDe(espia: ReturnType<typeof vi.spyOn>, event: string) {
    return (espia.mock.calls as unknown as [Record<string, unknown>][]).filter(
      ([cuerpo]) => cuerpo?.event === event
    )
  }

  it("dos avisos del mismo usuario dentro de la ventana emiten UN RP_VOLUME_LIMITED", async () => {
    // El helper neutro vive al lado de `lib/rate-limit-volumen.ts` porque una
    // ruta de CT no importa un helper de CO; el invariante de dedup es el
    // mismo del evento de CO: por EVENTO del limitador, no por respuesta.
    const { registrarLimiteVolumen: registrarNeutro } = await import("@/lib/aviso-volumen")
    const espia = vi.spyOn(logger, "warn").mockImplementation(() => {})
    const t = 1_760_100_000_000

    registrarNeutro("usuario-neutro", t)
    registrarNeutro("usuario-neutro", t + 1_000)

    const emisiones = emisionesDe(espia, "RP_VOLUME_LIMITED")
    expect(emisiones).toHaveLength(1)
    expect(emisiones[0]?.[0]).toMatchObject({ event: "RP_VOLUME_LIMITED", usuarioId: "usuario-neutro" })
  })

  it("mil quinientos usuarios distintos no reabren el dedup del primero (misma poda que la copia de CO)", async () => {
    const { registrarLimiteVolumen: registrarNeutro } = await import("@/lib/aviso-volumen")
    const espia = vi.spyOn(logger, "warn").mockImplementation(() => {})
    const t = 1_760_200_000_000

    registrarNeutro("usuario-neutro-0", t)
    for (let n = 1; n <= 1500; n++) registrarNeutro(`usuario-neutro-${n}`, t)
    registrarNeutro("usuario-neutro-0", t + 1_000)

    const delPrimero = (espia.mock.calls as unknown as [Record<string, unknown>][]).filter(
      ([cuerpo]) => cuerpo?.usuarioId === "usuario-neutro-0"
    )
    expect(delPrimero).toHaveLength(1)
    expect(delPrimero[0]?.[0]).toMatchObject({ event: "RP_VOLUME_LIMITED" })
  })
})
