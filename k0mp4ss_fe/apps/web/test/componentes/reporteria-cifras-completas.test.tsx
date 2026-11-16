// @vitest-environment jsdom
/**
 * T26 (S10) — las cifras de caja de reportería se calculan sobre la colección
 * COMPLETA, no sobre la primera página.
 *
 * `useCobrosFI()` y `useEgresosFI()` piden `pageSize=100`: «Ingresos netos»,
 * «Egresos totales», «Diferencia de caja», el termómetro y el desglose
 * «recaudación por fondo» de `/admin/reporteria` se calculaban sobre las
 * primeras 100 filas y se mostraban como totales de la comunidad. El snapshot
 * del informe emitido NO se calcula en esta pantalla (lo congela el servidor):
 * el defecto es de pantalla. La corrección reusa `useColeccionCompleta` de
 * `components/dashboard/piezas.tsx`, el mismo patrón del dashboard (T4/D4).
 *
 * Lo que este test fija:
 *   1. con dos páginas de cobros y dos de egresos, «Ingresos netos» es la suma
 *      de las DOS páginas: una respuesta que sólo trajera la primera página y
 *      un `total` mayor haría fallar el test;
 *   2. mientras la colección no está completa, la tarjeta de caja NO muestra
 *      números parciales: muestra su estado de carga, igual que hace
 *      `TotalARecaudarEmision` en gastos comunes;
 *   3. con el libro entero en una página, las cifras son las de siempre y
 *      nadie pide una página 2.
 *
 * El resto de las métricas (demografía, operativas, embudo, huérfanos) no se
 * toca. El stub de `fetch` LANZA nombrando la URL no declarada (R3-001, L15).
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SWRConfig } from "swr"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import { instalarEntornoRadix } from "./entorno-radix"
import ReporteriaPage from "@/app/admin/reporteria/page"

// Mismo piso que el resto de los tests de componentes.
vi.setConfig({ testTimeout: 60_000 })

const UNIDAD = {
  id: "u-101",
  etiqueta: "Depto",
  numero: "101",
  microSectorId: "ms-1",
}
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
  /** Cobro legacy: una sola línea implícita, todo su monto a `fondoId`. */
  lineas: null
}

interface EgresoPrueba {
  id: string
  monto: number
  esRecurrente: boolean
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

function paginaCobros(n: number, montoPagado: number): CobroPrueba[] {
  return Array.from({ length: n }, (_, i) => cobroDe(i + 1, montoPagado))
}

function paginaEgresos(n: number, monto: number): EgresoPrueba[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `egr-${String(i + 1).padStart(3, "0")}`,
    monto,
    esRecurrente: false,
  }))
}

function respuestaJson(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "content-type": "application/json" },
  })
}

interface ColeccionDePaginas {
  total: number
  /** `paginas[0]` responde `page=1`, `paginas[1]` responde `page=2`, etc. */
  paginas: unknown[][]
}

/**
 * Stub ESTRICTO con router por prefijo: las colecciones paginadas declaran sus
 * páginas y las de referencia responden una página vacía o de una fila. Una
 * `page=N` no declarada o una URL fuera del router LANZA nombrándola.
 */
