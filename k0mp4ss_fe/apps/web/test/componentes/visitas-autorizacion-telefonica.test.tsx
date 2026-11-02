// @vitest-environment jsdom
/**
 * PE-visitas — autorización telefónica del residente en la visita sin aviso.
 *
 * Decisión del owner (2026-11-01): cuando llega alguien sin anunciarse, el
 * conserje llama al residente y pide el OK por teléfono. Si lo recibe, registra
 * la visita marcando «autorización telefónica recibida», y el sistema guarda la
 * hora de esa gestión. La UI avisa ANTES de guardar que esa autorización no se
 * podrá editar después (la API lo hace valer con 409).
 *
 * Se afirma lo observable por la interfaz: el check aparece sólo en la visita sin
 * aviso, sin el check no se registra nada, y al marcarlo se pide confirmación
 * antes de mandar `autorizacionTelefonica` + `horaAutorizacion` en el POST.
 */
import React from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { instalarEntornoRadix } from "./entorno-radix"
import { instalarApiPE } from "./api-pe-falsa"
import { VisitasPanel } from "@/components/pe/visitas-panel"

vi.setConfig({ testTimeout: 120_000 })

const HOY = new Date().toISOString().slice(0, 10)
const UNIDADES = [{ id: "u-A-101", numero: "101", etiqueta: "Depto", rolSii: "123-A11" }]

beforeAll(() => {
  instalarEntornoRadix()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Completa lo mínimo obligatorio y elige la unidad destino del servidor. */
async function llenarFormulario(user: ReturnType<typeof userEvent.setup>, nombre: string) {
  await user.type(screen.getByLabelText("Nombre *"), nombre)
  await user.type(screen.getByLabelText("DNI *"), "16.444.555-0")
  await user.type(screen.getByLabelText("Unidad destino"), "101")
  const lista = await screen.findByRole(
    "listbox",
    { name: /Resultados de Unidad destino/ },
    { timeout: 10_000 }
  )
  await user.click(await within(lista).findByRole("option", { name: /123-A11/ }))
}

function posts(api: ReturnType<typeof instalarApiPE>) {
  return api.peticiones.filter((p) => p.metodo === "POST" && p.url === "/api/pe/bitacora-visitas")
}

describe("VisitasPanel — autorización telefónica del residente", () => {
  it("el check aparece en la visita sin aviso y desaparece en la pre-agendada", async () => {
    const user = userEvent.setup()
    instalarApiPE({ unidades: UNIDADES })

    render(<VisitasPanel diaReporte={HOY} onError={vi.fn()} onSuccess={vi.fn()} />)

    // Sin aviso (valor por defecto del formulario): el check está.
    expect(screen.getByRole("switch", { name: /Autorización telefónica recibida/ })).toBeTruthy()

    // Pre-agendada: la autorización telefónica no aplica, la visita espera ingreso.
    await user.click(screen.getByRole("switch", { name: /Pre-agendada/ }))
    expect(screen.queryByRole("switch", { name: /Autorización telefónica recibida/ })).toBeNull()
  })

  it("sin el check no registra la visita y lo declara", async () => {
    const user = userEvent.setup()
    const onError = vi.fn()
    const api = instalarApiPE({ unidades: UNIDADES })

    render(<VisitasPanel diaReporte={HOY} onError={onError} onSuccess={vi.fn()} />)

    await llenarFormulario(user, "Visita Sin Autorizar")
    await user.click(screen.getByRole("button", { name: /Registrar visita/ }))

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        expect.stringMatching(/Autorización telefónica recibida/)
      )
    )
    // No se abre el aviso de no-editable porque no hay nada que congelar.
    expect(screen.queryByText("La autorización no se podrá editar")).toBeNull()
    expect(posts(api)).toHaveLength(0)
  })

  it("con el check avisa que no se podrá editar y guarda la autorización con su hora", async () => {
    const user = userEvent.setup()
    const api = instalarApiPE({ unidades: UNIDADES })

    render(<VisitasPanel diaReporte={HOY} onError={vi.fn()} onSuccess={vi.fn()} />)

    await llenarFormulario(user, "Visita Autorizada")
    await user.click(screen.getByRole("switch", { name: /Autorización telefónica recibida/ }))
    await user.click(screen.getByRole("button", { name: /Registrar visita/ }))

    // El aviso aparece ANTES de escribir y todavía no se mandó nada.
    expect(await screen.findByText("La autorización no se podrá editar")).toBeTruthy()
    expect(posts(api)).toHaveLength(0)

    await user.click(screen.getByRole("button", { name: /Sí, registrar/ }))

    await waitFor(() => expect(posts(api)).toHaveLength(1))
    const cuerpo = posts(api)[0]!.cuerpo as Record<string, unknown>
    expect(cuerpo.autorizacionTelefonica).toBe(true)
    expect(cuerpo.horaAutorizacion).toMatch(/^\d{2}:\d{2}$/)
    expect(cuerpo.estado).toBe("ingresada")
  })
})
