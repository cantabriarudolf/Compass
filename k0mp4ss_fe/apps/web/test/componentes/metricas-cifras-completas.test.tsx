// @vitest-environment jsdom
/**
 * CIFRAS de `/admin/metricas` sobre el padrón completo — F38/F40, lote «cerrar
 * el techo de 100», T6 (S3: la cifra no baja con más de cien filas).
 *
 * `app/admin/metricas/page.tsx` monta `useUnidades()` sin opciones: la lista
 * llega con `pageSize=100` y de ella se derivan, como TOTALES, la recaudación
 * mensual (reduce del `montoBaseGc` del tipo de unidad), la superficie
 * habitacional, los servicios monitoreados y el conteo «Unidades Registradas».
 * Con más de cien unidades las cuatro cifras presentan la página 1 como el
 * universo: la recaudación proyectada del módulo TU miente.
 *
 * La palanca ya existe: `{ todasLasPaginas: true }` en `useUnidades` (universo
 * acotado: las unidades de una comunidad). Este caso monta el hook REAL y
 * sustituye solo la capa de red (mismo arnés que `multas-padron-completo`):
 * `/api/unidades` responde `?pageSize=100` con `?page=N` respetado. Los
 * agregados que el servidor ya deriva fuera (KPI de vigencia, titularidad,
 * maestros, emisiones GC) se reemplazan por fakes fijos: no son la cifra bajo
 * prueba y su recorte no pasa por acá.
 */
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SWRConfig } from "swr"
import { cleanup, render, screen, waitFor } from "@testing-library/react"

vi.mock("@/app/admin/metricas/use-kpi-vigencia", () => ({
  useKpiVigencia: () => ({ kpi: null, isLoading: false, error: null }),
}))
vi.mock("@/app/admin/metricas/use-titularidad", () => ({
  useTitularidad: () => ({
    titularidad: {
      sinTitular: 0,
      nuncaDeclarado: 0,
      vinculoCerradoSinReemplazo: 0,
      unidades: [],
    },
    isLoading: false,
    error: null,
  }),
}))
vi.mock("@/lib/api/use-maestros", () => ({
  useMaestros: () => ({
    data: [],
    isLoading: false,
    error: null,
    create: vi.fn(async () => ({ ok: true })),
    update: vi.fn(async () => ({ ok: true })),
    remove: vi.fn(async () => ({ ok: true })),
    ocultar: vi.fn(async () => ({ ok: true })),
  }),
}))
vi.mock("@/lib/api/use-emisiones-gc", () => ({
  useEmisionesGC: () => ({ items: [], isLoading: false, error: null }),
}))

import MetricasPage from "@/app/admin/metricas/page"

vi.setConfig({ testTimeout: 60_000 })

interface UnidadFalsa {
  id: string
  numero: string
  tipoUnidadId: string
  metraje: number
  servicios: { agua: boolean; luz: boolean; gas: boolean }
}

interface TipoUnidadFalsa {
  id: string
  nombre: string
  montoBaseGc: number
}

interface EstadoMetricas {
  unidades: UnidadFalsa[]
  tipos: TipoUnidadFalsa[]
}

/** Montos que varían entre páginas: que la recaudación de la página 1 NO se lea como la del universo. */
const TIPO_PLENO: TipoUnidadFalsa = { id: "tu-pleno", nombre: "Depto pleno", montoBaseGc: 1_000 }
const TIPO_ECO: TipoUnidadFalsa = { id: "tu-eco", nombre: "Depto eco", montoBaseGc: 700 }

/**
 * Unidades de una comunidad repartidas en TRES páginas de `pageSize` 100:
 *
 * - página 1: cien del tipo pleno, 40 m², los tres servicios  → 100×1000 · 4000 m² · 300
 * - página 2: cien del tipo eco,   50 m², sólo agua           → 100×700  · 5000 m² · 100
 * - página 3: cinco del tipo pleno, 60 m², agua y luz         →   5×1000 ·  300 m² ·  10
 *
 * Universo completo: $175.000 · 9.300 m² · 410 servicios · 205 unidades.
 * Con la página 1 sola: $100.000 · 4.000 m² · 300 servicios · 100 unidades.
 */
function estadoTresPaginas(): EstadoMetricas {
  const unidad = (i: number, indecePagina: number): UnidadFalsa => ({
    id: `u-${String(i).padStart(3, "0")}`,
    numero: String(i),
    tipoUnidadId: indecePagina === 2 ? TIPO_ECO.id : TIPO_PLENO.id,
    metraje: indecePagina === 2 ? 50 : indecePagina === 3 ? 60 : 40,
    servicios:
      indecePagina === 2
        ? { agua: true, luz: false, gas: false }
        : indecePagina === 3
          ? { agua: true, luz: true, gas: false }
          : { agua: true, luz: true, gas: true },
  })
  const unidades: UnidadFalsa[] = []
  for (let i = 1; i <= 100; i++) unidades.push(unidad(i, 1))
  for (let i = 101; i <= 200; i++) unidades.push(unidad(i, 2))
  for (let i = 201; i <= 205; i++) unidades.push(unidad(i, 3))
  return { unidades, tipos: [TIPO_PLENO, TIPO_ECO] }
}

