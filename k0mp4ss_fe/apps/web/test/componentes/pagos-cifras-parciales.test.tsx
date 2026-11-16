// @vitest-environment jsdom
/**
 * T26 (S10) — las cifras del libro de cobros no se presentan como total si la
 * colección está recortada.
 *
 * `useCobrosFI()` pide `pageSize=100`: las tres tarjetas de `/finanzas/pagos`
 * («Recaudado», «Por cobrar», «Cobros registrados») suman sobre la página
 * cargada y la mostraban como el total de la comunidad sin decirlo. El criterio
 * es el de T20: una cifra con cara de total no puede salir de una lista
 * paginada sin declararlo. El `VerMas` del fondo de la tabla ya declaraba
 * «Mostrando N de M» pero las tarjetas no decían nada.
 *
 * Lo que este test fija:
 *   1. con `total = 501` y 100 filas en la primera respuesta, la tarjeta de
 *      cantidad declara «100 de 501» y los dos montos dicen que son una suma
 *      parcial sobre lo cargado;
 *   2. con el libro completo en una página (`total = 100`), las tarjetas
 *      muestran exactamente lo de antes, sin ninguna declaración de recorte,
 *      y el `VerMas` no aparece.
 *
 * El stub de `fetch` LANZA nombrando la URL no declarada (regla R3-001 de L15):
 * un misroute no puede quedar verde.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SWRConfig } from "swr"
import { cleanup, render, screen, within } from "@testing-library/react"
import { instalarEntornoRadix } from "./entorno-radix"
import PagosPage from "@/app/finanzas/pagos/page"

// Mismo piso que el resto de los tests de componentes: bajo instrumentación de
// cobertura el default de 15 s se queda corto.
vi.setConfig({ testTimeout: 60_000 })

const RUTA_COBROS = "/api/cobros-fi"
const RUTA_UNIDADES = "/api/unidades"
const RUTA_FONDOS = "/api/fondos-fi"

const UNIDAD = { id: "u-101", etiqueta: "Depto", numero: "101" }
const FONDO = { id: "f-gc", nombre: "Fondo de gastos comunes", activo: true }

interface CobroPrueba {
  id: string
  unidadId: string
  concepto: string
  descripcion: string
  fondoId: string
  periodo: string
  montoBase: number
  fechaCargo: string
  fechaVencimiento: string | null
  pagos: { id: string; monto: number; fecha: string; medio: string }[]
  moras: unknown[]
  diferencias: unknown[]
  /** Cobro legacy: una sola línea implícita. */
  lineas: null
}

function cobroDe(indice: number, montoPagado: number): CobroPrueba {
  return {
    id: `cob-${String(indice).padStart(3, "0")}`,
    unidadId: UNIDAD.id,
    concepto: "gasto_comun",
    descripcion: "Gasto común enero 2026",
    fondoId: FONDO.id,
    periodo: "2026-01",
    montoBase: montoPagado + 100,
    fechaCargo: "2026-01-05",
    fechaVencimiento: null,
    pagos: [
      {
        id: `pag-${indice}`,
        monto: montoPagado,
        fecha: "2026-01-06",
        medio: "transferencia",
      },
    ],
    moras: [],
    diferencias: [],
    lineas: null,
  }
}

/** Una página de `n` cobros, cada uno pagado por `montoPagado`. */
function pagina(n: number, montoPagado: number): CobroPrueba[] {
  return Array.from({ length: n }, (_, i) => cobroDe(i + 1, montoPagado))
}

function respuestaJson(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "content-type": "application/json" },
  })
}

/**
 * Stub ESTRICTO: página 1 de cobros con el `total` declarado y las dos
 * colecciones de referencia de la pantalla. Cualquier otra URL —incluida una
 * `page=2` que este caso no previó— LANZA nombrándola.
 */
function servir(total: number, filasPagina1: CobroPrueba[]): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (recurso: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const url = recurso instanceof Request ? recurso.url : String(recurso)
        const metodo = init?.method ?? "GET"
        if (metodo === "GET" && url.startsWith(RUTA_COBROS)) {
          const page = new URL(url, "http://localhost").searchParams.get("page")
          if (page && page !== "1") {
            throw new Error(
              `[stub] página ${page} de cobros no declarada para este caso: ${url}`
            )
          }
          return Promise.resolve(
            respuestaJson({ data: filasPagina1, page: 1, pageSize: 100, total })
          )
        }
        if (metodo === "GET" && url.startsWith(RUTA_UNIDADES)) {
          return Promise.resolve(
            respuestaJson({ data: [UNIDAD], page: 1, pageSize: 100, total: 1 })
          )
        }
        if (metodo === "GET" && url.startsWith(RUTA_FONDOS)) {
          return Promise.resolve(
            respuestaJson({ data: [FONDO], page: 1, pageSize: 100, total: 1 })
          )
        }
        throw new Error(`[stub] URL inesperada para este caso: ${metodo} ${url}`)
      }
    )
  )
}

function montar(): void {
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <PagosPage />
    </SWRConfig>
  )
}

/** La `Card` completa cuyo título es `titulo`. */
function tarjeta(titulo: string): HTMLElement {
  const card = screen.getByText(titulo).closest('[data-slot="card"]')
  if (!(card instanceof HTMLElement)) {
    throw new Error(`No se encontró la tarjeta «${titulo}»`)
  }
  return card
}

beforeEach(() => {
  instalarEntornoRadix()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("Pagos — las cifras de las tarjetas declaran el recorte (T26 · S10)", () => {
  it("con más cobros que la primera página, las tres tarjetas dicen cuánto cargaron", async () => {
    servir(501, pagina(100, 1000))

    montar()

    // La tabla está pintada con su VerMas de siempre (no se toca).
    await screen.findByText("Mostrando 100 de 501")

    // La tarjeta de cantidad declara N de M…
    expect(
      within(tarjeta("Cobros registrados")).getByText("100 de 501")
    ).toBeTruthy()
    // …y los dos montos dicen que suman sólo lo cargado.
    expect(
      screen.getAllByText("Suma parcial: cubre 100 de 501 cobros cargados.")
    ).toHaveLength(2)
    expect(within(tarjeta("Recaudado")).getByText("$100.000")).toBeTruthy()
    expect(within(tarjeta("Por cobrar")).getByText("$10.000")).toBeTruthy()
  })

  it("con el libro completo en una página, las tarjetas muestran lo de siempre sin declaración", async () => {
    servir(100, pagina(100, 1000))

    montar()

    await screen.findByText("$100.000")

    expect(within(tarjeta("Cobros registrados")).getByText("100")).toBeTruthy()
    expect(within(tarjeta("Recaudado")).getByText("$100.000")).toBeTruthy()
    expect(within(tarjeta("Por cobrar")).getByText("$10.000")).toBeTruthy()
    // Ninguna declaración de recorte: el libro está completo.
    expect(screen.queryByText(/Suma parcial/)).toBeNull()
    expect(screen.queryByText(/cobros cargados/)).toBeNull()
  })
})
