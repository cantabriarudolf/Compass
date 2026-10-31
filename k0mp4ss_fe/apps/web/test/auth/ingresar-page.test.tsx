import * as React from "react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor, cleanup } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const mockPush = vi.fn()
const mockAssign = vi.fn()
let mockNextParam: string | null = null

// La página navega con window.location.assign (recarga completa post-login),
// no con router.push: se finge assign preservando origin (la página lo lee
// para construir URLs absolutas del callback Auth.js).
const UBICACION_ORIGINAL = window.location
const ORIGEN_TEST = window.location.origin

function fingirLocationAssign() {
  Object.defineProperty(window, "location", {
    configurable: true,
    enumerable: true,
    value: {
      href: UBICACION_ORIGINAL.href,
      origin: ORIGEN_TEST,
      assign: mockAssign,
    },
  })
}

function restaurarLocation() {
  Object.defineProperty(window, "location", {
    configurable: true,
    enumerable: true,
    value: UBICACION_ORIGINAL,
  })
}

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

function mockChallenge(responder: () => Promise<Response>) {
  const previo = manejadorFetch
  manejadorFetch = (url) => {
    if (url === "/api/auth/2fa/challenge") return responder()
    return previo(url)
  }
}

function mock2fa(endpoint: string, responder: () => Promise<Response>) {
  const previo = manejadorFetch
  manejadorFetch = (url) => {
    if (url === endpoint) return responder()
    return previo(url)
  }
}

// Configura el flujo completo hasta el paso 2: Auth.js responde
// code=requiere_2fa y el challenge entrega un tempToken válido.
function configurarFlujo2fa() {
  mockCsrfOk()
  mockCallbackError("requiere_2fa")
  mockChallenge(() =>
    Promise.resolve(respJson({ requires2FA: true, tempToken: "tmp-token" }))
  )
}

async function llegarAPaso2(user: ReturnType<typeof userEvent.setup>) {
  render(<PaginaIngresar />)
  await user.type(screen.getByLabelText(/correo electrónico/i), "admin@test.cl")
  await user.type(screen.getByLabelText(/contraseña/i), "Test1234!")
  await user.click(screen.getByRole("button", { name: /ingresar/i }))
  await screen.findByLabelText(/código de verificación/i)
}

