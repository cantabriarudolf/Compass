// @vitest-environment jsdom
/**
 * «Identidad Legal» edita el nombre de la comunidad en su fuente única (S1).
 *
 * El nombre dejó de vivir en `ConfiguracionGlobal`: la columna está deprecada
 * (2026-11-20) y la fuente es `Comunidad.nombre`. Lo que este test fija, montando la
 * pantalla real con su `useConfiguracion` y un `fetch` falso:
 *
 *   1. el campo «Nombre de la Comunidad» muestra lo que sirve la proyección de
 *      `GET /api/configuracion` (el nombre de la comunidad, no la columna vieja);
 *   2. al guardar con el nombre cambiado, el renombre viaja a
 *      `PUT /api/comunidad-actual` —el único camino de escritura, con `cf: editar`—
 *      y ANTES del guardado de la configuración;
 *   3. si el renombre falla, la pantalla avisa y NO guarda el resto: no queda un
 *      «guardado» con el nombre viejo;
 *   4. si el nombre no cambió, no hay ninguna llamada de renombre (el guardado se
 *      comporta igual que antes).
 */
import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SWRConfig } from "swr"
import ConfiguracionPage from "@/app/admin/configuracion/page"
import { configuracionDefault } from "@/data/admin/configuracion"
import { instalarEntornoRadix } from "./entorno-radix"

vi.setConfig({ testTimeout: 60_000 })

const RUTA_CONFIGURACION = "/api/configuracion"
const RUTA_COMUNIDAD_ACTUAL = "/api/comunidad-actual"

const NOMBRE_VIEJO = "Comunidad Vieja"
const NOMBRE_NUEVO = "Comunidad Nueva"

/** La fila tal como la sirve la API: el nombre ya viene proyectado de la comunidad
 *  y el firmante en su propio campo. Las dos columnas deprecadas (`administradorResponsable`,
 *  `rutAdministrador`) ya no viajan en la respuesta, así que el fixture tampoco las trae. */
const { administradorResponsable: _colDeprecada1, rutAdministrador: _colDeprecada2, ...CF_DEL_SEED } =
  configuracionDefault

const FIRMANTE = { nombre: "Rosa Firmante del Padrón", rut: "12.345.678-9" }

const CONFIGURACION = { ...CF_DEL_SEED, nombreComunidad: NOMBRE_VIEJO, firmante: FIRMANTE }

const fetchFalso = vi.fn()

function respuestaJson(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function initDe(llamada: unknown[] | undefined): RequestInit | undefined {
  return llamada?.[1] as RequestInit | undefined
}

/** Las llamadas a un método concreto sobre una ruta exacta, en orden. */
function llamadas(url: string, metodo: string): unknown[][] {
  return fetchFalso.mock.calls.filter(
    (llamada) =>
      String(llamada[0]) === url && (initDe(llamada)?.method ?? "GET") === metodo
  )
}

/** El cuerpo JSON de una llamada, o `null` si no viajó cuerpo. */
function cuerpoDe(llamada: unknown[] | undefined): Record<string, unknown> | null {
  const cuerpo = initDe(llamada)?.body
  return typeof cuerpo === "string"
    ? (JSON.parse(cuerpo) as Record<string, unknown>)
    : null
}

/** La pantalla real: lee la configuración y responde como las dos rutas. */
function servirPantalla(
  respuestaRenombre: () => Response = () =>
    respuestaJson({ data: { nombre: NOMBRE_NUEVO, logoUrl: null } }),
  configuracion: Record<string, unknown> = CONFIGURACION
): void {
  fetchFalso.mockImplementation(
    async (entrada: unknown, init?: RequestInit): Promise<Response> => {
      const url = String(entrada)
      const metodo = init?.method ?? "GET"
      if (url === RUTA_CONFIGURACION) {
        return metodo === "PUT"
          ? respuestaJson(cuerpoDe([entrada, init]) ?? configuracion)
          : respuestaJson(configuracion)
      }
      if (url === RUTA_COMUNIDAD_ACTUAL) {
        return metodo === "PUT"
          ? respuestaRenombre()
          : respuestaJson({ data: { nombre: NOMBRE_VIEJO, logoUrl: null } })
      }
      return respuestaJson({ error: "ruta no prevista" }, 404)
    }
  )
}

async function montar(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup({ delay: null })
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ConfiguracionPage />
    </SWRConfig>
  )
  await screen.findByRole("button", { name: "Guardar Cambios" })
  return user
}

