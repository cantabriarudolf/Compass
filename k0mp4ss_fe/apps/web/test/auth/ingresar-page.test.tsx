import * as React from "react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor, cleanup } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { server } from "../setup"

const mockPush = vi.fn()
let mockNextParam: string | null = null

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: (k: string) => (k === "next" ? mockNextParam : null) }),
}))

import PaginaIngresar from "@/app/ingresar/page"

function mockCsrf(ok = true) {
  server.use(
    http.get("/api/auth/csrf", () =>
      ok
        ? HttpResponse.json({ csrfToken: "csrf-test-token" })
        : new HttpResponse("error", { status: 500 })
    )
  )
}

function mockCallbackSuccess() {
  server.use(
    http.post("/api/auth/callback/credentials", () =>
      HttpResponse.json({ url: "http://localhost/admin" }, { status: 200 })
    )
  )
}

function mockCallbackError(code: string) {
  server.use(
    http.post("/api/auth/callback/credentials", () =>
      HttpResponse.json(
        { url: `http://localhost/api/auth/error?error=CredentialsSignin&code=${code}` },
        { status: 200 }
      )
    )
  )
}

describe("app/ingresar/page.tsx (Auth.js)", () => {
  beforeEach(() => {
    mockPush.mockClear()
    mockNextParam = null
    server.resetHandlers()
  })
  afterEach(cleanup)

  it("renderiza título, labels y botón", async () => {
    render(<PaginaIngresar />)
    expect(screen.getByRole("heading", { name: /iniciar sesión/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/correo electrónico/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /ingresar/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/correo electrónico/i)).toBeRequired()
    expect(screen.getByLabelText(/contraseña/i)).toBeRequired()
  })

  it("login exitoso navega a /admin (sin next)", async () => {
    mockCsrf()
    mockCallbackSuccess()
    const user = userEvent.setup()
    render(<PaginaIngresar />)
    await user.type(screen.getByLabelText(/correo electrónico/i), "admin@test.cl")
    await user.type(screen.getByLabelText(/contraseña/i), "Test1234!")
    await user.click(screen.getByRole("button", { name: /ingresar/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/admin"))
  })

  it("login exitoso respeta ?next= interno", async () => {
    mockNextParam = "/admin/qa-lab"
    mockCsrf()
    mockCallbackSuccess()
    const user = userEvent.setup()
    render(<PaginaIngresar />)
    await user.type(screen.getByLabelText(/correo electrónico/i), "admin@test.cl")
    await user.type(screen.getByLabelText(/contraseña/i), "Test1234!")
    await user.click(screen.getByRole("button", { name: /ingresar/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/admin/qa-lab"))
  })

  it("login exitoso ignora ?next= externo y va a /admin", async () => {
    mockNextParam = "https://evil.com/phish"
    mockCsrf()
    mockCallbackSuccess()
    const user = userEvent.setup()
    render(<PaginaIngresar />)
    await user.type(screen.getByLabelText(/correo electrónico/i), "admin@test.cl")
    await user.type(screen.getByLabelText(/contraseña/i), "Test1234!")
    await user.click(screen.getByRole("button", { name: /ingresar/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/admin"))
  })

  it("login exitoso respeta ?next= con query", async () => {
    mockNextParam = "/admin/configuracion?tab=maestros"
    mockCsrf()
    mockCallbackSuccess()
    const user = userEvent.setup()
    render(<PaginaIngresar />)
    await user.type(screen.getByLabelText(/correo electrónico/i), "a@b.cl")
    await user.type(screen.getByLabelText(/contraseña/i), "x")
    await user.click(screen.getByRole("button", { name: /ingresar/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/admin/configuracion?tab=maestros"))
  })

  it("login fallido credenciales muestra role=alert y no navega", async () => {
    mockCsrf()
    mockCallbackError("credentials")
    const user = userEvent.setup()
    render(<PaginaIngresar />)
    await user.type(screen.getByLabelText(/correo electrónico/i), "admin@test.cl")
    await user.type(screen.getByLabelText(/contraseña/i), "wrong")
    await user.click(screen.getByRole("button", { name: /ingresar/i }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Credenciales inválidas")
    expect(mockPush).not.toHaveBeenCalled()
  })

  it("login fallido rate_limited muestra mensaje de rate limit", async () => {
    mockCsrf()
    mockCallbackError("rate_limited")
    const user = userEvent.setup()
    render(<PaginaIngresar />)
    await user.type(screen.getByLabelText(/correo electrónico/i), "admin@test.cl")
    await user.type(screen.getByLabelText(/contraseña/i), "any")
    await user.click(screen.getByRole("button", { name: /ingresar/i }))
    expect(await screen.findByRole("alert")).toHaveTextContent(/Demasiados intentos/i)
  })

  it("error de conexión muestra mensaje genérico", async () => {
    mockCsrf()
    server.use(http.post("/api/auth/callback/credentials", () => HttpResponse.error()))
    const user = userEvent.setup()
    render(<PaginaIngresar />)
    await user.type(screen.getByLabelText(/correo electrónico/i), "a@b.cl")
    await user.type(screen.getByLabelText(/contraseña/i), "x")
    await user.click(screen.getByRole("button", { name: /ingresar/i }))
    expect(await screen.findByRole("alert")).toHaveTextContent(/Error de conexión/i)
  })

  it("deshabilita botón mientras carga y lo rehabilita tras error", async () => {
    mockCsrf()
    let resolve!: (v: unknown) => void
    const pending = new Promise((res) => (resolve = res))
    server.use(
      http.post("/api/auth/callback/credentials", async () => {
        await pending
        return HttpResponse.json(
          { url: "http://localhost/api/auth/error?error=CredentialsSignin&code=credentials" },
          { status: 200 }
        )
      })
    )
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
    mockCsrf()
    mockCallbackError("credentials")
    const user = userEvent.setup()
    render(<PaginaIngresar />)
    await user.type(screen.getByLabelText(/correo electrónico/i), "a@b.cl")
    await user.type(screen.getByLabelText(/contraseña/i), "wrong")
    await user.click(screen.getByRole("button", { name: /ingresar/i }))
    expect(await screen.findByRole("alert")).toBeInTheDocument()

    server.use(
      http.post("/api/auth/callback/credentials", () =>
        HttpResponse.json({ url: "http://localhost/admin" }, { status: 200 })
      )
    )
    await user.click(screen.getByRole("button", { name: /ingresar/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalled())
    await waitFor(() => expect(mockPush).toHaveBeenCalled())
  })

  it("maneja respuesta sin JSON (fallback mensaje)", async () => {
    mockCsrf()
    server.use(http.post("/api/auth/callback/credentials", () => new HttpResponse("Server error", { status: 500 })))
    const user = userEvent.setup()
    render(<PaginaIngresar />)
    await user.type(screen.getByLabelText(/correo electrónico/i), "a@b.cl")
    await user.type(screen.getByLabelText(/contraseña/i), "x")
    await user.click(screen.getByRole("button", { name: /ingresar/i }))
    expect(await screen.findByRole("alert")).toHaveTextContent(/No fue posible iniciar sesión/i)
  })
})
