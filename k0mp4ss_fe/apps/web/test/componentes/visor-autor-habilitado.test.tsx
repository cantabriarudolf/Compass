// @vitest-environment jsdom
/**
 * T12 (S10) — el autor habilitado del visor se resuelve en el servidor.
 *
 * `app/comunidad/visor` llenaba la lista de «Habilitación de creación manual»
 * (page.tsx:529) y el Select «Registrar como creación de tercero habilitado»
 * (page.tsx:607) con el padrón truncado del cliente (`usePersonas()` →
 * `/api/personas?pageSize=100`, filtrado después por el flag): una persona
 * habilitada fuera de las primeras cien filas no se mostraba y el formulario no
 * la ofrecía.
 *
 * Lo que se fija acá:
 *   · con el padrón del cliente VACÍO y el servidor (`GET
 *     /api/cv/personas-habilitadas`) devolviendo UNA persona habilitada, la
 *     pantalla la MUESTRA en la lista y la OFRECE en el Select, y el guardado la
 *     registra con el shape del payload de creación manual
 *     (`creadoPorPersonaId`, `origen: "manual"`);
 *   · con el servidor devolviendo el conjunto vacío, aparece el texto del
 *     estado vacío — un vacío VERIFICADO por el servidor, no el producto de un
 *     padrón recortado — y el bloque del Select no monta.
 */
import * as React from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { instalarEntornoRadix } from "./entorno-radix"

const PRESUPUESTO_CARGA = 60_000

/** Estado compartido con las factories de `vi.mock`. */
const estado = vi.hoisted(() => ({
  filas: [] as { id: string; nombres: string; apellidos: string }[],
  crearAviso: vi.fn<(registro: unknown) => Promise<{ ok: boolean }>>(async () => ({ ok: true })),
}))

vi.mock("@/lib/api/use-cv", () => ({
  useAvisosCV: () => ({
    items: [],
    total: 0,
    isLoading: false,
    error: null,
    hasMore: false,
    cargarMas: vi.fn(),
    cargandoMas: false,
    create: estado.crearAviso,
    update: vi.fn(),
    remove: vi.fn(),
  }),
  usePlantillasCV: () => ({
    items: [],
    total: 0,
    isLoading: false,
    error: null,
    hasMore: false,
    cargarMas: vi.fn(),
    cargandoMas: false,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }),
  useActasPublicadasCV: () => ({
    publicaciones: [],
    textoInformativo: "",
    isLoading: false,
    error: null,
    publicar: vi.fn(),
    despublicar: vi.fn(),
  }),
}))

vi.mock("@/lib/api/use-actas-gd", () => ({
  useActasGD: () => ({ actas: [], isLoading: false, error: null }),
}))

vi.mock("@/lib/api/use-configuracion", () => ({
  useConfiguracion: () => ({ config: undefined, isLoading: false, updateConfig: vi.fn() }),
}))

// Candado del defecto: la pantalla no vuelve a leer el padrón truncado del
// cliente. Si alguien re-agrega `usePersonas` al visor, el test muere acá.
vi.mock("@/lib/api/use-personas", () => ({
  usePersonas: () => {
    throw new Error(
      "T12: el visor no debe leer el padrón truncado del cliente; usa /api/cv/personas-habilitadas."
    )
  },
}))

const { default: VisorPanelPage } = await import("@/app/comunidad/visor/page")

/** La fila que responde `GET /api/cv/personas-habilitadas`. */
const FILA_HABILITADA = { id: "t12-cv-autor-1", nombres: "Ana", apellidos: "Habilitada" }

/** Espejo de la constante `RUTA_HABILITADAS` de la página. */
const RUTA = "/api/cv/personas-habilitadas"

/**
 * Stub ESTRICTO por turno para los casos de error (T21): responde la secuencia
 * declarada y lanza nombrando la URL no declarada — misma lección de R3-001:
 * un misroute no puede lucir verde.
 */
function stubPorTurno(respuestas: Array<() => Promise<Response>>): { llamadas: string[] } {
  const llamadas: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn((recurso: string | URL | Request) => {
      const url = typeof recurso === "string" ? recurso : String(recurso)
      if (!url.startsWith(RUTA)) {
        throw new Error(`[stub] URL inesperada para este caso: ${url}`)
      }
      const turno = llamadas.length
      llamadas.push(url)
      const responder = respuestas[Math.min(turno, respuestas.length - 1)]
      if (!responder) throw new Error(`[stub] sin respuesta declarada para el turno ${turno}`)
      return responder()
    })
  )
  return { llamadas }
}

