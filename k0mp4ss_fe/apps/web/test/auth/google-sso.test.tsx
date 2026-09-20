// @vitest-environment jsdom
import * as React from "react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"

const mockPush = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: () => null }),
}))

vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
}))

import PaginaIngresar from "@/app/ingresar/page"

describe("Google SSO — UI en /ingresar", () => {
  beforeEach(() => {
    mockPush.mockClear()
    vi.stubGlobal(
      "fetch",
      () => Promise.resolve(new Response(JSON.stringify({ csrfToken: "test" }), { status: 200 }))
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("renderiza botón 'Continuar con Google' junto al form de credentials", async () => {
    render(<PaginaIngresar />)
    expect(await screen.findByRole("button", { name: /Ingresar/i })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Continuar con Google/i })).toBeTruthy()
  })

  it("muestra separador 'O' entre form y botón Google", async () => {
    render(<PaginaIngresar />)
    await screen.findByRole("button", { name: /Ingresar/i })
    expect(screen.getByText("O")).toBeTruthy()
  })
})
