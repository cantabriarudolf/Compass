// @vitest-environment jsdom
/**
 * Casos de la pantalla de carga inicial (/admin/carga-inicial, ODD carga-inicial-csv U3).
 *
 * El servidor REST es falso vía `vi.stubGlobal("fetch", …)` (mismo patrón que
 * `test/componentes/pe-panels.test.tsx`, sin Radix en juego). Cada caso
 * refleja el reporte fila por fila que entrega la API:
 * `{ filas: [{ linea, accion, errores[] }], resumen: { total, validas,
 * conError, crear, actualizar, sinCambios } }`.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SWRConfig } from "swr"
import CargaInicialPage from "@/app/admin/carga-inicial/page"

/** El bloque <section> de la página lleva aria-label con el título. */
function bloque(titulo: string) {
  return within(screen.getByRole("region", { name: titulo }))
}

function archivoCsv(nombre: string, contenido: string): File {
  return new File([contenido], nombre, { type: "text/csv" })
}

function responderJson(datos: unknown, status = 200): Response {
  return new Response(JSON.stringify(datos), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function reporte(
  filas: { linea: number; accion: string; errores: string[] }[],
  resumen: {
    total: number
    validas: number
    conError: number
    crear: number
    actualizar: number
    sinCambios: number
  }
) {
  return { filas, resumen }
}

const fetchFalso = vi.fn()

/** Fondos que el servidor falso devuelve en `/api/fondos-fi` para el caso actual. */
type FondoFalso = { id: string; nombre: string; tipo: string; activo: boolean }

let fondosFalsos: FondoFalso[] = []

/**
 * Instala el fetch falso antes de cada caso como fetch global. El hook
 * `useFondosFI()` pide `{ data, page, pageSize, total }`; esa ruta se responde
 * aparte para que no cuente como llamada del importador en los casos de vista
 * previa (que miran `fetchFalso`).
 */
beforeEach(() => {
  fondosFalsos = []
  vi.stubGlobal(
    "fetch",
    (entrada: RequestInfo | URL, init?: RequestInit) => {
      if (String(entrada).startsWith("/api/fondos-fi")) {
        return Promise.resolve(
          responderJson({
            data: fondosFalsos,
            page: 1,
            pageSize: 100,
            total: fondosFalsos.length,
          })
        )
      }
      return fetchFalso(entrada, init)
    }
  )
})

afterEach(() => {
  cleanup()
  fetchFalso.mockReset()
  vi.unstubAllGlobals()
})

/**
 * Monta la página con caché SWR propia: los fondos de un caso no se heredan
 * del anterior aunque compartan la misma clave (`/api/fondos-fi?pageSize=100`).
 */
function renderizarConFondos(): ReturnType<typeof render> {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <CargaInicialPage />
    </SWRConfig>
  )
}

describe("pantalla Carga inicial", () => {
  it("lista los siete bloques con su botón de descarga apuntando a la ruta correcta", () => {
    render(<CargaInicialPage />)

    expect(screen.getByRole("region", { name: "Estructura" })).toBeTruthy()
    expect(screen.getByRole("region", { name: "Personas" })).toBeTruthy()
    expect(screen.getByRole("region", { name: "Vínculos" })).toBeTruthy()
    expect(screen.getByRole("region", { name: "Saldos de apertura" })).toBeTruthy()
    expect(screen.getByRole("region", { name: "Pagos históricos" })).toBeTruthy()

    const descargas = screen.getAllByRole("link", { name: /descargar plantilla/i })
    expect(descargas.length).toBe(7)
    expect(
      descargas.map((d) => d.getAttribute("href")).sort()
    ).toEqual([
      // La lista se compara ordenada (`sort()`), no en el orden de la pantalla.
      // Los dos de F48 son el histórico financiero y el último es la deuda a la
      // fecha de corte: los tres entran por el mismo flujo de plantilla → vista
      // previa → importar. El detalle de los pagos históricos (S4) usa el mismo
      // flujo con su propia ruta.
      "/api/importar/egresos/plantilla",
      "/api/importar/estructura/plantilla",
      "/api/importar/ingresos/plantilla",
      "/api/importar/pagos-historicos/plantilla",
      "/api/importar/personas/plantilla",
      "/api/importar/saldos/plantilla",
      "/api/importar/vinculos/plantilla",
    ])
  })

  it("vista previa con una fila con error: muestra el detalle y deshabilita Importar", async () => {
    const user = userEvent.setup()
    fetchFalso.mockResolvedValueOnce(
      responderJson(
        reporte(
          [
            {
              linea: 2,
              accion: "sin-cambios",
              errores: [
                "rol_sii: Esta fila es del ejemplo de la plantilla: reemplazala por tus datos o borrala. (línea 2)",
              ],
            },
          ],
          {
            total: 1,
            validas: 0,
            conError: 1,
            crear: 0,
            actualizar: 0,
            sinCambios: 1,
          }
        )
      )
    )
    render(<CargaInicialPage />)

    const b = bloque("Estructura")
    await user.upload(b.getByLabelText("Archivo CSV de estructura"), archivoCsv("estructura.csv", "header\nfila"))
    await user.click(b.getByRole("button", { name: /ver vista previa/i }))

    await waitFor(() => {
      expect(screen.getByText(/esta fila es del ejemplo/i)).toBeTruthy()
    })
    // La petición va al endpoint del bloque, en modo vista previa (dryRun).
    expect(fetchFalso).toHaveBeenCalledTimes(1)
    const llamada = fetchFalso.mock.calls[0] ?? []
    expect(String(llamada[0])).toBe("/api/importar/estructura?dryRun=1")
    // Importar deshabilitado mientras el reporte tenga filas con error.
    expect(b.getByRole("button", { name: "Importar" })).toBeDisabled()
  })

  it("vista previa sin errores: habilita Importar, el resumen cuenta filas a crear y la confirmación las declara", async () => {
    const user = userEvent.setup()
    fetchFalso.mockResolvedValueOnce(
      responderJson(
        reporte(
          [
            { linea: 2, accion: "crear", errores: [] },
            { linea: 3, accion: "crear", errores: [] },
          ],
          {
            total: 2,
            validas: 2,
            conError: 0,
            crear: 2,
            actualizar: 0,
            sinCambios: 0,
          }
        )
      )
    )
    render(<CargaInicialPage />)

    const b = bloque("Personas")
    await user.upload(b.getByLabelText("Archivo CSV de personas"), archivoCsv("personas.csv", "header\nfila"))
    await user.click(b.getByRole("button", { name: /ver vista previa/i }))

    await waitFor(() => {
      expect(screen.getByText(/ninguna fila tiene errores/i)).toBeTruthy()
      expect(screen.getByText(/^Crear: 2$/)).toBeTruthy()
    })
    expect(screen.getByText(/^Total: 2$/)).toBeTruthy()
    expect(screen.getByText(/^Con error: 0$/)).toBeTruthy()
    // Importar queda habilitado y la vista previa no escribió nada (dryRun).
    expect(b.getByRole("button", { name: "Importar" })).toBeEnabled()
    const llamada = fetchFalso.mock.calls[0] ?? []
    expect(String(llamada[0])).toBe("/api/importar/personas?dryRun=1")

    // La confirmación explícita declara cuántas se van a crear y actualizar.
    await user.click(b.getByRole("button", { name: "Importar" }))
    const confirmacion = screen.getByRole("alertdialog")
    
    expect(within(confirmacion).getByText(/se crearán\s*2/i)).toBeTruthy()
    expect(within(confirmacion).getByText(/actualizarán\s*0/i)).toBeTruthy()
    // Cancelar vuelve atrás: no queda confirmación ni importación lanzada.
    await user.click(within(confirmacion).getByRole("button", { name: /cancelar/i }))
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(fetchFalso).toHaveBeenCalledTimes(1)
  })

  it("vista previa que responde 403: muestra el mensaje y no habilita Importar", async () => {
    const user = userEvent.setup()
    fetchFalso.mockResolvedValueOnce(
      responderJson({ error: "Permiso denegado." }, 403)
    )
    render(<CargaInicialPage />)

    const b = bloque("Vínculos")
    await user.upload(b.getByLabelText("Archivo CSV de vínculos"), archivoCsv("vinculos.csv", "header\nfila"))
    await user.click(b.getByRole("button", { name: /ver vista previa/i }))

    await waitFor(() => {
      expect(
        screen.getByText(/no tienes permiso para usar el importador/i)
      ).toBeTruthy()
    })
    // El detalle del servidor aparece y no hay tabla de reporte.
    expect(screen.getByText(/permiso denegado/i)).toBeTruthy()
    expect(b.queryByRole("table")).toBeNull()
    expect(b.getByRole("button", { name: "Importar" })).toBeDisabled()
  })

  it("sin fondos: avisa que el importador no los crea y lleva a Finanzas", async () => {
    renderizarConFondos()

    const tarjeta = await screen.findByTestId("aviso-fondos")
    expect(tarjeta).toHaveTextContent(/todavía no hay fondos/i)
    expect(tarjeta).toHaveTextContent(/no los crea/i)
    const enlace = within(tarjeta).getByRole("link", { name: "Ir a Finanzas" })
    expect(enlace.getAttribute("href")).toBe("/finanzas/gastos-comunes")
  })

  it("con fondos: muestra cuántos hay y el nombre de cada uno", async () => {
    fondosFalsos = [
      { id: "f-gc", nombre: "Fondo de Gasto Común", tipo: "gasto_comun", activo: true },
      { id: "f-res", nombre: "Fondo de Reserva", tipo: "reserva", activo: true },
      { id: "f-am", nombre: "Fondo de Amenities", tipo: "amenities", activo: true },
    ]
    renderizarConFondos()

    const tarjeta = await screen.findByTestId("aviso-fondos")
    // La tarjeta aparece una sola vez, arriba del listado de bloques.
    expect(screen.getAllByTestId("aviso-fondos")).toHaveLength(1)
    expect(tarjeta).toHaveTextContent(/no crea fondos/i)
    expect(tarjeta).toHaveTextContent(/hoy la comunidad tiene 3:/i)
    expect(within(tarjeta).getByText("Fondo de Gasto Común")).toBeTruthy()
    expect(within(tarjeta).getByText("Fondo de Reserva")).toBeTruthy()
    expect(within(tarjeta).getByText("Fondo de Amenities")).toBeTruthy()
    const estructura = screen.getByRole("region", { name: "Estructura" })
    expect(
      tarjeta.compareDocumentPosition(estructura) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it("tarjeta de datos de la comunidad: existe, nombra los cinco campos y lleva a Configuración", () => {
    render(<CargaInicialPage />)

    const tarjeta = screen.getByTestId("aviso-datos-comunidad")
    expect(tarjeta).toHaveTextContent(/antes de cargar: los datos de la comunidad/i)
    expect(tarjeta).toHaveTextContent(/no se cargan por archivo/i)
    for (const campo of [
      "Nombre de la comunidad",
      "RUT de la comunidad",
      "Dirección oficial",
      "RUT del administrador",
      "Teléfono del administrador",
    ]) {
      expect(within(tarjeta).getByText(campo)).toBeTruthy()
    }
    const enlace = within(tarjeta).getByRole("link", {
      name: "Ir a Configuración",
    })
    expect(enlace.getAttribute("href")).toBe("/admin/configuracion")
    // La tarjeta va arriba de los bloques: se lee antes de elegir un archivo.
    const estructura = screen.getByRole("region", { name: "Estructura" })
    expect(
      tarjeta.compareDocumentPosition(estructura) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it("el orden de carga es el que el sistema necesita, no uno recomendado", () => {
    render(<CargaInicialPage />)

    const orden = screen.getByTestId("orden-carga")
    expect(orden).toHaveTextContent(/este no es un orden sugerido/i)
    expect(orden).toHaveTextContent(/orden que el sistema necesita/i)
    expect(orden).toHaveTextContent(
      /estructura → personas → vínculos → egresos e ingresos → saldos de apertura/i
    )
    expect(orden).toHaveTextContent(
      /emití el gasto común del período antes de subir los pagos históricos/i
    )
    expect(document.body).not.toHaveTextContent(/orden recomendado/i)
  })

  it("con un fondo inactivo: lo marca al lado del nombre", async () => {
    fondosFalsos = [
      { id: "f-res", nombre: "Fondo de Reserva", tipo: "reserva", activo: false },
    ]
    renderizarConFondos()

    const tarjeta = await screen.findByTestId("aviso-fondos")
    expect(
      within(tarjeta).getByText("Fondo de Reserva (inactivo)")
    ).toBeTruthy()
  })
})