function servir(config: {
  cobros?: ColeccionDePaginas
  egresos?: ColeccionDePaginas
  /** Retiene las páginas ≥ 2 de cobros hasta resolverse (estado parcial observable). */
  retenerCobros?: Promise<void>
}): { urls: string[] } {
  const urls: string[] = []
  const paginaDe = (
    url: string,
    coleccion: ColeccionDePaginas | undefined,
    esperar?: Promise<void>
  ): Promise<Response> => {
    if (!coleccion) {
      throw new Error(`[stub] colección no declarada para este caso: ${url}`)
    }
    const page = Number(
      new URL(url, "http://localhost").searchParams.get("page") ?? "1"
    )
    const filas = coleccion.paginas[page - 1]
    if (!filas) {
      throw new Error(`[stub] página ${page} no declarada para este caso: ${url}`)
    }
    const responder = (): Response =>
      respuestaJson({ data: filas, page, pageSize: 100, total: coleccion.total })
    // La retención sólo aplica a las páginas siguientes: la página 1 sigue
    // llegando, que es el estado real que se quiere observar.
    const demorado = esperar !== undefined && page > 1
    return demorado ? esperar.then(responder) : Promise.resolve(responder())
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(async (recurso: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = recurso instanceof Request ? recurso.url : String(recurso)
      const metodo = init?.method ?? "GET"
      urls.push(`${metodo} ${url}`)
      if (metodo === "GET" && url.startsWith("/api/cobros-fi")) {
        return paginaDe(url, config.cobros, config.retenerCobros)
      }
      if (metodo === "GET" && url.startsWith("/api/egresos-fi")) {
        return paginaDe(url, config.egresos)
      }
      if (metodo === "GET" && url.startsWith("/api/unidades")) {
        return respuestaJson({ data: [UNIDAD], page: 1, pageSize: 100, total: 1 })
      }
      if (metodo === "GET" && url.startsWith("/api/fondos-fi")) {
        return respuestaJson({ data: [FONDO], page: 1, pageSize: 100, total: 1 })
      }
      if (metodo === "POST" && url.startsWith("/api/reportes-re/vistas")) {
        return respuestaJson({ ok: true })
      }
      const vacias = [
        "/api/vinculos",
        "/api/personas",
        "/api/pe/cierres-turno",
        "/api/pe/bitacora-visitas",
        "/api/maestros/jornadas",
        "/api/ge/solicitudes",
        "/api/macro-sectores",
        "/api/micro-sectores",
        "/api/reportes-re",
      ]
      if (metodo === "GET" && vacias.some((p) => url.startsWith(p))) {
        return respuestaJson({ data: [], page: 1, pageSize: 100, total: 0 })
      }
      throw new Error(`[stub] URL inesperada para este caso: ${metodo} ${url}`)
    })
  )
  return { urls }
}

/** La `Card` de salud de caja, identificada por su título. */
function tarjetaCaja(): HTMLElement {
  const card = screen
    .getByText("Métricas Financieras — Salud de Caja")
    .closest('[data-slot="card"]')
  if (!(card instanceof HTMLElement)) {
    throw new Error("No se encontró la tarjeta de salud de caja")
  }
  return card
}

/** El segundo `<p>` de la métrica con esa etiqueta: su valor visible. */
function valorDeMetrica(etiqueta: string): string {
  const bloque = screen.getByText(etiqueta).closest("div")
  if (!(bloque instanceof HTMLElement)) {
    throw new Error(`No se encontró la métrica «${etiqueta}»`)
  }
  const parrafos = Array.from(bloque.children).filter(
    (hijo) => hijo.tagName === "P"
  )
  return parrafos[1]?.textContent ?? ""
}

function montar(): void {
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <ReporteriaPage />
    </SWRConfig>
  )
}

