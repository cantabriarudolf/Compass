import * as React from "react"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, waitFor, cleanup } from "@testing-library/react"
import { useCompassStore, useStoreRehydrated, seedData, STORE_VERSION } from "@/lib/store"

function Probe() {
  useStoreRehydrated()
  const hasHydrated = useCompassStore((s) => s.hasHydrated)
  const tipos = useCompassStore((s) => s.tiposUnidad)
  return (
    <div>
      <span data-testid="hydrated">{String(hasHydrated)}</span>
      <span data-testid="count">{tipos.length}</span>
    </div>
  )
}

function HookOnlyProbe() {
  useStoreRehydrated()
  const hasHydrated = useCompassStore((s) => s.hasHydrated)
  return <span data-testid="hydrated">{String(hasHydrated)}</span>
}

describe("useStoreRehydrated", () => {
  beforeEach(() => {
    window.localStorage.clear()
    // reset a estado inicial sin hidratar
    useCompassStore.setState({ ...seedData(), hasHydrated: false })
    vi.restoreAllMocks()
  })
  afterEach(cleanup as unknown as () => void)

  it("marca hasHydrated true tras montar sin persistido previo", async () => {
    const { getByTestId } = render(<Probe />)
    // inicialmente false (antes de efecto)
    // tras effect + rehydrate debe ser true
    await waitFor(() => expect(getByTestId("hydrated").textContent).toBe("true"))
    expect(getByTestId("count").textContent).not.toBe("0")
  })

  it("rehidrata desde localStorage y expone datos persistidos", async () => {
    const seed = seedData()
    const personaPersistida = { ...seed.personas[0]!, id: "p-persistida-test", nombres: "Persistida", apellidos: "Test" }
    window.localStorage.setItem(
      "compass-store",
      JSON.stringify({
        state: { ...seed, personas: [personaPersistida], eventos: [] },
        version: STORE_VERSION,
      })
    )

    const { getByTestId } = render(<Probe />)
    await waitFor(() => expect(getByTestId("hydrated").textContent).toBe("true"))
    // verificar que el store contiene la persona persistida
    const state = useCompassStore.getState()
    expect(state.personas.some((p) => p.id === "p-persistida-test")).toBe(true)
  })

  it("usa persist.rehydrate y no bloquea save* después de hidratar", async () => {
    const spy = vi.spyOn(useCompassStore.persist, "rehydrate")
    const { getByTestId } = render(<HookOnlyProbe />)
    await waitFor(() => expect(getByTestId("hydrated").textContent).toBe("true"))
    expect(spy).toHaveBeenCalled()
    // ahora save* debe permitir
    useCompassStore.setState({ hasHydrated: true })
    const r = useCompassStore.getState().saveTipoUnidad({
      id: "test-tipo-rehydrated",
      nombre: "Tipo Rehydrated",
      categoria: "Departamento",
      activo: true,
    } as never)
    // puede fallar por validación pero no por hidratación
    expect(r.error).not.toMatch(/hidratando/i)
  })

  it("renderiza skeleton si hasHydrated false (patrón de páginas)", async () => {
    // simular página que muestra skeleton mientras no hidrata
    function PageWithGate() {
      useStoreRehydrated()
      const hasHydrated = useCompassStore((s) => s.hasHydrated)
      if (!hasHydrated) return <div data-testid="skeleton">cargando…</div>
      return <div data-testid="content">listo</div>
    }
    const { getByTestId, queryByTestId } = render(<PageWithGate />)
    // al inicio puede mostrar skeleton breve hasta que effect corra
    // tras hidratar debe mostrar content
    await waitFor(() => expect(getByTestId("content")).toBeInTheDocument())
    expect(queryByTestId("skeleton")).not.toBeInTheDocument()
  })

  it("llama rehydrateStore una sola vez por montaje", async () => {
    const spy = vi.spyOn(useCompassStore.persist, "rehydrate")
    const { unmount } = render(<HookOnlyProbe />)
    await waitFor(() => expect(useCompassStore.getState().hasHydrated).toBe(true))
    expect(spy).toHaveBeenCalledTimes(1)
    unmount()
    // remontar debe llamar de nuevo (1 más) pero no en exceso
    render(<HookOnlyProbe />)
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2))
  })
})
