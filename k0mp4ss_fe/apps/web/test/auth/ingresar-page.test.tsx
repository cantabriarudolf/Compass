import * as React from "react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor, cleanup } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const mockPush = vi.fn()
let mockNextParam: string | null = null

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({
    get: (k: string) => (k === "next" ? mockNextParam : null),
  }),
}))

import PaginaIngresar from "@/app/ingresar/page"

// NOTA: antes estos mocks usaban msw (server de test/setup). En este entorno
// msw no intercepta fetch() con URL relativa dentro de jsdom, el fetch
// rechazaba y todos los casos caían en "Error de conexión". Se finge fetch
// con vi.stubGlobal, patrón que ya usan los demás tests (ej. fi-sync-cliente).
type ManejadorFetch = (url: string) => Promise<Response>
let manejadorFetch: ManejadorFetch = () =>
  Promise.reject(new Error("fetch no mockeado en este test"))

function respJson(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function mockCsrfOk() {
  const previo = manejadorFetch
  manejadorFetch = (url) => {
    if (url === "/api/auth/csrf") return Promise.resolve(respJson({ csrfToken: "csrf-test-token" }))
    return previo(url)
  }
}

function mockCallback(responder: () => Promise<Response>) {
  const previo = manejadorFetch
  manejadorFetch = (url) => {
    if (url === "/api/auth/callback/credentials") return responder()
    return previo(url)
  }
}

function mockCallbackSuccess() {
  mockCallback(() => Promise.resolve(respJson({ url: "http://localhost/admin" })))
}

function mockCallbackError(code: string) {
  mockCallback(() =>
    Promise.resolve(
      respJson({
        url: `http://localhost/api/auth/error?error=CredentialsSignin&code=${code}`,
      })
    )
  )
}

describe("app/ingresar/page.tsx (Auth.js)", () => {
  beforeEach(() => {
    mockPush.mockClear()
    mockNextParam = null
    manejadorFetch = () =>
      Promise.reject(new Error("fetch no mockeado en este test"))
    vi.stubGlobal("fetch", (url: unknown) => manejadorFetch(String(url)))
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("renderiza título, labels y botón", async () => {
    render(<PaginaIngresar />)
    expect(
      screen.getByRole("heading", { name: /iniciar sesión/i })
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/correo electrónico/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /ingresar/i })
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/correo electrónico/i)).toBeRequired()
    expect(screen.getByLabelText(/contraseña/i)).toBeRequired()
  })

  it("login exitoso navega a /admin (sin next)", async () => {
    mockCsrfOk()
    mockCallbackSuccess()
    const user = userEvent.setup()
    render(<PaginaIngresar />)
    await user.type(
      screen.getByLabelText(/correo electrónico/i),
      "admin@test.cl"
    )
    await user.type(screen.getByLabelText(/contraseña/i), "Test1234!")
    await user.click(screen.getByRole("button", { name: /ingresar/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/admin"))
  })

  it("login exitoso respeta ?next= interno", async () => {
    mockNextParam = "/admin/qa-lab"
    mockCsrfOk()
    mockCallbackSuccess()
    const user = userEvent.setup()
    render(<PaginaIngresar />)
    await user.type(
      screen.getByLabelText(/correo electrónico/i),
      "admin@test.cl"
    )
    await user.type(screen.getByLabelText(/contraseña/i), "Test1234!")
    await user.click(screen.getByRole("button", { name: /ingresar/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/admin/qa-lab"))
  })

  it("login exitoso ignora ?next= externo y va a /admin", async () => {
    mockNextParam = "https://evil.com/phish"
    mockCsrfOk()
    mockCallbackSuccess()
    const user = userEvent.setup()
    render(<PaginaIngresar />)
    await user.type(
      screen.getByLabelText(/correo electrónico/i),
      "admin@test.cl"
    )
    await user.type(screen.getByLabelText(/contraseña/i), "Test1234!")
    await user.click(screen.getByRole("button", { name: /ingresar/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/admin"))
  })

  it("login exitoso respeta ?next= con query", async () => {
    mockNextParam = "/admin/configuracion?tab=maestros"
    mockCsrfOk()
    mockCallbackSuccess()
    const user = userEvent.setup()
    render(<PaginaIngresar />)
    await user.type(screen.getByLabelText(/correo electrónico/i), "a@b.cl")
    await user.type(screen.getByLabelText(/contraseña/i), "x")
    await user.click(screen.getByRole("button", { name: /ingresar/i }))
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith("/admin/configuracion?tab=maestros")
    )
  })

  it("login fallido credenciales muestra role=alert y no navega", async () => {
    mockCsrfOk()
    mockCallbackError("credentials")
    const user = userEvent.setup()
    render(<PaginaIngresar />)
    await user.type(
      screen.getByLabelText(/correo electrónico/i),
      "admin@test.cl"
    )
    await user.type(screen.getByLabelText(/contraseña/i), "wrong")
    await user.click(screen.getByRole("button", { name: /ingresar/i }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Credenciales inválidas"
    )
    expect(mockPush).not.toHaveBeenCalled()
  })

  it("login fallido rate_limited muestra mensaje de rate limit", async () => {
    mockCsrfOk()
    mockCallbackError("rate_limited")
    const user = userEvent.setup()
    render(<PaginaIngresar />)
    await user.type(
      screen.getByLabelText(/correo electrónico/i),
      "admin@test.cl"
    )
    await user.type(screen.getByLabelText(/contraseña/i), "any")
    await user.click(screen.getByRole("button", { name: /ingresar/i }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Demasiados intentos/i
    )
  })

  it("error de conexión muestra mensaje genérico", async () => {
    mockCsrfOk()
    mockCallback(() => Promise.reject(new TypeError("Failed to fetch")))
    const user = userEvent.setup()
    render(<PaginaIngresar />)
    await user.type(screen.getByLabelText(/correo electrónico/i), "a@b.cl")
    await user.type(screen.getByLabelText(/contraseña/i), "x")
    await user.click(screen.getByRole("button", { name: /ingresar/i }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Error de conexión/i
    )
  })

  it("deshabilita botón mientras carga y lo rehabilita tras error", async () => {
    mockCsrfOk()
    let resolve!: (v: unknown) => void
    const pending = new Promise((res) => (resolve = res))
    mockCallback(async () => {
      await pending
      return respJson({
        url: "http://localhost/api/auth/error?error=CredentialsSignin&code=credentials",
      })
    })
    const user = userEvent.setup()
    render(<PaginaIngresar />)
    await user.type(screen.getByLabelText(/correo electrónico/i), "a@b.cl")
    await user.type(screen.getByLabelText(/contraseña/i), "x")
    const btn = screen.getByRole("button", { name: /ingresar/i })
    await user.click(btn)
    expect(btn).toBeDisabled()
    expect(btn).toHaveTextContent(/ingresando/i)
    resolve(null)
    expect(await screen.findByRole("alert")).toBeInTheDocument()
    await waitFor(() => expect(btn).not.toBeDisabled())
    expect(btn).toHaveTextContent(/ingresar/i)
  })

  it("limpia error previo al reintentar", async () => {
    mockCsrfOk()
    mockCallbackError("credentials")
    const user = userEvent.setup()
    render(<PaginaIngresar />)
    await user.type(screen.getByLabelText(/correo electrónico/i), "a@b.cl")
    await user.type(screen.getByLabelText(/contraseña/i), "wrong")
    await user.click(screen.getByRole("button", { name: /ingresar/i }))
    expect(await screen.findByRole("alert")).toBeInTheDocument()

    mockCallbackSuccess()
    await user.click(screen.getByRole("button", { name: /ingresar/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalled())
    await waitFor(() => expect(mockPush).toHaveBeenCalled())
  })

  it("maneja respuesta sin JSON (fallback mensaje)", async () => {
    mockCsrfOk()
    mockCallback(
      () => Promise.resolve(new Response("Server error", { status: 500 }))
    )
    const user = userEvent.setup()
    render(<PaginaIngresar />)
    await user.type(screen.getByLabelText(/correo electrónico/i), "a@b.cl")
    await user.type(screen.getByLabelText(/contraseña/i), "x")
    await user.click(screen.getByRole("button", { name: /ingresar/i }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /No fue posible iniciar sesión/i
    )
  })
})