describe("app/ingresar/page.tsx (Auth.js)", () => {
  beforeEach(() => {
    mockPush.mockClear()
    mockAssign.mockClear()
    mockNextParam = null
    fingirLocationAssign()
    manejadorFetch = () =>
      Promise.reject(new Error("fetch no mockeado en este test"))
    vi.stubGlobal("fetch", (url: unknown) => manejadorFetch(String(url)))
  })
  afterEach(() => {
    cleanup()
    restaurarLocation()
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

  it("login exitoso navega a /dashboard (sin next)", async () => {
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
    await waitFor(() => expect(mockAssign).toHaveBeenCalledWith("/dashboard"))
  })

  it("login exitoso respeta ?next= interno", async () => {
    mockNextParam = "/admin/permisos"
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
    await waitFor(() => expect(mockAssign).toHaveBeenCalledWith("/admin/permisos"))
  })

  it("login exitoso ignora ?next= externo y va a /dashboard", async () => {
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
    await waitFor(() => expect(mockAssign).toHaveBeenCalledWith("/dashboard"))
  })

      it("login exitoso ignora ?next= protocol-relative (//evil.com) y va a /dashboard", async () => {
        mockNextParam = "//evil.com/phish"
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
        await waitFor(() => expect(mockAssign).toHaveBeenCalledWith("/dashboard"))
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
      expect(mockAssign).toHaveBeenCalledWith("/admin/configuracion?tab=maestros")
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
    expect(mockAssign).not.toHaveBeenCalled()
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
    await waitFor(() => expect(mockAssign).toHaveBeenCalled())
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

  it("requiere_2fa muestra el paso 2 de verificación en dos pasos", async () => {
    configurarFlujo2fa()
    const user = userEvent.setup()
    await llegarAPaso2(user)
    expect(
      screen.getByRole("heading", { name: /verificación en dos pasos/i })
    ).toBeInTheDocument()
    expect(screen.queryByLabelText(/correo electrónico/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/contraseña/i)).not.toBeInTheDocument()
    expect(mockAssign).not.toHaveBeenCalled()
  })

  it("paso 2 con verify OK redirige al destino ?next=", async () => {
    mockNextParam = "/admin/permisos"
    configurarFlujo2fa()
    mock2fa("/api/auth/2fa/verify", () => Promise.resolve(respJson({ ok: true })))
    const user = userEvent.setup()
    await llegarAPaso2(user)
    await user.type(screen.getByLabelText(/código de verificación/i), "123456")
    await user.click(screen.getByRole("button", { name: /verificar/i }))
    await waitFor(() => expect(mockAssign).toHaveBeenCalledWith("/admin/permisos"))
  })

  it("paso 2 con código inválido muestra error sin avanzar", async () => {
    configurarFlujo2fa()
    mock2fa(
      "/api/auth/2fa/verify",
      () => Promise.resolve(respJson({ error: "Código inválido." }, 401))
    )
    const user = userEvent.setup()
    await llegarAPaso2(user)
    await user.type(screen.getByLabelText(/código de verificación/i), "000000")
    await user.click(screen.getByRole("button", { name: /verificar/i }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Código inválido")
    expect(mockAssign).not.toHaveBeenCalled()
    expect(
      screen.getByLabelText(/código de verificación/i)
    ).toBeInTheDocument()
  })

  it("paso 2 rechaza input malformado sin llamar al endpoint", async () => {
    configurarFlujo2fa()
    mock2fa(
      "/api/auth/2fa/verify",
      () => Promise.resolve(respJson({ error: "Código inválido." }, 401))
    )
    const user = userEvent.setup()
    await llegarAPaso2(user)
    await user.type(screen.getByLabelText(/código de verificación/i), "12ab")
    await user.click(screen.getByRole("button", { name: /verificar/i }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /6 dígitos/i
    )
    expect(mockAssign).not.toHaveBeenCalled()
  })

  it("código de respaldo OK muestra códigos restantes y advertencia", async () => {
    configurarFlujo2fa()
    mock2fa(
      "/api/auth/2fa/backup",
      () =>
        Promise.resolve(
          respJson({ ok: true, codigosRestantes: 7, advertencia: "Quedan pocos códigos." })
        )
    )
    const user = userEvent.setup()
    await llegarAPaso2(user)
    await user.click(
      screen.getByRole("button", { name: /usar código de respaldo/i })
    )
    await user.type(screen.getByLabelText(/código de respaldo/i), "ABCD1234")
    await user.click(screen.getByRole("button", { name: /verificar/i }))
    expect(
      await screen.findByText(/códigos de respaldo restantes: 7/i)
    ).toBeInTheDocument()
    expect(screen.getByText("Quedan pocos códigos.")).toBeInTheDocument()
    expect(mockAssign).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: /continuar/i }))
    await waitFor(() => expect(mockAssign).toHaveBeenCalledWith("/dashboard"))
  })

  it("desafío expirado vuelve al paso 1 con mensaje de reingreso", async () => {
    configurarFlujo2fa()
    mock2fa(
      "/api/auth/2fa/verify",
      () =>
        Promise.resolve(
          respJson(
            { error: "Desafío expirado. Ingresa tus credenciales nuevamente." },
            401
          )
        )
    )
    const user = userEvent.setup()
    await llegarAPaso2(user)
    await user.type(screen.getByLabelText(/código de verificación/i), "123456")
    await user.click(screen.getByRole("button", { name: /verificar/i }))
    expect(await screen.findByRole("alert")).toHaveTextContent(/expiró/i)
    expect(
      screen.getByLabelText(/correo electrónico/i)
    ).toBeInTheDocument()
    expect(
      screen.queryByLabelText(/código de verificación/i)
    ).not.toBeInTheDocument()
    expect(mockAssign).not.toHaveBeenCalled()
  })
})
