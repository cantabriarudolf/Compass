import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore, seedData, rehydrateStore, waitForStoreHydration } from "@/lib/store"

// Regresión del rojo e2e `poblado-idempotente`: limpiar()/runFase()/validar()
// abortaban si el click llegaba antes de que zustand-persist terminara de
// hidratar. El helper espera acotado en vez de abortar.
describe("waitForStoreHydration", () => {
  beforeEach(() => {
    window.localStorage.clear()
    // Reset a estado inicial sin hidratar (mismo patrón de use-store-rehydrated.test).
    useCompassStore.setState({ ...seedData(), hasHydrated: false })
  })

  it("resuelve true de inmediato si el store ya está hidratado", async () => {
    useCompassStore.setState({ hasHydrated: true })
    await expect(waitForStoreHydration(50)).resolves.toBe(true)
  })

  it("resuelve true cuando la hidratación termina después de suscribirse", async () => {
    const espera = waitForStoreHydration(2_000)
    rehydrateStore()
    await expect(espera).resolves.toBe(true)
    expect(useCompassStore.getState().hasHydrated).toBe(true)
  })

  it("resuelve false si el timeout vence sin hidratar", async () => {
    await expect(waitForStoreHydration(30)).resolves.toBe(false)
  })
})