/** El campo del nombre: es el que muestra la proyección de la fuente única. */
async function campoNombre(): Promise<HTMLInputElement> {
  return (await screen.findByDisplayValue(NOMBRE_VIEJO)) as HTMLInputElement
}

beforeEach(() => {
  instalarEntornoRadix()
  vi.spyOn(window, "alert").mockImplementation(() => {})
  vi.stubGlobal("fetch", fetchFalso)
})

afterEach(() => {
  cleanup()
  fetchFalso.mockReset()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("Configuración Global — Identidad Legal edita la fuente única del nombre", () => {
  it("muestra el nombre de la comunidad que sirve la API", async () => {
    servirPantalla()
    await montar()

    expect((await campoNombre()).value).toBe(NOMBRE_VIEJO)
    // No es un campo que se guarde con la configuración global: su ayuda lo dice.
    expect(
      screen.getByText(/Se guarda en la ficha de la comunidad/)
    ).toBeTruthy()
  })

  it("muestra el administrador derivado desde el campo `firmante`", async () => {
    servirPantalla()
    await montar()

    // Nombre y RUT del firmante: la pestaña los pinta del campo propio del contrato.
    expect(await screen.findByDisplayValue(FIRMANTE.nombre)).toBeTruthy()
    expect(screen.getByDisplayValue(FIRMANTE.rut)).toBeTruthy()
  })

  it("sin firmante la pestaña dice que no hay administrador designado", async () => {
    servirPantalla(undefined, { ...CONFIGURACION, firmante: null })
    await montar()

    expect(await screen.findByDisplayValue("Sin administrador designado")).toBeTruthy()
    expect(screen.getByDisplayValue("—")).toBeTruthy()
  })

  it("al guardar un nombre nuevo, el renombre va a /api/comunidad-actual ANTES de la configuración", async () => {
    servirPantalla()
    const user = await montar()

    const campo = await campoNombre()
    await user.clear(campo)
    await user.type(campo, NOMBRE_NUEVO)
    await user.click(screen.getByRole("button", { name: "Guardar Cambios" }))

    await waitFor(() =>
      expect(llamadas(RUTA_COMUNIDAD_ACTUAL, "PUT")).toHaveLength(1)
    )
    // El cuerpo es exactamente el contrato de la ruta: `{ nombre }`.
    expect(cuerpoDe(llamadas(RUTA_COMUNIDAD_ACTUAL, "PUT")[0])).toEqual({
      nombre: NOMBRE_NUEVO,
    })

    await waitFor(() =>
      expect(llamadas(RUTA_CONFIGURACION, "PUT")).toHaveLength(1)
    )
    // Primero la identidad, después el resto: si el renombre falla, no se guarda nada.
    const orden = fetchFalso.mock.calls.map(
      (llamada) => `${initDe(llamada)?.method ?? "GET"} ${String(llamada[0])}`
    )
    expect(orden.indexOf(`PUT ${RUTA_COMUNIDAD_ACTUAL}`)).toBeLessThan(
      orden.indexOf(`PUT ${RUTA_CONFIGURACION}`)
    )
  })

  it("si el renombre falla, avisa y no guarda la configuración", async () => {
    servirPantalla(() =>
      respuestaJson(
        { error: "El nombre de la comunidad es obligatorio." },
        400
      )
    )
    const user = await montar()

    const campo = await campoNombre()
    await user.clear(campo)
    await user.type(campo, NOMBRE_NUEVO)
    await user.click(screen.getByRole("button", { name: "Guardar Cambios" }))

    await waitFor(() => expect(window.alert).toHaveBeenCalled())
    expect(String((window.alert as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0])).toContain(
      "El nombre de la comunidad es obligatorio."
    )
    expect(llamadas(RUTA_CONFIGURACION, "PUT")).toHaveLength(0)
  })

  it("si el nombre no cambió, no hay llamada de renombre: el guardado es el de siempre", async () => {
    servirPantalla()
    const user = await montar()

    await user.click(screen.getByRole("button", { name: "Guardar Cambios" }))

    await waitFor(() =>
      expect(llamadas(RUTA_CONFIGURACION, "PUT")).toHaveLength(1)
    )
    expect(llamadas(RUTA_COMUNIDAD_ACTUAL, "PUT")).toHaveLength(0)
  })
})
