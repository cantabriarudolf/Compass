// @vitest-environment jsdom
/**
 * Mantenimiento y Proyectos — el tablero preventivo y la tabla ven el padrón completo.
 *
 * Defecto medido: `/inventario/proyectos` pedía UNA página (`GET /api/mt/trabajos?pageSize=100`,
 * orden `createdAt` descendente) y después filtraba ese arreglo en el navegador para armar los
 * «Próximos vencimientos de mantención obligatoria». Un ciclo preventivo fuera de esas 100 filas
 * no aparecía nunca: la pestaña decía «Sin mantenciones preventivas programadas.» con las
 * mantenciones obligatorias existiendo en la base.
 *
 * `/api/mt/trabajos` NO acepta `?q=` y su GET es además el que resuelve las garantías al leer, así
 * que el arreglo no toca la ruta: completa la colección con la MISMA paginación del servidor
 * (`&page=2`), igual que `/inventario/tipos` con el padrón de unidades.
 *
 * La semilla pone los 5 preventivos entre los MÁS VIEJOS, fuera de la página 1: con el
 * comportamiento anterior este caso falla por construcción.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SWRConfig } from "swr"
import { instalarEntornoRadix } from "./entorno-radix"
import {
  estadoVacio,
  instalarApiIrMt,
  recurso,
  trabajo,
  type ApiIrMt,
  type EstadoApiIrMt,
} from "./api-ir-mt-falsa"
import ProyectosPage from "@/app/inventario/proyectos/page"

let api: ApiIrMt

/** Presupuesto de carga: varias colecciones SWR por pantalla. */
const PRESUPUESTO_CARGA = 60_000

/**
 * 105 trabajos: los 5 preventivos son los más viejos, los 100 sin ciclo los más nuevos. El
 * servidor ordena por `createdAt` descendente, así que la página 1 no trae ningún preventivo.
 * Los 5 recursos de infraestructura del selector «Equipo crítico» son igual de viejos dentro de
 * su propio catálogo (105 recursos), así que también caen fuera de la página 1.
 */
function estadoConFilasFueraDeLaPagina(): EstadoApiIrMt {
  const estado = estadoVacio()
  for (let i = 1; i <= 5; i++) {
    estado.trabajos.push(
      trabajo(`mt-prev-${i}`, `MT-QA-0${i}`, `QA-PREV-0${i}`, {
        preventivo: { periodicidadMeses: 1 },
        fechaProgramada: `2026-0${i}-15`,
      })
    )
    estado.recursos.push(recurso(`ir-equipo-${i}`, `QA-EQUIPO-0${i}`, "infraestructura"))
  }
  for (let i = 1; i <= 100; i++) {
    estado.trabajos.push(
      trabajo(`mt-trab-${i}`, `MT-QA-1${String(i).padStart(2, "0")}`, `QA-TRAB-${String(i).padStart(3, "0")}`)
    )
    estado.recursos.push(recurso(`ir-ins-${i}`, `QA-INS-${String(i).padStart(3, "0")}`, "insumo"))
  }
  return estado
}

beforeEach(() => {
  instalarEntornoRadix()
  api = instalarApiIrMt(estadoConFilasFueraDeLaPagina())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Cache SWR fresco por render: un caso no hereda las filas del anterior. */
function renderPagina() {
  return render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <ProyectosPage />
    </SWRConfig>
  )
}

/** La pantalla cargó: la tabla de trabajos ya tiene su primera fila. */
async function esperarTrabajos(): Promise<void> {
  await screen.findByText("QA-TRAB-001", {}, { timeout: 5_000 })
}

describe("Mantenimiento y Proyectos — padrón completo", () => {
  it("el tablero preventivo muestra los ciclos que viven fuera de la primera página", { timeout: PRESUPUESTO_CARGA }, async () => {
    const user = userEvent.setup({ delay: null })
    renderPagina()
    await esperarTrabajos()

    await user.click(screen.getByRole("tab", { name: /prevención/i }))

    // Antes: «Sin mantenciones preventivas programadas.» — los cinco ciclos eran inalcanzables.
    await waitFor(() => expect(screen.getByText(/QA-PREV-01/)).toBeInTheDocument(), {
      timeout: 5_000,
    })
    expect(screen.getByText(/QA-PREV-05/)).toBeInTheDocument()
    expect(screen.queryByText("Sin mantenciones preventivas programadas.")).toBeNull()

    // La colección se completó con la paginación del servidor, no con un `pageSize` más grande.
    expect(api.peticiones).toContain("/api/mt/trabajos?pageSize=100&page=2")
  })

  it("la tabla de trabajos pagina sobre el padrón completo, no sobre la primera página", { timeout: PRESUPUESTO_CARGA }, async () => {
    const user = userEvent.setup({ delay: null })
    renderPagina()
    await esperarTrabajos()

    // El pie declara el total del servidor: 105 trabajos, de los cuales la tabla muestra 20.
    expect(screen.getByText(/105 trabajos en total/)).toBeInTheDocument()
    expect(screen.getByText(/Página 1 de 6/)).toBeInTheDocument()

    // La segunda página de la tabla trae filas que la página 1 del servidor no tenía.
    await user.click(screen.getByRole("button", { name: "Siguiente" }))
    await waitFor(() => expect(screen.getByText("QA-TRAB-030")).toBeInTheDocument(), {
      timeout: 5_000,
    })
  })

  it("el selector de equipo crítico ofrece los recursos que viven fuera de la primera página", async () => {
    const user = userEvent.setup({ delay: null })
    renderPagina()
    await esperarTrabajos()

    await user.click(screen.getByRole("button", { name: /nuevo trabajo/i }))
    const dialogo = await screen.findByRole("dialog")

    // Los combos del diálogo, en orden de lectura; el tercero es «Equipo crítico del catálogo IR».
    const combos = within(dialogo).getAllByRole("combobox")
    await user.click(combos[2]!)

    // El catálogo IR también se completa por páginas: los 5 equipos de infraestructura son viejos
    // y sobre la primera página el selector no ofrecía ninguno.
    const listbox = await screen.findByRole("listbox", {}, { timeout: 5_000 })
    expect(within(listbox).getByRole("option", { name: /QA-EQUIPO-01/ })).toBeInTheDocument()
    expect(within(listbox).getByRole("option", { name: /QA-EQUIPO-05/ })).toBeInTheDocument()
    expect(api.peticiones).toContain("/api/ir/recursos?pageSize=100&page=2")
  })
})
