// @vitest-environment jsdom
/**
 * Entregas de EPP — la pestaña deja de mirar solo la primera página.
 *
 * Defecto medido: `useEntregasEPP()` pedía UNA página (`GET /api/ir/entregas-epp?pageSize=100`,
 * orden `createdAt` descendente) y la pestaña EPP pintaba ese arreglo como si fuera la colección
 * completa. Como la pestaña no filtra ni cuenta, el recorte era mudo: con 101 entregas se veían
 * 100 y nada en pantalla decía que existía una más.
 *
 * `/api/ir/entregas-epp` sí pagina (`createCrudHandlers` acepta `page`/`pageSize` y devuelve
 * `total`), así que el arreglo es el de los listados que solo listan (`/personas/residentes`):
 * el control `VerMas` declara el total del servidor y pide la página siguiente con la MISMA
 * paginación del servidor (`&page=2`).
 *
 * Con el servidor falso de `api-ir-mt-falsa.ts` este caso falla contra el comportamiento anterior
 * por construcción: sin el control no existe «Mostrando 100 de 101» ni botón «Ver más», así que la
 * entrega más vieja (la 101, fuera de la página 1) es inalcanzable desde la pestaña.
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
  type ApiIrMt,
  type EstadoApiIrMt,
} from "./api-ir-mt-falsa"
import type { EntregaEPP } from "@/lib/schemas"
import { useEntregasEPP } from "@/lib/api/use-ir"
import RecursosPage from "@/app/inventario/recursos/page"

let api: ApiIrMt

/** Presupuesto de carga: varias colecciones SWR por pantalla. */
const PRESUPUESTO_CARGA = 60_000

/** Tope de `pageSize` de `createCrudHandlers`: una página son 100 filas. */
const FILAS_POR_PAGINA = 100

function entrega(id: string): EntregaEPP {
  return {
    id,
    recursoId: `QA-E-${id.slice(-3)}`,
    personaId: `QA-P-${id.slice(-3)}`,
    fechaEntrega: "2026-01-01",
    talla: "M",
    estado: "nuevo",
    proximaRenovacion: "2027-01-01",
  }
}

/**
 * 101 entregas. La semilla va en orden `createdAt` ASCENDENTE porque el servidor las sirve al
 * revés: la más vieja (`QA-EEPP-001`) es justo la que queda fuera de la página 1.
 */
function estadoConEntregaFueraDeLaPagina(): EstadoApiIrMt {
  const estado = estadoVacio()
  for (let i = 1; i <= FILAS_POR_PAGINA + 1; i++) {
    estado.entregas.push(entrega(`QA-EEPP-${String(i).padStart(3, "0")}`))
  }
  return estado
}

beforeEach(() => {
  instalarEntornoRadix()
  api = instalarApiIrMt(estadoConEntregaFueraDeLaPagina())
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

/** Abre la pestaña EPP y espera la tabla con la primera página ya cargada. */
async function abrirPestanaEpp(): Promise<HTMLElement> {
  const user = userEvent.setup({ delay: null })
  // La pantalla pinta un esqueleto mientras carga las colecciones: la pestaña aparece después.
  const pestana = await screen.findByRole("tab", { name: "EPP" }, { timeout: 10_000 })
  await user.click(pestana)
  const tabla = await screen.findByRole("table", {}, { timeout: 10_000 })
  await waitFor(
    () => expect(within(tabla).getByText("QA-E-101")).toBeInTheDocument(),
    { timeout: 5_000 }
  )
  return tabla
}

describe("Entregas de EPP — paginación real contra el total del servidor", () => {
  it("declara el total y alcanza la entrega que queda fuera de la primera página", { timeout: PRESUPUESTO_CARGA }, async () => {
    renderPagina()
    const tabla = await abrirPestanaEpp()

    // La página 1 del servidor son 100 de 101 filas, y la pestaña lo dice: antes no decía nada.
    expect(within(tabla).getByText("QA-E-101")).toBeInTheDocument()
    expect(within(tabla).queryByText("QA-E-001")).toBeNull()
    expect(screen.getByText(`Mostrando ${FILAS_POR_PAGINA} de ${FILAS_POR_PAGINA + 1}`)).toBeInTheDocument()

    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: /ver más/i }))

    // La fila 101 era inalcanzable: ahora aparece con la MISMA paginación del servidor.
    await waitFor(
      () => expect(within(screen.getByRole("table")).getByText("QA-E-001")).toBeInTheDocument(),
      { timeout: 5_000 }
    )
    expect(api.peticiones).toContain(`/api/ir/entregas-epp?pageSize=100&page=2`)
    // Ya no queda nada oculto: el control deja de ofrecer más.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /ver más/i })).toBeNull()
    )
  })
})

/** Sonda del hook: solo interesa la petición que emite. */
function SondaEntregas() {
  const { items } = useEntregasEPP()
  return <span data-testid="entregas">{items.length}</span>
}

describe("useEntregasEPP — contrato de la petición sin opciones", () => {
  it("quien llama sin opciones pide exactamente la URL de siempre, una sola vez", { timeout: PRESUPUESTO_CARGA }, async () => {
    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <SondaEntregas />
      </SWRConfig>
    )

    await waitFor(() => expect(screen.getByTestId("entregas")).toHaveTextContent("100"))

    // Url y número de peticiones idénticos a los de antes del arreglo: sin `&page=`, sin extras.
    expect(api.peticiones).toEqual(["/api/ir/entregas-epp?pageSize=100"])
  })
})
