// @vitest-environment jsdom
/**
 * Acceso único — una puerta para todo lo que entra al edificio.
 *
 * Pedido del owner (2026-11-01): «registrar las visitas en una sola opcion para no
 * marear a los usuarios tiene que ser facil comodo e intuitivo». El conserje
 * elige qué viene a hacer la persona, no una pestaña ni un maestro.
 *
 * Decisión A: etiquetas nuevas, datos quietos. El alcance del trabajo se pregunta
 * como «para el edificio / para un departamento» y no como «contratista o
 * proveedor», que son palabras nuestras y no de la puerta.
 */
import React from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { instalarEntornoRadix } from "./entorno-radix"
import { instalarApiPE } from "./api-pe-falsa"
import { RegistroAcceso } from "@/components/pe/registro-acceso"

vi.setConfig({ testTimeout: 120_000 })

const HOY = new Date().toISOString().slice(0, 10)

beforeAll(() => {
  instalarEntornoRadix()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function montar() {
  instalarApiPE()
  return render(<RegistroAcceso diaReporte={HOY} onError={vi.fn()} onSuccess={vi.fn()} />)
}

describe("RegistroAcceso — una sola puerta", () => {
  it("ofrece las tres respuestas que se escuchan en la puerta", () => {
    montar()

    expect(screen.getByRole("button", { name: /Viene a ver a alguien/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Trae o retira algo/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Viene a trabajar/ })).toBeTruthy()
    // Ninguna pestaña ni palabra del modelo en la primera pantalla.
    expect(screen.queryByRole("tab")).toBeNull()
    expect(screen.queryByText(/contratista/i)).toBeNull()
    expect(screen.queryByText(/proveedor/i)).toBeNull()
  })

  it("«Viene a ver a alguien» abre el formulario de visita", async () => {
    const user = userEvent.setup()
    montar()

    await user.click(screen.getByRole("button", { name: /Viene a ver a alguien/ }))
    expect(await screen.findByText("Registro de visita")).toBeTruthy()
  })

  it("«Trae o retira algo» abre el formulario de encomienda", async () => {
    const user = userEvent.setup()
    montar()

    await user.click(screen.getByRole("button", { name: /Trae o retira algo/ }))
    // El panel de encomiendas monta su propio formulario; basta con que la
    // pantalla de selección haya desaparecido.
    expect(screen.queryByRole("button", { name: /Viene a ver a alguien/ })).toBeNull()
  })

  it("«Viene a trabajar» pregunta el alcance antes de mostrar el formulario", async () => {
    const user = userEvent.setup()
    montar()

    await user.click(screen.getByRole("button", { name: /Viene a trabajar/ }))

    // Primero el alcance, en las palabras de la puerta.
    expect(await screen.findByText(/para el edificio o para un departamento/i)).toBeTruthy()
    expect(screen.getByRole("button", { name: /Para el edificio/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Para un departamento/ })).toBeTruthy()
    // Todavía no hay formulario de contratista.
    expect(screen.queryByText("Agendamiento de contratista")).toBeNull()

    await user.click(screen.getByRole("button", { name: /Para el edificio/ }))
    expect(await screen.findByText("Agendamiento de contratista")).toBeTruthy()
    expect(screen.getByText("Trabajo para el edificio")).toBeTruthy()
  })

  it("«Cambiar» vuelve al selector y no arrastra el alcance elegido", async () => {
    const user = userEvent.setup()
    montar()

    await user.click(screen.getByRole("button", { name: /Viene a trabajar/ }))
    await user.click(screen.getByRole("button", { name: /Para un departamento/ }))
    expect(await screen.findByText("Agendamiento de contratista")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: /Cambiar: no es un trabajo/ }))
    expect(await screen.findByRole("button", { name: /Viene a trabajar/ })).toBeTruthy()

    // Al volver a entrar, el alcance anterior no quedó pegado.
    await user.click(screen.getByRole("button", { name: /Viene a trabajar/ }))
    expect(await screen.findByText(/para el edificio o para un departamento/i)).toBeTruthy()
  })
})
