// @vitest-environment jsdom
/**
 * /comunidad/directorio — estados del panel además del caso feliz.
 *
 * El defecto vivió invisible porque el panel pintaba una `Card` vacía cuando la
 * lectura traía cero filas o fallaba: residente, conserjería y mantención veían
 * un directorio en blanco sin ninguna señal. Un directorio de emergencias vacío
 * sin explicación se lee como "la comunidad no tiene contactos", que es
 * exactamente lo contrario de lo que hay que comunicar.
 *
 * Lo que se afirma acá:
 * - la lectura con filas sigue pintando los contactos (secciones, nombre,
 *   sitio y teléfono marcable) — el caso feliz no cambia;
 * - una lectura con error dice que falló y muestra el motivo, con reintento;
 * - una lectura vacía dice que no hay contactos cargados y a quién pedirlos;
 * - nunca se pinta una tarjeta en blanco: en los dos casos de borde hay texto.
 */
import React from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { instalarEntornoRadix } from "./entorno-radix"
import type { ContactoEmergencia } from "@/lib/schemas"

const CONTACTOS: ContactoEmergencia[] = [
  { id: "dir-1", categoria: "urgencia", nombre: "Bomberos", telefono: "132" },
  { id: "dir-2", categoria: "urgencia", nombre: "Carabineros", telefono: "133" },
  {
    id: "dir-3",
    categoria: "tecnico",
    nombre: "Empresa de Ascensores",
    telefono: "+56 2 2345 6789",
    sitioWeb: "https://ascensores.cl",
  },
]

const estado = vi.hoisted(() => ({
  data: [] as ContactoEmergencia[],
  isLoading: false,
  error: null as Error | null,
  refetch: () => {},
}))

vi.mock("@/lib/api/use-directorio-emergencias", () => ({
  useDirectorioEmergencias: () => ({
    data: estado.data,
    isLoading: estado.isLoading,
    error: estado.error,
    refetch: () => estado.refetch(),
  }),
}))

import { DirectorioPanel } from "@/app/comunidad/directorio/panel-directorio"

function montar(opciones: {
  data?: ContactoEmergencia[]
  isLoading?: boolean
  error?: Error | null
  refetch?: () => void
}) {
  estado.data = opciones.data ?? []
  estado.isLoading = opciones.isLoading ?? false
  estado.error = opciones.error ?? null
  estado.refetch = opciones.refetch ?? (() => {})
  return render(<DirectorioPanel />)
}

beforeAll(() => {
  instalarEntornoRadix()
})

afterEach(() => {
  cleanup()
})

describe("directorio de emergencias: lectura viva y estados de borde", () => {
  it("con filas pinta los contactos de las dos categorías (caso feliz intacto)", () => {
    montar({ data: CONTACTOS })

    expect(screen.getByText("Servicios de Urgencia")).toBeTruthy()
    expect(screen.getByText("Servicios Técnicos de Urgencia")).toBeTruthy()
    for (const contacto of CONTACTOS) {
      expect(screen.getByText(contacto.nombre)).toBeTruthy()
    }
    expect(screen.getByText("https://ascensores.cl")).toBeTruthy()
    const enlace = screen.getByRole("link", { name: /\+56 2 2345 6789/ })
    expect(enlace.getAttribute("href")).toBe("tel:+56223456789")
  })

  it("si la lectura falla lo dice con el motivo y ofrece reintentar", async () => {
    const refetch = vi.fn()
    montar({
      error: new Error("Error 403 al consultar /api/comunidad/directorio."),
      refetch,
    })

    expect(screen.getByRole("alert")).toBeTruthy()
    expect(screen.getByText(/no se pudieron cargar los contactos/i)).toBeTruthy()
    expect(
      screen.getByText(/Error 403 al consultar \/api\/comunidad\/directorio\./)
    ).toBeTruthy()
    // No queda ninguna tarjeta de contactos vacía en su lugar.
    expect(screen.queryByText("Servicios de Urgencia")).toBeNull()

    await userEvent.setup().click(screen.getByRole("button", { name: /reintentar/i }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it("si no hay contactos cargados lo dice y no pinta una tarjeta en blanco", () => {
    montar({ data: [] })

    expect(screen.getByRole("status")).toBeTruthy()
    expect(screen.getByText(/no hay contactos de emergencia/i)).toBeTruthy()
    expect(screen.getByText(/administración/i)).toBeTruthy()
    expect(screen.queryByText("Servicios de Urgencia")).toBeNull()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("mientras carga no aparece ni el vacío ni el error (no se afirma nada antes de saber)", () => {
    montar({ isLoading: true })

    expect(screen.queryByRole("status")).toBeNull()
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.queryByText(/no hay contactos/i)).toBeNull()
  })
})
