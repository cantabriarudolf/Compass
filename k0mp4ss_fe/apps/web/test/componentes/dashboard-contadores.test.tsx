// @vitest-environment jsdom
/**
 * Dashboard — los contadores no mienten.
 *
 * Hallazgo de la auditoría: la tarjeta "Fondos FI" mostraba `fondosFI.length` con el
 * subtítulo "Cajas financieras activas". El modelo sí tiene estado (`FondoFI.activo`,
 * prisma/schema.prisma:889; contrato del cliente en lib/schemas.ts:1154), así que el
 * número y el rótulo se contradecían en cuanto existía un fondo dado de baja.
 *
 * El test fija el camino elegido: filtrar por `activo` y declarar en el subtítulo cuántos
 * fondos quedaron fuera del conteo.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import type { FondoFI } from "@/lib/schemas"

const estado = { fondos: [] as FondoFI[] }

const coleccion = <T,>(items: T[]) => ({
  items,
  total: items.length,
  isLoading: false,
  error: null,
  create: vi.fn(async () => ({ ok: true })),
  update: vi.fn(async () => ({ ok: true })),
  remove: vi.fn(async () => ({ ok: true })),
})

vi.mock("@/lib/api/use-unidades", () => ({ useUnidades: () => coleccion([]) }))
vi.mock("@/lib/api/use-personas", () => ({
  usePersonas: () => ({ personas: [], total: 0, isLoading: false, error: null }),
}))
vi.mock("@/lib/api/use-vinculos", () => ({
  useVinculos: () => ({ vinculos: [], total: 0, isLoading: false, error: null }),
}))
vi.mock("@/lib/api/use-tipos-unidad", () => ({ useTiposUnidad: () => coleccion([]) }))
vi.mock("@/lib/api/use-macro-sectores", () => ({ useMacroSectores: () => coleccion([]) }))
vi.mock("@/lib/api/use-micro-sectores", () => ({ useMicroSectores: () => coleccion([]) }))
vi.mock("@/lib/api/use-maestros", () => ({
  useMaestros: () => ({ data: [], total: 0, isLoading: false, error: null }),
}))
vi.mock("@/lib/api/use-fondos-fi", () => ({
  useFondosFI: () => coleccion(estado.fondos),
}))

import DashboardPage from "@/app/dashboard/page"

function fondo(id: string, activo: boolean): FondoFI {
  return {
    id,
    nombre: `Fondo ${id}`,
    tipo: "gastos-comunes",
    activo,
  }
}

/** Tarjeta KPI de Fondos FI: el `Link` que envuelve la tarjeta. */
function tarjetaFondos(): HTMLElement {
  const etiqueta = screen.getByText("Fondos FI")
  const enlace = etiqueta.closest("a")
  if (!enlace) throw new Error("la tarjeta Fondos FI no está dentro de su enlace")
  return enlace as HTMLElement
}

beforeEach(() => {
  estado.fondos = [fondo("gc", true), fondo("reserva", true), fondo("amenities", false)]
})

afterEach(() => {
  cleanup()
})

describe("dashboard — contador de Fondos FI", () => {
  it("cuenta solo los fondos activos y declara los dados de baja", () => {
    render(<DashboardPage />)

    const tarjeta = within(tarjetaFondos())
    // 3 registrados, 1 dado de baja → el KPI muestra 2.
    expect(tarjeta.getByText("2")).toBeTruthy()
    expect(
      tarjeta.getByText("Cajas financieras activas · 1 dadas de baja")
    ).toBeTruthy()
  })

  it("sin fondos dados de baja el subtítulo no agrega ruido", () => {
    estado.fondos = [fondo("gc", true), fondo("reserva", true)]

    render(<DashboardPage />)

    const tarjeta = within(tarjetaFondos())
    expect(tarjeta.getByText("2")).toBeTruthy()
    expect(tarjeta.getByText("Cajas financieras activas")).toBeTruthy()
  })

  it("con todos los fondos dados de baja el contador es 0, no el total registrado", () => {
    estado.fondos = [fondo("gc", false), fondo("reserva", false)]

    render(<DashboardPage />)

    const tarjeta = within(tarjetaFondos())
    expect(tarjeta.getByText("0")).toBeTruthy()
    expect(
      tarjeta.getByText("Cajas financieras activas · 2 dadas de baja")
    ).toBeTruthy()
  })
})
