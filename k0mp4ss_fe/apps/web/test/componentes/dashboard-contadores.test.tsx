// @vitest-environment jsdom
/**
 * Dashboard — los contadores no mienten.
 *
 * Hallazgo de la auditoría: la tarjeta "Fondos FI" del dashboard viejo mostraba
 * `fondosFI.length` con el subtítulo "Cajas financieras activas". El modelo sí
 * tiene estado (`FondoFI.activo`, prisma/schema.prisma:889; contrato del cliente
 * en lib/schemas.ts:1154), así que el número y el rótulo se contradecían en
 * cuanto existía un fondo dado de baja.
 *
 * El contador vive ahora en el panel "Caja por fondos" de
 * `components/dashboard/bloque-financiero.tsx` (la portada que reemplazó a la
 * tarjeta en 8c80c79 ya no tiene KPIs de inventario). Este test apunta a ese
 * componente y no a `/dashboard` porque la página es un server component
 * `async` que espera `auth()` y no se puede montar en jsdom; el caso sigue
 * siendo el mismo y se mide sobre el mismo texto que ve el usuario.
 *
 * El camino elegido se conserva: filtrar por `activo` y declarar cuántos fondos
 * quedaron fuera del conteo.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import type { FondoFI } from "@/lib/schemas"
import type { ResumenFI } from "@/lib/api/use-resumen-fi"

const estado = {
  fondos: [] as FondoFI[],
  resumen: null as unknown as ResumenFI,
}

const coleccion = <T,>(items: T[]) => ({
  items,
  total: items.length,
  isLoading: false,
  error: null,
  hasMore: false,
  cargandoMas: false,
  cargarMas: vi.fn(async () => {}),
  create: vi.fn(async () => ({ ok: true })),
  update: vi.fn(async () => ({ ok: true })),
  remove: vi.fn(async () => ({ ok: true })),
})

vi.mock("@/lib/api/use-fondos-fi", () => ({
  useFondosFI: () => coleccion(estado.fondos),
}))
vi.mock("@/lib/api/use-resumen-fi", () => ({
  useResumenFI: () => estado.resumen,
}))

import { BloqueFinanciero } from "@/components/dashboard/bloque-financiero"
import { clp } from "@/components/dashboard/agregados"

function fondo(id: string, activo: boolean): FondoFI {
  return {
    id,
    nombre: `Fondo ${id}`,
    tipo: "gasto_comun",
    activo,
  }
}

/**
 * El servidor (`GET /api/fi` → `totalesPorFondo`) devuelve el desglose de TODOS
 * los fondos, dados de baja incluidos: el estado de cada caja llega por
 * `FondoFI.activo`, no por el saldo.
 */
function resumenDe(fondos: FondoFI[]): ResumenFI {
  const porFondo = fondos.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    saldoInicial: 120_000,
    montoIngresos: 40_000,
    montoEgresos: 10_000,
    saldo: 150_000,
  }))
  return {
    montoEgresos: 250_000,
    montoIngresos: 400_000,
    saldoTotal: 300_000,
    porFondo,
    completo: true,
    isLoading: false,
    error: null,
  }
}

/** Contador de cajas del panel: la fila que comparte el rótulo "Caja por fondos". */
function contadorDeCajas(): HTMLElement {
  const rotulo = screen.getByText("Caja por fondos")
  const fila = rotulo.parentElement
  if (!fila) throw new Error("el rótulo «Caja por fondos» no tiene contenedor")
  return fila
}

beforeEach(() => {
  estado.fondos = [fondo("gc", true), fondo("reserva", true), fondo("amenities", false)]
  estado.resumen = resumenDe(estado.fondos)
})

afterEach(() => {
  cleanup()
})

describe("dashboard — contador de cajas por fondos", () => {
  it("cuenta solo los fondos activos y declara los dados de baja", () => {
    render(<BloqueFinanciero />)

    // 3 registrados, 1 dado de baja → el panel muestra 2 y no lista la caja muerta.
    expect(within(contadorDeCajas()).getByText("2")).toBeTruthy()
    expect(
      within(contadorDeCajas()).getByText("Cajas financieras activas · 1 dadas de baja")
    ).toBeTruthy()
    expect(screen.queryByText("Fondo amenities")).toBeNull()
  })

  it("sin fondos dados de baja el subtítulo no agrega ruido", () => {
    estado.fondos = [fondo("gc", true), fondo("reserva", true)]
    estado.resumen = resumenDe(estado.fondos)

    render(<BloqueFinanciero />)

    expect(within(contadorDeCajas()).getByText("2")).toBeTruthy()
    expect(within(contadorDeCajas()).getByText("Cajas financieras activas")).toBeTruthy()
  })

  it("con todos los fondos dados de baja el contador es 0, no el total registrado", () => {
    estado.fondos = [fondo("gc", false), fondo("reserva", false)]
    estado.resumen = resumenDe(estado.fondos)

    render(<BloqueFinanciero />)

    expect(within(contadorDeCajas()).getByText("0")).toBeTruthy()
    expect(
      within(contadorDeCajas()).getByText("Cajas financieras activas · 2 dadas de baja")
    ).toBeTruthy()
  })
})

/**
 * PRESERVE: el desglose sigue saliendo del servidor. El filtro nuevo solo quita
 * cajas dadas de baja, así que con todas las cajas activas la lista, sus montos
 * y el aviso de "sin desglose" se ven igual que antes del cambio.
 */
describe("dashboard — desglose de cajas (comportamiento previo)", () => {
  it("muestra el saldo que informa el servidor en cada caja activa", () => {
    estado.fondos = [fondo("gc", true), fondo("reserva", true)]
    estado.resumen = resumenDe(estado.fondos)

    render(<BloqueFinanciero />)

    expect(screen.getByText("Fondo gc")).toBeTruthy()
    expect(screen.getByText("Fondo reserva")).toBeTruthy()
    expect(screen.getAllByText(clp(150_000))).toHaveLength(2)
  })

  it("sin desglose del servidor mantiene el aviso explícito", () => {
    estado.fondos = []
    estado.resumen = resumenDe([])

    render(<BloqueFinanciero />)

    expect(screen.getByText("El servidor no informó saldos por fondo.")).toBeTruthy()
  })
})
