// @vitest-environment jsdom
/**
 * Pantalla de vigencia del Registro de Copropietarios (serie «Vigencia del
 * Registro», T6 · S2 y S8).
 *
 * Las cuatro rutas existían y nadie podía usarlas sin curl. Lo que este test
 * fija de la pantalla que las pone en la cara:
 *
 *   1. pinta UNA fila por unidad con el estado que devolvió el servidor (no lo
 *      calcula el navegador), su descripción, la fecha de cambio y los días que
 *      faltan, y el resumen por estado arriba — con los estados en cero
 *      visibles, porque el vacío también informa;
 *   2. las acciones de la fila siguen al estado: se ofrece «Requerir» sólo
 *      cuando el calendario lo pide y no hay ciclo abierto (con uno abierto el
 *      servidor responde 409, y un botón condenado miente sobre el estado), y
 *      «Revalidar» está siempre —revalidar una unidad al día es legítimo (S3) —;
 *   3. cada acción llama a SU ruta con el cuerpo que el esquema del servidor
 *      exige (`fundamento` en requerimiento, `detalle` en revalidación) y, si
 *      sale bien, vuelve a leer el listado: el veredicto es del servidor;
 *   4. un 409 del segundo requerimiento se muestra con el texto de la API, tal
 *      cual, y la pantalla no declara un éxito que no ocurrió;
 *   5. «Emitir avisos» es el barrido de S8, sin cuerpo, y la pantalla muestra
 *      los números que el servidor informó, no unos inventados;
 *   6. una comunidad sin unidades lo dice explícitamente en vez de pintar filas
 *      falsas, y un error de lectura se muestra con el mensaje de la API;
 *   7. el portón de la pantalla es el de la matriz (`ad` con `editar` para
 *      entrar y `crear` para requerir), no una lista de roles copiada.
 *
 * Se monta la consola (no el `page.tsx`) porque la página es un server component
 * `async` que espera `auth()` y no se puede montar en jsdom; lo único que decide
 * es el portón y pasar el permiso de requerir, así que el caso de permisos se
 * afirma con la matriz real (`puede`), igual que en `archivo-documentos`.
 *
 * El servidor REST es falso vía `vi.stubGlobal("fetch", …)`, el mismo patrón de
 * `test/componentes/carga-inicial.test.tsx`; `instalarEntornoRadix()` es el que
 * usan los tests que abren un `Dialog` de Radix.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { instalarEntornoRadix } from "./entorno-radix"
import { ConsolaVigenciaRegistro } from "@/app/admin/gestion/vigencia-registro/_componentes/vigencia-registro"
import {
  puedeAdministrarVigencia,
  puedeRequerirVigencia,
} from "@/app/admin/gestion/vigencia-registro/alcance"

// Mismo piso que el resto de los tests de componentes: los casos que abren un
// diálogo Radix rozan los 5 s (el default de Vitest) en una máquina cargada.
vi.setConfig({ testTimeout: 60_000 })

const RUTA_LISTA = "/api/vigencia-registro"
const RUTA_REQUERIMIENTO = "/api/vigencia-registro/requerimiento"
const RUTA_REVALIDACION = "/api/vigencia-registro/revalidacion"
const RUTA_AVISOS = "/api/vigencia-registro/avisos"

const fetchFalso = vi.fn()

function respuestaJson(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "content-type": "application/json" },
  })
}

/** Las llamadas hechas a una ruta, en orden. */
function llamadas(url: string): unknown[][] {
  return fetchFalso.mock.calls.filter((llamada) => String(llamada[0]) === url)
}

/** El cuerpo JSON de una llamada, o `null` si no viajó cuerpo. */
function cuerpoDe(llamada: unknown[] | undefined): unknown {
  const init = llamada?.[1] as RequestInit | undefined
  return typeof init?.body === "string" ? JSON.parse(init.body) : null
}