function respuestaJson(datos: unknown, status = 200): Response {
  return new Response(JSON.stringify(datos), {
    status,
    headers: { "content-type": "application/json" },
  })
}

/** Página con el mismo envelope y el mismo tope de `pageSize` que el servidor. */
function paginar(
  filas: unknown[],
  url: URL
): { data: unknown[]; page: number; pageSize: number; total: number } {
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1)
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(url.searchParams.get("pageSize") ?? "100", 10) || 100)
  )
  const desde = (page - 1) * pageSize
  return { data: filas.slice(desde, desde + pageSize), page, pageSize, total: filas.length }
}

/** Instala el servidor falso. Limpiar con `vi.unstubAllGlobals()`. */
function instalarApi(estado: EstadoMetricas): { peticiones: string[] } {
  const peticiones: string[] = []
  vi.stubGlobal(
    "fetch",
    async (entrada: RequestInfo | URL): Promise<Response> => {
      const crudo =
        typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url
      peticiones.push(crudo)
      const url = new URL(crudo, "http://localhost")
      if (url.pathname === "/api/unidades") return respuestaJson(paginar(estado.unidades, url))
      if (url.pathname === "/api/tipos-unidad") return respuestaJson(paginar(estado.tipos, url))
      // Cualquier otra ruta es un contrato que el falso no declaró: 404 a la vista.
      return respuestaJson({ error: `ruta no servida por el falso: ${url.pathname}` }, 404)
    }
  )
  return { peticiones }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** SWR con caché fresca por render: un caso no hereda las filas del anterior. */
function renderPagina(nodo: React.ReactElement): void {
  render(<SWRConfig value={{ provider: () => new Map() }}>{nodo}</SWRConfig>)
}

/** El valor del ModuleMetric cuyo rótulo se indica (estructura: rótulo, valor, sub). */
function valorDeMetrica(etiqueta: string): string {
  const rotulo = screen.getByText(etiqueta)
  const tarjeta = rotulo.parentElement
  if (!tarjeta) throw new Error(`la métrica «${etiqueta}» no tiene contenedor`)
  return tarjeta.children[1]?.textContent ?? ""
}

describe("admin/metricas — las cifras no bajan con más de cien unidades", () => {
  it("recaudación, superficie, servicios y conteo suman el padrón completo de tres páginas", async () => {
    const api = instalarApi(estadoTresPaginas())
    renderPagina(<MetricasPage />)

    await screen.findByText("Recaudación Mensual")

    // El conteo «Unidades Registradas» sólo llega a 205 cuando la última página
    // aterrizó: al esperar ese valor se evita carrerear contra la caminata de
    // páginas y las tres cifras se leen de la MISMA renderización completa.
    await waitFor(() => expect(valorDeMetrica("Unidades Registradas")).toBe("205"))

    expect(valorDeMetrica("Recaudación Mensual")).toBe("$175.000")
    expect(valorDeMetrica("Superficie Habitacional")).toBe("9.300 m²")
    expect(valorDeMetrica("Servicios Monitoreados")).toBe("410")

    // Las páginas 2 y 3 del padrón se caminaron con la paginación real.
    expect(
      api.peticiones.some((p) => p === "/api/unidades?pageSize=100&page=2")
    ).toBe(true)
    expect(
      api.peticiones.some((p) => p === "/api/unidades?pageSize=100&page=3")
    ).toBe(true)
  })

  it("con el padrón en una sola página nada cambia y no se piden páginas extra", async () => {
    const unidades: UnidadFalsa[] = [
      { id: "u-1", numero: "1", tipoUnidadId: TIPO_PLENO.id, metraje: 40, servicios: { agua: true, luz: true, gas: true } },
      { id: "u-2", numero: "2", tipoUnidadId: TIPO_ECO.id, metraje: 50, servicios: { agua: true, luz: false, gas: false } },
    ]
    const api = instalarApi({ unidades, tipos: [TIPO_PLENO, TIPO_ECO] })
    renderPagina(<MetricasPage />)

    expect(await screen.findByText("Recaudación Mensual")).toBeTruthy()
    expect(valorDeMetrica("Recaudación Mensual")).toBe("$1.700")
    expect(valorDeMetrica("Unidades Registradas")).toBe("2")
    // Todo cabe en una página: ningún intento de caminar más allá.
    expect(api.peticiones.some((p) => p.includes("&page=2"))).toBe(false)
  })
})
