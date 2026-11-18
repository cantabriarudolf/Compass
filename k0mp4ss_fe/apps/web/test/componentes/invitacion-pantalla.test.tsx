// @vitest-environment jsdom
/**
 * /invitacion — la página pública donde el invitado define su contraseña (F42 · S2/S4).
 *
 * Hasta acá el enlace de la invitación apuntaba a una ruta que sólo hablaba JSON:
 * la persona recibía un enlace y no tenía dónde caer. Lo que este archivo fija:
 *
 *   1. El token viaja en la URL y la página lo manda a `POST /api/auth/invitacion`
 *      junto con la contraseña escrita dos veces.
 *   2. La política de contraseñas es la que ya rige el login (`lib/password-policy.ts`):
 *      una contraseña débil se rechaza ANTES de llamar a la ruta y no consume el
 *      enlace. Dos contraseñas distintas tampoco viajan.
 *   3. Un rechazo del servidor se muestra con su texto TAL CUAL y no confirma si el
 *      token existió: la ruta responde lo mismo para inventado, vencido y usado.
 *   4. Sin token en la URL se dice lo mismo que la ruta, sin distinguir el caso:
 *      no hay forma de confirmar ni negar una invitación desde acá.
 *   5. El éxito no navega por su cuenta: dice que la contraseña quedó definida y
 *      ofrece el camino a /ingresar.
 *   6. La página no promete identidad: no muestra el correo ni el rol de la cuenta
 *      —la ruta del canje no los devuelve, a propósito—, pero sí explica qué se
 *      está activando y qué significa el rol de acceso.
 *
 * El texto del rechazo se compara contra `MENSAJE_INVITACION_INVALIDA` de
 * `lib/invitacion-acceso.ts`: la página lo repite como literal porque importar ese
 * módulo en un componente cliente arrastraría Prisma al navegador. La comparación
 * acá es la que impide que las dos copias se separen.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MENSAJE_INVITACION_INVALIDA } from "@/lib/invitacion-acceso"
import PaginaInvitacion from "@/app/invitacion/page"

const estado = vi.hoisted(() => ({ token: "token-de-invitacion" }))

vi.mock("next/navigation", () => ({
  useSearchParams: () =>
    new URLSearchParams(estado.token ? `token=${estado.token}` : ""),
}))

const fetchFalso = vi.fn()

function respuestaJson(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function servir(manejador: () => { status?: number; cuerpo: unknown }): void {
  fetchFalso.mockImplementation(async (entrada: unknown, init?: RequestInit) => {
    const url = String(entrada)
    if (url === "/api/auth/invitacion" && (init?.method ?? "GET") === "POST") {
      const respuesta = manejador()
      return respuestaJson(respuesta.cuerpo, respuesta.status ?? 200)
    }
    throw new Error(`fetch inesperado: ${url}`)
  })
}

function llamadas(): unknown[][] {
  return fetchFalso.mock.calls.slice()
}

function cuerpoDe(llamada: unknown[] | undefined): unknown {
  const init = llamada?.[1] as RequestInit | undefined
  return typeof init?.body === "string" ? JSON.parse(init.body) : null
}

const PASSWORD = "ClaveSegura123"

beforeEach(() => {
  estado.token = "token-de-invitacion"
  vi.stubGlobal("fetch", fetchFalso)
})

afterEach(() => {
  cleanup()
  fetchFalso.mockReset()
  vi.unstubAllGlobals()
})

describe("/invitacion — definir la contraseña con el enlace", () => {
  it("explica qué se activa y que el rol de acceso es el que manda", () => {
    servir(() => ({ cuerpo: { ok: true } }))
    render(<PaginaInvitacion />)

    expect(screen.getByRole("heading", { name: /Activá tu acceso/i })).toBeTruthy()
    expect(screen.getByText(/activa la cuenta de acceso/i)).toBeTruthy()
    // La confusión que la pantalla de cuentas deshace también se deshace acá.
    expect(
      screen.getByText(/tu rol en el padrón .*no cambia ese acceso/i)
    ).toBeTruthy()
  })

  it("una contraseña débil no llama a la ruta: se explica la política que falla", async () => {
    const user = userEvent.setup({ delay: null })
    servir(() => ({ cuerpo: { ok: true } }))
    render(<PaginaInvitacion />)

    await user.type(screen.getByLabelText("Contraseña"), "corta")
    await user.type(screen.getByLabelText("Repite la contraseña"), "corta")
    await user.click(screen.getByRole("button", { name: "Definir mi contraseña" }))

    const alerta = await screen.findByRole("alert")
    expect(alerta.textContent).toContain(
      "La contraseña debe tener al menos 8 caracteres."
    )
    // El enlace es de un solo uso: no se gasta en un intento que la ruta rechazaría.
    expect(llamadas()).toHaveLength(0)
  })

  it("dos contraseñas distintas tampoco viajan", async () => {
    const user = userEvent.setup({ delay: null })
    servir(() => ({ cuerpo: { ok: true } }))
    render(<PaginaInvitacion />)

    await user.type(screen.getByLabelText("Contraseña"), PASSWORD)
    await user.type(screen.getByLabelText("Repite la contraseña"), "ClaveSegura124")
    await user.click(screen.getByRole("button", { name: "Definir mi contraseña" }))

    const alerta = await screen.findByRole("alert")
    expect(alerta.textContent).toBe("Las dos contraseñas no coinciden.")
    expect(llamadas()).toHaveLength(0)
  })

  it("manda el token de la URL con la contraseña y, si sale bien, dice que quedó definida", async () => {
    const user = userEvent.setup({ delay: null })
    servir(() => ({ cuerpo: { ok: true } }))
    render(<PaginaInvitacion />)

    await user.type(screen.getByLabelText("Contraseña"), PASSWORD)
    await user.type(screen.getByLabelText("Repite la contraseña"), PASSWORD)
    await user.click(screen.getByRole("button", { name: "Definir mi contraseña" }))

    await waitFor(() => expect(llamadas()).toHaveLength(1))
    expect(String(llamadas()[0]![0])).toBe("/api/auth/invitacion")
    expect(cuerpoDe(llamadas()[0])).toEqual({
      token: "token-de-invitacion",
      password: PASSWORD,
    })

    const estadoFinal = await screen.findByRole("status")
    expect(estadoFinal.textContent).toMatch(/Tu contraseña quedó definida/i)
    const ingresar = screen.getByRole("link", { name: "Ingresar" })
    expect(ingresar.getAttribute("href")).toBe("/ingresar")
    // El formulario ya no se ofrece: la invitación se consumió.
    expect(screen.queryByLabelText("Contraseña")).toBeNull()
  })

  it("un rechazo del servidor se muestra tal cual, sin confirmar si el token existió", async () => {
    const user = userEvent.setup({ delay: null })
    servir(() => ({
      status: 400,
      cuerpo: { error: "La invitación no es válida o ya venció." },
    }))
    render(<PaginaInvitacion />)

    await user.type(screen.getByLabelText("Contraseña"), PASSWORD)
    await user.type(screen.getByLabelText("Repite la contraseña"), PASSWORD)
    await user.click(screen.getByRole("button", { name: "Definir mi contraseña" }))

    const alerta = await screen.findByRole("alert")
    // Mismo texto que la ruta, y el mismo que cualquier token inválido.
    expect(alerta.textContent).toBe(MENSAJE_INVITACION_INVALIDA)
    expect(screen.queryByRole("status")).toBeNull()
    // La página sigue ofreciendo el formulario: un error no consume nada.
    expect(screen.getByLabelText("Contraseña")).toBeTruthy()
  })

  it("un enlace sin token dice lo mismo que la ruta y no ofrece el formulario", () => {
    estado.token = ""
    servir(() => ({ cuerpo: { ok: true } }))
    render(<PaginaInvitacion />)

    const alerta = screen.getByRole("alert")
    expect(alerta.textContent).toBe(MENSAJE_INVITACION_INVALIDA)
    expect(screen.queryByLabelText("Contraseña")).toBeNull()
    expect(llamadas()).toHaveLength(0)
  })
})