function metodoDe(llamada: unknown[] | undefined): string {
  const init = llamada?.[1] as RequestInit | undefined
  return init?.method ?? "GET"
}

/**
 * Las cinco formas del estado derivado, una por fila. La 103 y la 105 tienen un
 * ciclo abierto (`requerimientoEn`): la 105 además ya venció el plazo.
 */
const FILAS = [
  {
    unidadId: "uni-101",
    numero: "101",
    etiqueta: "Depto",
    estado: "al_dia",
    cambiaEl: "2026-09-15",
    diasParaCambiar: 120,
    descripcion:
      "Al día. El aviso de los 10 meses es el 2026-07-15 y el requerimiento anual el 2026-09-15.",
    ultimaActualizacion: "2025-09-15T12:00:00.000Z",
    requerimientoEn: null,
  },
  {
    unidadId: "uni-102",
    numero: "102",
    etiqueta: "Depto",
    estado: "requerido",
    cambiaEl: "2026-06-15",
    diasParaCambiar: -149,
    descripcion:
      "Los datos cumplieron 12 meses el 2026-06-15: corresponde requerir la actualización y con ese acto arrancan los 60 días.",
    ultimaActualizacion: "2025-06-15T12:00:00.000Z",
    requerimientoEn: null,
  },
  {
    unidadId: "uni-103",
    numero: "103",
    etiqueta: null,
    estado: "requerido",
    cambiaEl: "2026-11-20",
    diasParaCambiar: 9,
    descripcion:
      "Requerido: quedan 9 día(s) de los 60 corridos (vence el 2026-11-20).",
    ultimaActualizacion: "2025-05-01T12:00:00.000Z",
    requerimientoEn: "2026-09-21T12:00:00.000Z",
  },
  {
    unidadId: "uni-104",
    numero: "104",
    etiqueta: "Oficina",
    estado: "sin_declaracion",
    descripcion:
      "No consta la declaración del registro de esta unidad: se notifica como incidente de datos y no se multa.",
    ultimaActualizacion: null,
    requerimientoEn: null,
  },
  {
    unidadId: "uni-105",
    numero: "105",
    etiqueta: "Depto",
    estado: "habilitado_para_multa",
    cambiaEl: "2026-10-01",
    diasParaCambiar: -41,
    descripcion:
      "Venció el plazo de 60 días el 2026-10-01 sin actualización ni revalidación.",
    ultimaActualizacion: "2025-03-01T12:00:00.000Z",
    requerimientoEn: "2026-08-02T12:00:00.000Z",
  },
]

const RESUMEN = {
  al_dia: 1,
  requerido: 2,
  sin_declaracion: 1,
  habilitado_para_multa: 1,
}

interface PostFalso {
  status?: number
  cuerpo: unknown
}

/**
 * Instala el servidor falso: el listado por GET y, si el caso lo declara, lo que
 * responde el POST de cada acción. El listado se sirve siempre igual porque lo
 * que se afirma de la relectura es que OCURRIÓ, no que cambió la fila (eso lo
 * decide el servidor de verdad).
 */
function servir(manejadores: {
  filas?: unknown[]
  resumen?: Record<string, number>
  post?: (url: string) => PostFalso
}): void {
  const filas = manejadores.filas ?? FILAS
  fetchFalso.mockImplementation(
    async (entrada: unknown, init?: RequestInit): Promise<Response> => {
      const url = String(entrada)
      if ((init?.method ?? "GET") === "GET") {
        return respuestaJson({
          data: filas,
          resumen: manejadores.resumen ?? RESUMEN,
          total: filas.length,
          hoy: "2026-11-11T12:00:00.000Z",
        })
      }
      const post = manejadores.post?.(url)
      if (!post) return respuestaJson({ ok: true, emitidos: 0, omitidos: 0 })
      return respuestaJson(post.cuerpo, post.status ?? 200)
    }
  )
}

