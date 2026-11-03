// @vitest-environment jsdom
/**
 * `use-ir` / `use-mt` — la opción `todasLasPaginas` es aditiva.
 *
 * Las pantallas de recursos y proyectos ahora completan su colección pidiendo las páginas que
 * faltan. La opción se agregó a los hooks, así que este caso fija las dos mitades:
 *
 * 1. quien llama SIN opciones pide exactamente la misma URL de siempre
 *    (`?pageSize=100`, una sola petición, sin `&page=`), así que los consumidores que ya existían
 *    no cambian de caché ni de petición;
 * 2. con `todasLasPaginas: true` la colección se completa con la MISMA paginación del servidor.
 *
 * Sin el arreglo, el caso 2 no existe (la opción no se conoce) y el caso 1 no puede fallar por
 * construcción: queda como candado contra una futura opción que se cuele en la URL por defecto.
 */
import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import { useRecursosIR, useSolicitudesInsumoIR } from "@/lib/api/use-ir"
import { useProyectosMT, useTrabajosMT } from "@/lib/api/use-mt"
import {
  estadoVacio,
  instalarApiIrMt,
  recurso,
  trabajo,
  type ApiIrMt,
  type EstadoApiIrMt,
} from "./api-ir-mt-falsa"

let api: ApiIrMt

/** Presupuesto de carga: varias colecciones SWR por pantalla. */
const PRESUPUESTO_CARGA = 60_000

/** 105 recursos y 105 trabajos: dos páginas del servidor en cada colección. */
function estadoConDosPaginas(): EstadoApiIrMt {
  const estado = estadoVacio()
  for (let i = 1; i <= 105; i++) {
    estado.recursos.push(recurso(`ir-${i}`, `QA-REC-${i}`, "insumo"))
    estado.trabajos.push(trabajo(`mt-${i}`, `MT-QA-${i}`, `QA-TRA-${i}`))
  }
  return estado
}

beforeEach(() => {
  api = instalarApiIrMt(estadoConDosPaginas())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderSondas(sondas: React.ReactNode) {
  return render(<SWRConfig value={{ provider: () => new Map() }}>{sondas}</SWRConfig>)
}

/** Sonda de cada hook, con o sin la opción nueva según el caso. */
function Sondas({ todasLasPaginas }: { todasLasPaginas: boolean }) {
  const opciones = todasLasPaginas ? { todasLasPaginas: true } : undefined
  const recursos = useRecursosIR(opciones)
  const solicitudes = useSolicitudesInsumoIR(opciones)
  const trabajos = useTrabajosMT(opciones)
  const proyectos = useProyectosMT(opciones)
  return (
    <ul>
      <li data-testid="recursos">{recursos.items.length}</li>
      <li data-testid="solicitudes">{solicitudes.items.length}</li>
      <li data-testid="trabajos">{trabajos.items.length}</li>
      <li data-testid="proyectos">{proyectos.items.length}</li>
    </ul>
  )
}

describe("use-ir / use-mt — opción aditiva", () => {
  it("sin opciones pide exactamente las URLs de siempre, una sola vez", { timeout: PRESUPUESTO_CARGA }, async () => {
    renderSondas(<Sondas todasLasPaginas={false} />)

    await waitFor(() => expect(api.peticiones.length).toBeGreaterThanOrEqual(4))

    // Orden de llegada indiferente; lo que importa es el conjunto exacto de peticiones.
    expect([...api.peticiones].sort()).toEqual([
      "/api/ir/recursos?pageSize=100",
      "/api/ir/solicitudes-insumo?pageSize=100",
      "/api/mt/proyectos?pageSize=100",
      "/api/mt/trabajos?pageSize=100",
    ])
    expect(api.peticiones.some((url) => url.includes("page="))).toBe(false)
  })

  it("con todasLasPaginas completa la colección con la paginación del servidor", { timeout: PRESUPUESTO_CARGA }, async () => {
    renderSondas(<Sondas todasLasPaginas />)

    await waitFor(() => expect(screen.getByTestId("recursos")).toHaveTextContent("105"), {
      timeout: 5_000,
    })
    expect(screen.getByTestId("trabajos")).toHaveTextContent("105")
    expect(api.peticiones).toContain("/api/ir/recursos?pageSize=100&page=2")
    expect(api.peticiones).toContain("/api/mt/trabajos?pageSize=100&page=2")
  })
})
