// @vitest-environment jsdom
import React from "react"
import { renderToString } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"

/**
 * Fijación del hook `useIsMobile` (ventana F2 de SERIE-DEUDA-4).
 *
 * El hook se reescribió con `useSyncExternalStore` para eliminar el warning
 * `react-hooks/set-state-in-effect` (el `useState` + `useEffect` original hacía `setState`
 * sincrónico dentro del efecto). Este test fija el comportamiento observable que **no** debe
 * cambiar:
 *   1. valor inicial según el viewport (mobile → `true`, desktop → `false`);
 *   2. reacción al evento `change` del media query (sin recargar);
 *   3. cleanup: al desmontar se quita el listener del media query;
 *   4. snapshot de servidor `false`, que es el valor inicial histórico del hook
 *      (`useState(undefined)` → `!!undefined === false`) y por lo tanto el HTML de SSR.
 */

const BREAKPOINT = 768

type Listener = (evento: MediaQueryListEvent) => void

/** `window.matchMedia` de jsdom no existe: se instala uno controlable, con sus listeners. */
function instalarMatchMedia() {
  const listeners = new Set<Listener>()
  const mql = {
    media: `(max-width: ${BREAKPOINT - 1}px)`,
    matches: window.innerWidth < BREAKPOINT,
    addEventListener: (_tipo: string, cb: Listener) => listeners.add(cb),
    removeEventListener: (_tipo: string, cb: Listener) => listeners.delete(cb),
  }
  const matchMedia = vi.fn(() => mql as unknown as MediaQueryList)
  vi.stubGlobal("matchMedia", matchMedia)
  return { listeners, mql, matchMedia }
}

function cambiarViewport(ancho: number, mql: { matches: boolean }, listeners: Set<Listener>) {
  window.innerWidth = ancho
  mql.matches = ancho < BREAKPOINT
  for (const cb of listeners) cb({ matches: mql.matches } as MediaQueryListEvent)
}

describe("useIsMobile", () => {
  const anchoOriginal = window.innerWidth

  beforeEach(() => {
    window.innerWidth = anchoOriginal
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    window.innerWidth = anchoOriginal
  })

  it("valor inicial: true en viewport mobile", () => {
    window.innerWidth = 375
    instalarMatchMedia()
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
  })

  it("valor inicial: false en viewport desktop", () => {
    window.innerWidth = 1280
    instalarMatchMedia()
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
  })

  it("reacciona al cambio de viewport en ambos sentidos", () => {
    window.innerWidth = 1280
    const { listeners, mql } = instalarMatchMedia()
    const { result } = renderHook(() => useIsMobile())

    expect(result.current).toBe(false)

    act(() => cambiarViewport(500, mql, listeners))
    expect(result.current).toBe(true)

    act(() => cambiarViewport(1024, mql, listeners))
    expect(result.current).toBe(false)
  })

  it("cleanup: al desmontar quita el listener del media query", () => {
    window.innerWidth = 1280
    const { listeners, matchMedia } = instalarMatchMedia()
    const { unmount } = renderHook(() => useIsMobile())

    expect(matchMedia).toHaveBeenCalledWith(`(max-width: ${BREAKPOINT - 1}px)`)
    expect(listeners.size).toBe(1)

    unmount()
    expect(listeners.size).toBe(0)
  })

  it("snapshot de servidor: false durante SSR (mismo valor inicial histórico)", () => {
    window.innerWidth = 375
    instalarMatchMedia()

    function Indicador() {
      return <span>{useIsMobile() ? "mobile" : "desktop"}</span>
    }

    expect(renderToString(<Indicador />)).toContain("desktop")
  })
})