beforeEach(() => {
  instalarEntornoRadix()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("Reportería — las cifras de caja salen del libro completo (T26 · S10)", () => {
  it("suma las DOS páginas de cobros y egresos, no sólo la primera", async () => {
    // Cobros: página 1 recauda 100×1000 y página 2 recauda 100×500.
    // Egresos: página 1 gasta 100×200 y página 2 gasta 50×100.
    // Si la pantalla sumara sólo la página 1: 100.000 / 20.000 / 80.000.
    const { urls } = servir({
      cobros: {
        total: 200,
        paginas: [paginaCobros(100, 1000), paginaCobros(100, 500)],
      },
      egresos: {
        total: 150,
        paginas: [paginaEgresos(100, 200), paginaEgresos(50, 100)],
      },
    })

    montar()

    await screen.findByText("Métricas Financieras — Salud de Caja")
    await waitFor(
      () => expect(valorDeMetrica("Ingresos netos")).toBe("$150.000"),
      { timeout: 5_000 }
    )
    expect(valorDeMetrica("Egresos totales")).toBe("$25.000")
    expect(valorDeMetrica("Diferencia de caja")).toBe("$125.000")
    // El termómetro también lee el libro completo (sin recurrentes: verde).
    expect(screen.getByText("Verde")).toBeTruthy()
    expect(screen.getByText("Fijos recurrentes: $0")).toBeTruthy()
    // El desglose por fondo sobre el libro completo.
    const filaFondo = within(tarjetaCaja()).getByRole("row", {
      name: /Fondo de gastos comunes/,
    })
    expect(within(filaFondo).getByText("$170.000")).toBeTruthy()
    expect(within(filaFondo).getByText("$150.000")).toBeTruthy()
    // La caminata pidió la página 2 de las dos colecciones.
    expect(
      urls.some((u) => u.startsWith("GET /api/cobros-fi") && u.includes("page=2"))
    ).toBe(true)
    expect(
      urls.some((u) => u.startsWith("GET /api/egresos-fi") && u.includes("page=2"))
    ).toBe(true)
  })

  it("mientras la colección no está completa, la tarjeta de caja no muestra números parciales", async () => {
    // `resolver` se guarda en una función ya tipada (no en `null`): TypeScript no
    // sigue la asignación hecha dentro del ejecutor del Promise, así que un
    // `let … | null = null` queda estrechado a `null` en el punto de la llamada.
    let abrirPuerta: () => void = () => {}
    const puerta = new Promise<void>((resolver) => {
      abrirPuerta = resolver
    })
    servir({
      cobros: {
        total: 200,
        paginas: [paginaCobros(100, 1000), paginaCobros(100, 500)],
      },
      egresos: { total: 100, paginas: [paginaEgresos(100, 200)] },
      // La página 2 de cobros queda retenida: la pantalla tiene la primera
      // página y el `total`, que es exactamente el estado que no debe
      // mostrarse como si fuera el total.
      retenerCobros: puerta,
    })

    montar()

    await screen.findByText("Métricas Financieras — Salud de Caja")
    await screen.findByText("Cargando el libro completo de cobros y egresos…")
    const card = tarjetaCaja()
    expect(within(card).queryByText("Ingresos netos")).toBeNull()
    expect(within(card).queryByText("Egresos totales")).toBeNull()
    expect(within(card).queryByText("$100.000")).toBeNull()

    // Completada la caminata, la tarjeta muestra los totales del libro entero.
    abrirPuerta()
    await waitFor(
      () => expect(valorDeMetrica("Ingresos netos")).toBe("$150.000"),
      { timeout: 5_000 }
    )
    expect(valorDeMetrica("Egresos totales")).toBe("$20.000")
    expect(valorDeMetrica("Diferencia de caja")).toBe("$130.000")
  })

  it("con el libro entero en una página, las cifras son las de siempre y no se pide página 2", async () => {
    const { urls } = servir({
      cobros: { total: 100, paginas: [paginaCobros(100, 700)] },
      egresos: { total: 100, paginas: [paginaEgresos(100, 200)] },
    })

    montar()

    await screen.findByText("Métricas Financieras — Salud de Caja")
    await waitFor(
      () => expect(valorDeMetrica("Ingresos netos")).toBe("$70.000"),
      { timeout: 5_000 }
    )
    expect(valorDeMetrica("Egresos totales")).toBe("$20.000")
    expect(valorDeMetrica("Diferencia de caja")).toBe("$50.000")
    // Sin estado de carga declarado: el libro ya está completo.
    expect(
      screen.queryByText("Cargando el libro completo de cobros y egresos…")
    ).toBeNull()
    // Libro completo en una página: nadie caminó páginas extra.
    expect(
      urls.some((u) => u.startsWith("GET /api/cobros-fi") && u.includes("page=2"))
    ).toBe(false)
    expect(
      urls.some((u) => u.startsWith("GET /api/egresos-fi") && u.includes("page=2"))
    ).toBe(false)
  })
})