beforeAll(() => {
  instalarEntornoRadix()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  estado.filas = []
  estado.crearAviso.mockClear()
})

/** Stub de fetch que responde el padrón habilitado y graba cada URL pedida. */
function stubHabilitadas(): { llamadas: string[] } {
  const llamadas: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn((recurso: string | URL | Request) => {
      const url = typeof recurso === "string" ? recurso : String(recurso)
      llamadas.push(url)
      return Promise.resolve(
        new Response(JSON.stringify({ data: estado.filas, total: estado.filas.length }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    })
  )
  return { llamadas }
}

describe("T12 — el autor habilitado del visor viene del servidor", () => {
  it("con el padrón del cliente vacío, la habilitada del servidor se muestra en la lista y se ofrece en el Select", async () => {
    // El padrón truncado del cliente ya no existe: la ÚNICA fuente es el
    // servidor, y devuelve una habilitada.
    estado.filas = [FILA_HABILITADA]
    const { llamadas } = stubHabilitadas()
    const user = userEvent.setup()
    render(<VisorPanelPage />)

    // La lista de «Habilitación de creación manual» (page.tsx:529) la muestra.
    const tabConfiguracion = await screen.findByRole("tab", { name: /Configuración/i })
    await user.click(tabConfiguracion)
    expect(await screen.findByText(/Ana Habilitada/)).toBeTruthy()
    // El vacío mentiroso no aparece: hay una habilitada y el servidor la dijo.
    expect(screen.queryByText(/Nadie habilitado además de administración/)).toBeNull()
    // La consulta fue al endpoint nuevo del visor, no al padrón truncado.
    expect(llamadas.some((u) => u.startsWith("/api/cv/personas-habilitadas"))).toBe(true)

    // El Select del autor (page.tsx:607) la ofrece.
    await user.click(screen.getByRole("button", { name: /Nuevo aviso/i }))
    const bloqueAutor = screen.getByText(/Registrar como creación de tercero habilitado/).closest("div")
    expect(bloqueAutor).toBeTruthy()
    await user.click(within(bloqueAutor as HTMLElement).getByRole("combobox"))
    const opcion = await screen.findByText("Ana Habilitada (con VB)")
    await user.click(opcion)

    // El shape del payload de creación manual se conserva: el guardado registra
    // a la persona elegida como `creadoPorPersonaId`, no a la primera fila.
    await user.type(screen.getByPlaceholderText("Ej: Corte de agua programado"), "Aviso de prueba T12")
    await user.click(screen.getByRole("button", { name: /Guardar borrador/i }))
    expect(estado.crearAviso).toHaveBeenCalledTimes(1)
    const registro = estado.crearAviso.mock.calls[0]?.[0] as {
      titulo?: string
      origen?: string
      creadoPorPersonaId?: string
    }
    expect(registro.titulo).toBe("Aviso de prueba T12")
    expect(registro.origen).toBe("manual")
    expect(registro.creadoPorPersonaId).toBe("t12-cv-autor-1")
  }, PRESUPUESTO_CARGA)

  it("con el servidor devolviendo el conjunto vacío, aparece el estado vacío y el Select no monta", async () => {
    // El servidor VERIFICÓ que nadie está habilitado: el texto es un vacío
    // legítimo, no el producto de un padrón recortado.
    estado.filas = []
    stubHabilitadas()
    const user = userEvent.setup()
    render(<VisorPanelPage />)

    const tabConfiguracion = await screen.findByRole("tab", { name: /Configuración/i })
    await user.click(tabConfiguracion)
    expect(await screen.findByText(/Nadie habilitado además de administración/)).toBeTruthy()
    expect(screen.queryByText(/Ana Habilitada/)).toBeNull()

    // Sin habilitados verificados por el servidor, el bloque del autor no monta:
    // el formulario sólo puede quedar a nombre de la Administración.
    await user.click(screen.getByRole("button", { name: /Nuevo aviso/i }))
    expect(screen.queryByText(/Registrar como creación de tercero habilitado/)).toBeNull()
    expect(estado.crearAviso).not.toHaveBeenCalled()
  }, PRESUPUESTO_CARGA)

  // T21 — el falso-vacío y el reintento. Un 200 cuyo cuerpo no se puede leer
  // (o que parsea sin la lista) NO es un vacío verificado: mostrar «Nadie
  // habilitado» ahí es exactamente el falso-vacío que el lote vino a eliminar.
  describe("T21 — un 200 ilegible no es un vacío verificado y el fetch reintenta", () => {
    it("un 200 con cuerpo ilegible muestra el error y nunca «Nadie habilitado» (R3-ok-body-unparsed-empty)", async () => {
      stubPorTurno([
        () =>
          Promise.resolve(
            new Response("<html>mantenimiento</html>", {
              status: 200,
              headers: { "content-type": "text/html" },
            })
          ),
      ])
      const user = userEvent.setup()
      render(<VisorPanelPage />)

      await user.click(await screen.findByRole("tab", { name: /Configuración/i }))

      expect(
        await screen.findByText(`Respuesta ilegible del servidor al consultar ${RUTA}.`)
      ).toBeTruthy()
      expect(screen.queryByText(/Nadie habilitado además de administración/)).toBeNull()
      expect(screen.queryByText(/Ana Habilitada/)).toBeNull()
    }, PRESUPUESTO_CARGA)

    it("un 200 que parsea pero no trae la lista tampoco es un vacío verificado", async () => {
      stubPorTurno([
        () =>
          Promise.resolve(
            new Response(JSON.stringify({ total: 3 }), {
              status: 200,
              headers: { "content-type": "application/json" },
            })
          ),
      ])
      const user = userEvent.setup()
      render(<VisorPanelPage />)

      await user.click(await screen.findByRole("tab", { name: /Configuración/i }))

      expect(await screen.findByText(/Respuesta ilegible del servidor/)).toBeTruthy()
      expect(screen.queryByText(/Nadie habilitado además de administración/)).toBeNull()
    }, PRESUPUESTO_CARGA)

    it("un fallo de red reintenta UNA vez: con el segundo intento sano muestra la lista (R3-no-retry-once)", async () => {
      const { llamadas } = stubPorTurno([
        () => Promise.reject(new Error("red caída")),
        () =>
          Promise.resolve(
            new Response(JSON.stringify({ data: [FILA_HABILITADA], total: 1 }), {
              status: 200,
              headers: { "content-type": "application/json" },
            })
          ),
      ])
      const user = userEvent.setup()
      render(<VisorPanelPage />)

      await user.click(await screen.findByRole("tab", { name: /Configuración/i }))

      expect(await screen.findByText(/Ana Habilitada/)).toBeTruthy()
      expect(llamadas).toHaveLength(2)
      expect(screen.queryByText(/Sin conexión con el servidor/)).toBeNull()
    }, PRESUPUESTO_CARGA)

    it("un 500 que persiste viaja verbatim tras el reintento, y reintenta UNA vez (no en bucle)", async () => {
      const { llamadas } = stubPorTurno([
        () =>
          Promise.resolve(
            new Response(JSON.stringify({ error: "Catástrofe simulada." }), {
              status: 500,
              headers: { "content-type": "application/json" },
            })
          ),
      ])
      const user = userEvent.setup()
      render(<VisorPanelPage />)

      await user.click(await screen.findByRole("tab", { name: /Configuración/i }))

      expect(await screen.findByText("Catástrofe simulada.")).toBeTruthy()
      expect(llamadas).toHaveLength(2)
    }, PRESUPUESTO_CARGA)

    it("un 4xx es veredicto del servidor: viaja verbatim sin reintento", async () => {
      // Pin del borde del reintento: sólo red, 5xx y 200 ilegible reintentan.
      // Un rechazo del servidor no se insiste.
      const { llamadas } = stubPorTurno([
        () =>
          Promise.resolve(
            new Response(JSON.stringify({ error: "Sin permiso." }), {
              status: 403,
              headers: { "content-type": "application/json" },
            })
          ),
      ])
      const user = userEvent.setup()
      render(<VisorPanelPage />)

      await user.click(await screen.findByRole("tab", { name: /Configuración/i }))

      expect(await screen.findByText("Sin permiso.")).toBeTruthy()
      expect(llamadas).toHaveLength(1)
    }, PRESUPUESTO_CARGA)
  })
})
