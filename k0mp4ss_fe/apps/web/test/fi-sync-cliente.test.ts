/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

const state = vi.hoisted(() => ({ respuetas: [] as { status: number; body: unknown }[] }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers({ "x-forwarded-proto": "http" })),
}))

async function importarStore() {
  const { useCompassStore } = await import("@/lib/store")
  return useCompassStore
}

describe("FI sync cliente — delta + debounce + 401 (fi-sync-bd)", () => {
  let useCompassStore: Awaited<ReturnType<typeof importarStore>>

  beforeEach(async () => {
    vi.useFakeTimers()
    const mod = await import("@/lib/fi-sync")
    mod.__resetFISyncForTest()
    useCompassStore = await importarStore()
    // Aislar del seed (punto cero): colecciones FI vacías antes de iniciarSyncFI
    useCompassStore.setState({ fondosFI: [], egresosFI: [], ingresosFI: [] } as never)
    state.respuetas = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { body?: string }) => {
        const resp = state.respuetas.shift() ?? { status: 200, body: { ok: true, idsPersistidos: [] } }
        if (init?.body) {
          // registrar ids recibidos para aserciones
          const body = JSON.parse(init.body) as { fondos?: unknown[]; egresos?: unknown[]; ingresos?: unknown[] }
          const total = (body.fondos?.length ?? 0) + (body.egresos?.length ?? 0) + (body.ingresos?.length ?? 0)
          ;(resp as { recibidos?: number }).recibidos = total
        }
        return new Response(JSON.stringify(resp.body), { status: resp.status, headers: { "content-type": "application/json" } })
      }),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function fondo(id: string) {
    return { id, nombre: `Fondo TEST ${id}`, tipo: "operacional", activo: true, saldoInicial: 1000 }
  }
  function egreso(id: string) {
    return { id, folio: `FE-${id}`, fecha: "2024-01-01", categoria: "otro", descripcion: `Egreso TEST ${id}`, monto: 500, fondoId: "fondo-x", esRecurrente: false }
  }
  function ingreso(id: string) {
    return { id, fecha: "2024-01-02", monto: 700, concepto: `Ingreso TEST ${id}`, fondoId: "fondo-x" }
  }

  it("delta acumula las 3 colecciones y flush marca enviados tras respuesta ok", async () => {
    const { iniciarSyncFI, __internals } = await import("@/lib/fi-sync")
    const off = iniciarSyncFI()
    const idsRespuesta = ["fondo-1", "fe-1", "fi-1"]
    state.respuetas.push({ status: 200, body: { ok: true, recibidos: 3, persistidos: 3, idsPersistidos: idsRespuesta } })

    useCompassStore.setState({
      fondosFI: [fondo("fondo-1")],
      egresosFI: [egreso("fe-1")],
      ingresosFI: [ingreso("fi-1")],
    } as never)

    expect(__internals.deltaActual.length).toBe(3)
    await vi.advanceTimersByTimeAsync(2100)

    const fetchMock = vi.mocked(fetch)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(__internals.enviados.size).toBe(3)
    // delta vacío tras flush
    expect(__internals.deltaActual.length).toBe(0)
    if (typeof off === "function") off()
  })

  it("debounce: varios cambios en <2s disparan un solo POST con delta completo", async () => {
    const { iniciarSyncFI, __internals } = await import("@/lib/fi-sync")
    const off = iniciarSyncFI()
    state.respuetas.push({ status: 200, body: { ok: true, recibidos: 4, persistidos: 4, idsPersistidos: [] } })

    useCompassStore.setState({ egresosFI: [egreso("fe-a")] } as never)
    await vi.advanceTimersByTimeAsync(500)
    useCompassStore.setState({ ingresosFI: [ingreso("fi-a")] } as never)
    await vi.advanceTimersByTimeAsync(500)
    useCompassStore.setState({ fondosFI: [fondo("fondo-a")], egresosFI: [egreso("fe-a"), egreso("fe-b")] } as never)

    expect(__internals.deltaActual.length).toBe(4) // 1 fondo + 2 egresos + 1 ingreso
    await vi.advanceTimersByTimeAsync(2100)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
    if (typeof off === "function") off()
  })

  it("401 marca fallidos sin reintento en loop (los ids no vuelven al delta)", async () => {
    const { iniciarSyncFI, __internals } = await import("@/lib/fi-sync")
    const off = iniciarSyncFI()
    state.respuetas.push({ status: 401, body: { error: "No autenticado." } })

    useCompassStore.setState({ ingresosFI: [ingreso("fi-401")] } as never)
    await vi.advanceTimersByTimeAsync(2100)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
    expect(__internals.fallidos401.has("fi-401")).toBe(true)
    expect(__internals.enviados.size).toBe(0)

    // Otro cambio en la misma colección: fi-401 NO vuelve al delta
    useCompassStore.setState({ ingresosFI: [ingreso("fi-401"), ingreso("fi-nuevo")] } as never)
    await vi.advanceTimersByTimeAsync(2100)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
    const body = JSON.parse(vi.mocked(fetch).mock.calls[1]![1]!.body as string) as { ingresos: { id: string }[] }
    expect(body.ingresos.some((i) => i.id === "fi-401")).toBe(false)
    expect(body.ingresos.some((i) => i.id === "fi-nuevo")).toBe(true)
    if (typeof off === "function") off()
  })

  it("edición de elemento ya enviado vuelve al delta (fingerprint distinto)", async () => {
    const { iniciarSyncFI, __internals } = await import("@/lib/fi-sync")
    const off = iniciarSyncFI()
    state.respuetas.push({ status: 200, body: { ok: true, recibidos: 1, persistidos: 1, idsPersistidos: ["fondo-e"] } })

    useCompassStore.setState({ fondosFI: [fondo("fondo-e")] } as never)
    await vi.advanceTimersByTimeAsync(2100)
    expect(__internals.enviados.size).toBe(1)
    expect(__internals.deltaActual.length).toBe(0)

    // Editar saldoInicial del fondo → nueva fingerprint → delta 1
    state.respuetas.push({ status: 200, body: { ok: true, recibidos: 1, persistidos: 1, idsPersistidos: ["fondo-e"] } })
    useCompassStore.setState({ fondosFI: [{ ...fondo("fondo-e"), saldoInicial: 9999 }] } as never)
    await vi.advanceTimersByTimeAsync(2100)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
    expect(__internals.enviados.get("fondo-e")).not.toBeUndefined()
    if (typeof off === "function") off()
  })

  it("error transitorio (500) no marca enviados: delta persiste para reintento", async () => {
    const { iniciarSyncFI, __internals } = await import("@/lib/fi-sync")
    const off = iniciarSyncFI()
    state.respuetas.push({ status: 500, body: { error: "boom" } })

    useCompassStore.setState({ ingresosFI: [ingreso("fi-500")] } as never)
    await vi.advanceTimersByTimeAsync(2100)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
    expect(__internals.enviados.size).toBe(0)
    expect(__internals.deltaActual.length).toBe(1)
    expect(__internals.fallidos401.size).toBe(0)
    if (typeof off === "function") off()
  })
})
