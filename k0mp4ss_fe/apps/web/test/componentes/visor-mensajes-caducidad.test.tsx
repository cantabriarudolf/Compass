// @vitest-environment jsdom
// Fija el ciclo observable de la caducidad del visor (warnings-cero, E1): la
// acción del store se llama 1 vez al montar y luego cada 30 s, y el ciclo se
// corta al desmontar. Es la demostración de que pasar `caducarAvisosCV` a un
// `ref` (en vez de a un `eslint-disable`) no cambia el comportamiento.
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { resetStore } from "../helpers"
import { useCompassStore } from "@/lib/store"

vi.mock("@/lib/api/use-cv", () => ({
  useAvisosCV: () => ({ items: [], isLoading: false }),
}))
vi.mock("@/lib/api/use-ra", () => ({
  useReservasRA: () => ({ items: [], isLoading: false }),
  useElementosRA: () => ({ items: [], isLoading: false }),
}))
vi.mock("@/lib/api/use-configuracion", () => ({
  useConfiguracion: () => ({ config: undefined, isLoading: false }),
}))

import VisorMensajesPage from "@/app/visor-mensajes/page"

describe("visor-mensajes — caducidad de avisos", () => {
  beforeEach(() => {
    resetStore()
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("caduca al montar, cada 30 s, y deja de caducar al desmontar", () => {
    const espia = vi.spyOn(useCompassStore.getState(), "caducarAvisosCV")

    const { unmount } = render(<VisorMensajesPage />)
    expect(espia).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(espia).toHaveBeenCalledTimes(2)

    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(espia).toHaveBeenCalledTimes(3)

    unmount()
    act(() => {
      vi.advanceTimersByTime(120_000)
    })
    expect(espia).toHaveBeenCalledTimes(3)
  })
})
