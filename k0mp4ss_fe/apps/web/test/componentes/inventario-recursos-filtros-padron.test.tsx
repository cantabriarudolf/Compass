// @vitest-environment jsdom
/**
 * Recursos y EPP — el filtro del catálogo ve el padrón completo.
 *
 * Defecto medido: `/inventario/recursos` pedía UNA página (`GET /api/ir/recursos?pageSize=100`,
 * orden `createdAt` descendente) y después filtraba ese arreglo en el navegador por naturaleza y
 * por estado. Todo recurso fuera de las 100 filas más nuevas era inalcanzable: elegir «EPP /
 * Uniforme» no mostraba un solo EPP si los EPP eran viejos. La alarma de reposición, las llaves no
 * devueltas y los selectores de insumo/EPP de los diálogos se calculaban sobre esa misma página.
 *
 * `/api/ir/recursos` NO acepta `?q=` (su ruta no declara `busqueda` en `createCrudHandlers`), así
 * que el arreglo es el de `/inventario/tipos`: completar la colección con la MISMA paginación del
 * servidor (`&page=2`). La semilla pone los 5 EPP entre los MÁS VIEJOS, fuera de la página 1.
 *
 * Con el servidor falso de `api-ir-mt-falsa.ts` este caso falla contra el comportamiento anterior
 * por construcción: sin la segunda página, el filtro por naturaleza no encuentra nada y el catálogo
 * responde «Sin recursos para este filtro.».
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
  type ApiIrMt,
  type EstadoApiIrMt,
} from "./api-ir-mt-falsa"
import RecursosPage from "@/app/inventario/recursos/page"

let api: ApiIrMt

/** Presupuesto de carga: varias colecciones SWR por pantalla. */
const PRESUPUESTO_CARGA = 60_000

/**
 * 105 recursos: los 5 EPP son los más viejos (y críticos), los 100 insumos los más nuevos. El
 * servidor ordena por `createdAt` descendente, así que la página 1 trae solo insumos.
 */
function estadoConEppFueraDeLaPagina(): EstadoApiIrMt {
  const estado = estadoVacio()
  for (let i = 1; i <= 5; i++) {
    estado.recursos.push(
      recurso(`ir-epp-${i}`, `QA-EPP-0${i}`, "epp", { stock: 3, esCritico: true, umbralCritico: 5 })
    )
  }
  for (let i = 1; i <= 100; i++) {
    estado.recursos.push(recurso(`ir-ins-${i}`, `QA-INS-${String(i).padStart(3, "0")}`, "insumo"))
  }
  return estado
}

beforeEach(() => {
  instalarEntornoRadix()
  api = instalarApiIrMt(estadoConEppFueraDeLaPagina())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Cache SWR fresco por render: un caso no hereda las filas del anterior. */
function renderPagina() {
  return render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <RecursosPage />
    </SWRConfig>
  )
}

/** El catálogo cargó: la primera fila visible es la más nueva de la página 1. */
async function esperarCatalogo(): Promise<HTMLElement> {
  const tabla = await screen.findByRole("table")
  await waitFor(() => expect(within(tabla).getByText(/QA-INS-100/)).toBeInTheDocument(), {
    timeout: 5_000,
  })
  return tabla
}

/** Abre el Select de naturaleza y elige la categoría pedida (Radix). */
async function filtrarPorCategoria(nombre: string): Promise<void> {
  const user = userEvent.setup({ delay: null })
  await user.click(screen.getByLabelText("Filtrar por categoría"))
  const listbox = await screen.findByRole("listbox", {}, { timeout: 5_000 })
  await user.click(within(listbox).getByRole("option", { name: nombre }))
}

describe("Recursos y EPP — catálogo sobre el padrón completo", () => {
  it("encuentra por naturaleza los EPP que viven fuera de la primera página", { timeout: PRESUPUESTO_CARGA }, async () => {
    renderPagina()
    const tabla = await esperarCatalogo()

    // La página 1 del servidor no trae un solo EPP, y así lo declara el pie: el padrón es más
    // grande que lo cargado.
    expect(within(tabla).queryByText(/QA-EPP-0/)).toBeNull()
    expect(screen.getByText(/el padrón tiene 105/)).toBeInTheDocument()

    await filtrarPorCategoria("EPP / Uniforme")

    // Antes: «Sin recursos para este filtro.» — los cinco EPP eran inalcanzables.
    const catalogo = await screen.findByRole("table")
    await waitFor(() => expect(within(catalogo).getByText(/QA-EPP-01/)).toBeInTheDocument(), {
      timeout: 5_000,
    })
    expect(within(catalogo).getByText(/QA-EPP-05/)).toBeInTheDocument()
    expect(screen.queryByText("Sin recursos para este filtro.")).toBeNull()

    // La colección se completó con la paginación del servidor, no con un `pageSize` más grande.
    expect(api.peticiones).toContain("/api/ir/recursos?pageSize=100&page=2")
  })

  it("la alarma de reposición cuenta el padrón completo, no la primera página", { timeout: PRESUPUESTO_CARGA }, async () => {
    renderPagina()
    await esperarCatalogo()

    // Los cinco recursos críticos bajo umbral son los EPP más viejos: sin la página 2 la alarma
    // ni siquiera aparecía.
    await waitFor(() =>
      expect(screen.getByText(/Alarma de reposición \(5\)/)).toBeInTheDocument(), {
        timeout: 5_000,
      }
    )
    expect(screen.getByText(/QA-EPP-01: 3 ≤ umbral 5/)).toBeInTheDocument()
  })
})