/** La fila de una unidad por su número (el nombre accesible de la fila lo incluye). */
function filaDe(numero: string): HTMLElement {
  return screen.getByRole("row", { name: new RegExp(numero) })
}

beforeEach(() => {
  instalarEntornoRadix()
  vi.stubGlobal("fetch", fetchFalso)
})

afterEach(() => {
  cleanup()
  fetchFalso.mockReset()
  vi.unstubAllGlobals()
})

describe("Vigencia del Registro — la pantalla dice el estado y ofrece el acto que le toca", () => {
  it("pinta una fila por unidad con el estado derivado, el plazo y el resumen", async () => {
    servir({})

    render(<ConsolaVigenciaRegistro puedeRequerir />)

    const alDia = await waitFor(() => filaDe("101"))
    expect(within(alDia).getByText("Al día")).toBeTruthy()
    expect(
      within(alDia).getByText(/El aviso de los 10 meses es el 2026-07-15/)
    ).toBeTruthy()
    expect(within(alDia).getByText("2026-09-15")).toBeTruthy()
    expect(within(alDia).getByText("Faltan 120 día(s).")).toBeTruthy()
    // Al día no se requiere: el requerimiento es el acto del mes 12.
    expect(within(alDia).queryByRole("button", { name: "Requerir" })).toBeNull()
    // Revalidar sí: confirmar que sigue igual es cumplir (S3).
    expect(
      within(alDia).getByRole("button", { name: "Revalidar" })
    ).toBeTruthy()

    // Requerido sin ciclo abierto: este es el estado que pide requerir.
    const vencidoAnual = filaDe("102")
    expect(within(vencidoAnual).getByText("Requerido")).toBeTruthy()
    expect(
      within(vencidoAnual).getByRole("button", { name: "Requerir" })
    ).toBeTruthy()
    expect(within(vencidoAnual).getByText("Venció hace 149 día(s).")).toBeTruthy()

    // Con un ciclo abierto el servidor responde 409: la fila no lo ofrece.
    const cicloAbierto = filaDe("103")
    expect(within(cicloAbierto).getByText("Requerido")).toBeTruthy()
    expect(
      within(cicloAbierto).queryByRole("button", { name: "Requerir" })
    ).toBeNull()
    expect(within(cicloAbierto).getByText("Faltan 9 día(s).")).toBeTruthy()

    // Sin declaración es un incidente de datos: se requiere porque no hay nada
    // que revalidar, y el estado no habilita ninguna multa.
    const sinDeclaracion = filaDe("104")
    expect(within(sinDeclaracion).getByText("Sin declaración")).toBeTruthy()
    expect(
      within(sinDeclaracion).getByRole("button", { name: "Requerir" })
    ).toBeTruthy()
    expect(within(sinDeclaracion).queryByText("2026-09-15")).toBeNull()

    // Plazo vencido: el estado lo deriva el servidor, la fila no lo reinterpreta.
    const plazoVencido = filaDe("105")
    expect(
      within(plazoVencido).getByText("Habilitado para multa")
    ).toBeTruthy()
    expect(within(plazoVencido).getByText("2026-10-01")).toBeTruthy()

    // Resumen por estado arriba, con los ceros a la vista.
    expect(screen.getByText("Al día: 1")).toBeTruthy()
    expect(screen.getByText("Requerido: 2")).toBeTruthy()
    expect(screen.getByText("Sin declaración: 1")).toBeTruthy()
    expect(screen.getByText("Habilitado para multa: 1")).toBeTruthy()
    expect(screen.getByText("Por vencer: 0")).toBeTruthy()

    // S1: la pantalla no promete una multa que la comunidad no declaró.
    expect(screen.getByText(/no aplica ninguna multa/i)).toBeTruthy()

    // Una sola lectura, sin parámetros: la comunidad sale del scope del servidor.
    expect(llamadas(RUTA_LISTA)).toHaveLength(1)
    expect(metodoDe(llamadas(RUTA_LISTA)[0])).toBe("GET")
  })

  it("Requerir manda el fundamento a su ruta y vuelve a leer el listado", async () => {
    const user = userEvent.setup({ delay: null })
    servir({
      post: () => ({
        cuerpo: {
          ok: true,
          unidadId: "uni-102",
          requerimientoEn: "2026-11-11T12:00:00.000Z",
          venceEn: "2027-01-10T12:00:00.000Z",
        },
      }),
    })

    render(<ConsolaVigenciaRegistro puedeRequerir />)

    await user.click(
      within(await waitFor(() => filaDe("102"))).getByRole("button", {
        name: "Requerir",
      })
    )

    const dialogo = await screen.findByRole("dialog")
    const confirmar = within(dialogo).getByRole("button", {
      name: "Registrar requerimiento",
    })
    // El esquema de la ruta exige 10 caracteres: no se ofrece mandar menos.
    expect(confirmar).toBeDisabled()

    await user.type(
      within(dialogo).getByLabelText("Fundamento"),
      "Registro de la unidad sin actualizar desde 2025"
    )
    expect(confirmar).toBeEnabled()
    await user.click(confirmar)

    await waitFor(() => expect(llamadas(RUTA_REQUERIMIENTO)).toHaveLength(1))
    const requerimiento = llamadas(RUTA_REQUERIMIENTO)[0]
    expect(metodoDe(requerimiento)).toBe("POST")
    expect(cuerpoDe(requerimiento)).toEqual({
      unidadId: "uni-102",
      fundamento: "Registro de la unidad sin actualizar desde 2025",
    })

    // Después del acto la pantalla relee: el estado nuevo lo dice el servidor.
    await waitFor(() => expect(llamadas(RUTA_LISTA)).toHaveLength(2))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("Revalidar está disponible también al día y manda el detalle a su ruta", async () => {
    const user = userEvent.setup({ delay: null })
    servir({
      post: () => ({
        cuerpo: {
          ok: true,
          unidadId: "uni-101",
          ultimaActualizacion: "2026-11-11T12:00:00.000Z",
          estado: "al_dia",
        },
      }),
    })

    render(<ConsolaVigenciaRegistro puedeRequerir />)

    await user.click(
      within(await waitFor(() => filaDe("101"))).getByRole("button", {
        name: "Revalidar",
      })
    )

    const dialogo = await screen.findByRole("dialog")
    await user.type(
      within(dialogo).getByLabelText("Qué se confirmó"),
      "Se confirmó con el propietario que nada cambió"
    )
    await user.click(
      within(dialogo).getByRole("button", { name: "Registrar revalidación" })
    )

    await waitFor(() => expect(llamadas(RUTA_REVALIDACION)).toHaveLength(1))
    const revalidacion = llamadas(RUTA_REVALIDACION)[0]
    expect(metodoDe(revalidacion)).toBe("POST")
    expect(cuerpoDe(revalidacion)).toEqual({
      unidadId: "uni-101",
      detalle: "Se confirmó con el propietario que nada cambió",
    })
    await waitFor(() => expect(llamadas(RUTA_LISTA)).toHaveLength(2))
  })

  it("un segundo requerimiento muestra el 409 del servidor y no declara un éxito", async () => {
    const user = userEvent.setup({ delay: null })
    servir({
      post: () => ({
        status: 409,
        cuerpo: { error: "Ya hay un requerimiento abierto para esta unidad." },
      }),
    })

    render(<ConsolaVigenciaRegistro puedeRequerir />)

    await user.click(
      within(await waitFor(() => filaDe("102"))).getByRole("button", {
        name: "Requerir",
      })
    )
    const dialogo = await screen.findByRole("dialog")
    await user.type(
      within(dialogo).getByLabelText("Fundamento"),
      "Registro de la unidad sin actualizar desde 2025"
    )
    await user.click(
      within(dialogo).getByRole("button", { name: "Registrar requerimiento" })
    )

    const alerta = await within(dialogo).findByRole("alert")
    // El texto es el de la API, tal cual.
    expect(alerta.textContent).toBe(
      "Ya hay un requerimiento abierto para esta unidad."
    )
    // El diálogo sigue abierto y no hubo relectura: el acto no se registró.
    expect(screen.getByRole("dialog")).toBeTruthy()
    expect(llamadas(RUTA_LISTA)).toHaveLength(1)
    expect(screen.queryByText(/requerimiento registrado/i)).toBeNull()
  })

  it("Emitir avisos llama al barrido sin cuerpo y muestra lo que informó el servidor", async () => {
    const user = userEvent.setup({ delay: null })
    servir({
      post: () => ({ cuerpo: { ok: true, emitidos: 3, omitidos: 1 } }),
    })

    render(<ConsolaVigenciaRegistro puedeRequerir />)
    await waitFor(() => filaDe("101"))

    await user.click(screen.getByRole("button", { name: "Emitir avisos" }))

    await waitFor(() => expect(llamadas(RUTA_AVISOS)).toHaveLength(1))
    const avisos = llamadas(RUTA_AVISOS)[0]
    expect(metodoDe(avisos)).toBe("POST")
    // El barrido no recibe payload: la comunidad sale del scope del servidor.
    expect(cuerpoDe(avisos)).toBeNull()

    // Los números son los del servidor, no unos inventados por la pantalla.
    expect(
      await screen.findByText(
        "Avisos emitidos: 3 · omitidos por idempotencia: 1"
      )
    ).toBeTruthy()
    await waitFor(() => expect(llamadas(RUTA_LISTA)).toHaveLength(2))
  })

  it("una comunidad sin unidades lo dice y no pinta filas falsas", async () => {
    servir({ filas: [], resumen: {} })

    render(<ConsolaVigenciaRegistro puedeRequerir />)

    expect(
      await screen.findByText(/no tiene unidades registradas/i)
    ).toBeTruthy()
    expect(screen.queryByRole("table")).toBeNull()
    expect(screen.getByText("Al día: 0")).toBeTruthy()
  })

  it("un error de lectura se muestra con el mensaje de la API", async () => {
    fetchFalso.mockImplementation(async () =>
      respuestaJson({ error: "Permiso denegado." }, 403)
    )

    render(<ConsolaVigenciaRegistro puedeRequerir />)

    const alerta = await screen.findByRole("alert")
    expect(alerta.textContent).toBe("Permiso denegado.")
    expect(screen.queryByRole("table")).toBeNull()
  })

  it("sin permiso de requerir, la fila no ofrece el acto", async () => {
    servir({})

    render(<ConsolaVigenciaRegistro puedeRequerir={false} />)

    const requerible = await waitFor(() => filaDe("102"))
    expect(
      within(requerible).getByRole("button", { name: "Requerir" })
    ).toBeDisabled()
  })
})

describe("Vigencia del Registro — el portón es el de la matriz", () => {
  it("administración y comité administran el Registro; los demás roles no", () => {
    // Las dos claves que piden las rutas: `ad:editar` para leer y revalidar,
    // `ad:crear` para requerir.
    expect(puedeAdministrarVigencia(["administrador"])).toBe(true)
    expect(puedeAdministrarVigencia(["comite"])).toBe(true)
    expect(puedeRequerirVigencia(["administrador"])).toBe(true)
    expect(puedeRequerirVigencia(["comite"])).toBe(true)

    // `ad:ver` no alcanza: el residente la tiene y vería todas las unidades (S5).
    expect(puedeAdministrarVigencia(["residente"])).toBe(false)
    expect(puedeRequerirVigencia(["residente"])).toBe(false)
    expect(puedeAdministrarVigencia(["conserjeria"])).toBe(false)
    expect(puedeAdministrarVigencia(["mantencion"])).toBe(false)
    expect(puedeAdministrarVigencia([])).toBe(false)
  })
})
