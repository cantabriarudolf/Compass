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

/** Instala el fetch falso antes de cada caso como fetch global. */
beforeEach(() => {
  vi.stubGlobal("fetch", fetchFalso)
})

afterEach(() => {
  cleanup()
  fetchFalso.mockReset()
  vi.unstubAllGlobals()
})

describe("pantalla Carga inicial", () => {
  it("lista los tres bloques con su botón de descarga apuntando a la ruta correcta", () => {
    render(<CargaInicialPage />)

    expect(screen.getByRole("region", { name: "Estructura" })).toBeTruthy()
    expect(screen.getByRole("region", { name: "Personas" })).toBeTruthy()
    expect(screen.getByRole("region", { name: "Vínculos" })).toBeTruthy()

    const descargas = screen.getAllByRole("link", { name: /descargar plantilla/i })
    expect(descargas.length).toBe(3)
    expect(
      descargas.map((d) => d.getAttribute("href")).sort()
    ).toEqual([
      "/api/importar/estructura/plantilla",
      "/api/importar/personas/plantilla",
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
})
