// @vitest-environment jsdom
// Fija el ciclo observable de la caducidad del visor (serie deuda 6, V2): la
// caducidad ya NO pasa por el store legacy — se archiva vía `PUT
// /api/cv/avisos/[id]` con el `update` de `useAvisosCV` — y el ciclo sigue
// siendo 1 pasada al montar + 1 cada 30 s, cortado al desmontar (mismo
// comportamiento que montaba `caducarAvisosCV` a través de un ref).
// Desde F22a el store ya no existe en el navegador: la propiedad "la caducidad
// no toca el store" se verifica sobre el fuente, con el evaluador del candado
// `npm run audit:store`.
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { archivosQueUsanElStore } from "./sin-store"
import type { AvisoCV } from "@/lib/schemas"

const { actualizarAviso, estadoHook } = vi.hoisted(() => ({
  actualizarAviso: vi.fn(async () => ({ ok: true })),
  estadoHook: { items: [] as AvisoCV[] },
}))

vi.mock("@/lib/api/use-cv", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/api/use-cv")>()
  return {
    ...real,
    useAvisosCV: () => ({
      items: estadoHook.items,
      total: estadoHook.items.length,
      isLoading: false,
      error: null,
      create: vi.fn(async () => ({ ok: true })),
      update: actualizarAviso,
      remove: vi.fn(async () => ({ ok: true })),
    }),
  }
})
vi.mock("@/lib/api/use-ra", () => ({
  useReservasRA: () => ({ items: [], isLoading: false }),
  useElementosRA: () => ({ items: [], isLoading: false }),
}))
vi.mock("@/lib/api/use-configuracion", () => ({
  useConfiguracion: () => ({ config: undefined, isLoading: false }),
}))

import VisorMensajesPage from "@/app/visor-mensajes/page"

const HOY = "2026-10-21"
const AYER = "2026-10-20"

function aviso(parcial: Partial<AvisoCV> & Pick<AvisoCV, "id">): AvisoCV {
  return {
    titulo: `Aviso ${parcial.id}`,
    cuerpo: "Cuerpo realista del comunicado de la comunidad.",
    tipologia: "info",
    duracionSegundos: 10,
    pantallaCompleta: false,
    tags: ["comunidad"],
    estado: "publicado",
    requiereVistoBueno: false,
    origen: "manual",
    fechaCreacion: AYER,
    fechaPublicacion: AYER,
    ...parcial,
  }
}

describe("visor-mensajes — caducidad de avisos vía API", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-21T12:00:00Z"))
    actualizarAviso.mockClear()
    estadoHook.items = [
      aviso({ id: "cv-vencido", expiresAt: AYER }),
      aviso({ id: "cv-sin-vencimiento" }),
      aviso({ id: "cv-vencido-archivado", estado: "archivado", expiresAt: AYER, fechaArchivado: AYER }),
      aviso({ id: "cv-vencido-borrador", estado: "borrador", expiresAt: AYER }),
      aviso({ id: "cv-vence-hoy", expiresAt: HOY }),
    ]
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("archiva al montar, cada 30 s, y deja de caducar al desmontar", () => {
    const { unmount } = render(<VisorMensajesPage />)

    // Solo el aviso publicado con `expiresAt` anterior a hoy se archiva por API.
    expect(actualizarAviso).toHaveBeenCalledTimes(1)
    expect(actualizarAviso).toHaveBeenCalledWith("cv-vencido", {
      estado: "archivado",
      fechaArchivado: HOY,
    })

    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(actualizarAviso).toHaveBeenCalledTimes(2)

    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(actualizarAviso).toHaveBeenCalledTimes(3)

    unmount()
    act(() => {
      vi.advanceTimersByTime(120_000)
    })
    expect(actualizarAviso).toHaveBeenCalledTimes(3)
  })

  it("no lee ni escribe el store legacy: los avisos viven solo en el servidor", () => {
    // El store se retiró en F22a, así que no hay estado que inspeccionar: el
    // candado es que el visor no lo nombre en su fuente.
    expect(archivosQueUsanElStore("app/visor-mensajes/page.tsx")).toEqual([])
  })
})
