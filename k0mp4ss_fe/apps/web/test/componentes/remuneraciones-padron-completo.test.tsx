// @vitest-environment jsdom
/**
 * Padrón completo en `finanzas/remuneraciones` — la regla de negocio sobre el
 * padrón entero (F38/F40, lote «cerrar el techo de 100», T7, S4).
 *
 * `app/finanzas/remuneraciones/page.tsx` deriva los trabajadores con
 * `personas.filter(p => p.datosLaborales && p.estadoCuenta === "activa")` sobre
 * lo que trae `usePersonas()`, que pide `pageSize=100`. Es una regla de negocio
 * en el cliente sobre una lista truncada: con un padrón de dos páginas, la
 * persona activa con ficha laboral de la página 2 no aparece como trabajadora y
 * no se le puede liquidar. Eso no se tapa con un aviso: se arregla. El nombre y
 * el RUT del historial (`nombrePersona`/`rutPersona`) se resuelven contra el
 * mismo padrón, así que la fila imprimía el id crudo del trabajador fuera de
 * página.
 *
 * La palanca ya existe en el hook: `{ todasLasPaginas: true }` (universo
 * acotado: el padrón de una comunidad). La regla se queda donde está y ahora
 * opera sobre el padrón entero: activa sin ficha y ficha sin activa siguen sin
 * ofrecerse aunque vengan en la página 2. El arnés respeta `?pageSize=100` y
 * `?page=N` (mismo molde que `padron-completo-identidad-comunidad.test.tsx`).
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SWRConfig } from "swr"
import { instalarEntornoRadix } from "./entorno-radix"
import RemuneracionesPage from "@/app/finanzas/remuneraciones/page"

vi.setConfig({ testTimeout: 60_000 })

/** El PDF captura el nombre y el RUT que la página resolvió del padrón. */
const pdfCapturado = vi.hoisted(() => ({
  actual: null as null | { nombre: string; rut: string },
}))

vi.mock("@/lib/pdf-utils", () => ({
  documentoLiquidacionPDF: vi.fn(
    async (_liq: unknown, nombreTrabajador: string, rutTrabajador: string) => {
      pdfCapturado.actual = { nombre: nombreTrabajador, rut: rutTrabajador }
      return {}
    }
  ),
  descargarPdf: vi.fn(async () => {}),
}))

interface PersonaFalsa {
  id: string
  rut: string
  nombreCompleto: string
  nombres: string
  apellidos: string
  email: string
  estadoCuenta: string
  roles: string[]
  datosLaborales: Record<string, unknown> | null
}

interface LiquidacionFalsa {
  id: string
  folio: string
  periodo: string
  trabajadorPersonaId: string
  totalImponible: number
  totalDescuentos: number
  descuentoAnticipos: number
  liquidoAPagar: number
  estado: string
}

interface EstadoArnés {
  /** En el orden en que el servidor las sirve (las de la página 2, al final). */
  personas: PersonaFalsa[]
  liquidaciones: LiquidacionFalsa[]
}

interface ApiArnés {
  /** URL de cada petición que atravesó el falso, en orden. */
  peticiones: string[]
  /** Cuerpo de cada POST que atravesó el falso, en orden. */
  cuerposEnviados: Record<string, unknown>[]
}

function respuestaJson(datos: unknown, status = 200): Response {
  return new Response(JSON.stringify(datos), {
    status,
    headers: { "content-type": "application/json" },
  })
}

/** Página con el mismo envelope y el mismo tope de `pageSize` que el servidor. */
function paginar(filas: unknown[], url: URL): { data: unknown[]; page: number; pageSize: number; total: number } {
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1)
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(url.searchParams.get("pageSize") ?? "100", 10) || 100)
  )
  const desde = (page - 1) * pageSize
  return { data: filas.slice(desde, desde + pageSize), page, pageSize, total: filas.length }
}

function persona(
  id: string,
  nombreCompleto: string,
  estadoCuenta: string,
  extra: Partial<PersonaFalsa> = {}
): PersonaFalsa {
  const [nombres = "", ...resto] = nombreCompleto.split(" ")
  return {
    id,
    rut: `1${id.replace(/\D/g, "").padStart(7, "0").slice(-7)}-9`,
    nombreCompleto,
    nombres,
    apellidos: resto.join(" "),
    email: `${id}@test.cl`,
    estadoCuenta,
    roles: [],
    datosLaborales: null,
    ...extra,
  }
}

/**
 * Padrón de dos páginas. Página 1: 100 vecinos sin ficha (nadie liquidable).
 * Página 2: Zully cumple la regla (activa con ficha), Beto NO (activa sin
 * ficha) y César NO (ficha sin activa) — con el padrón completo la regla tiene
 * que seguir excluyéndolos.
 */
function estadoPadronDeDosPaginas(): EstadoArnés {
  const personas: PersonaFalsa[] = []
  for (let i = 1; i <= 100; i++) {
    personas.push(persona(`p-f-${String(i).padStart(3, "0")}`, `Relleno ${i} Vecino`, "activa"))
  }
  personas.push(
    persona("p-zully", "Zully Fuera De Pagina", "activa", {
      rut: "12.345.678-9",
      datosLaborales: { id: "dl-zully", cargo: "Guardia", sueldoBase: 500_000 },
    })
  )
  personas.push(persona("p-beto", "Beto Sin Ficha", "activa"))
  personas.push(
    persona("p-cesar", "Cesar Inactivo", "inactiva", {
      datosLaborales: { id: "dl-cesar", cargo: "Jardinero" },
    })
  )
  return {
    personas,
    liquidaciones: [
      {
        id: "liq-1",
        folio: "LIQ-1",
        periodo: "2026-11",
        trabajadorPersonaId: "p-zully",
        totalImponible: 500_000,
        totalDescuentos: 100_000,
        descuentoAnticipos: 0,
        liquidoAPagar: 400_000,
        estado: "borrador",
      },
    ],
  }
}

/** Padrón chico: todo entra en la página 1 y nada extra se pide. */
function estadoPadronChico(): EstadoArnés {
  return {
    personas: [
      persona("p-zully", "Zully Unica Trabajadora", "activa", {
        datosLaborales: { id: "dl-zully", cargo: "Guardia", sueldoBase: 500_000 },
      }),
      persona("p-beto", "Beto Sin Ficha", "activa"),
    ],
    liquidaciones: [
      {
        id: "liq-1",
        folio: "LIQ-1",
        periodo: "2026-11",
        trabajadorPersonaId: "p-zully",
        totalImponible: 500_000,
        totalDescuentos: 100_000,
        descuentoAnticipos: 0,
        liquidoAPagar: 400_000,
        estado: "borrador",
      },
    ],
  }
}

/** Instala el servidor falso. Limpiar con `vi.unstubAllGlobals()`. */
function instalarApiArnés(estado: EstadoArnés): ApiArnés {
  const api: ApiArnés = { peticiones: [], cuerposEnviados: [] }

  vi.stubGlobal(
    "fetch",
    async (entrada: RequestInfo | URL, inicializador?: RequestInit): Promise<Response> => {
      const crudo =
        typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url
      api.peticiones.push(crudo)
      const url = new URL(crudo, "http://localhost")
      const ruta = url.pathname
      const metodo = inicializador?.method ?? "GET"

      if (metodo !== "GET") {
        // Mutación del flujo (generar liquidación): se acepta sin estado y se
        // registra el cuerpo para afirmar a quién se le liquidó.
        const cuerpo =
          typeof inicializador?.body === "string" ? JSON.parse(inicializador.body) : undefined
        if (cuerpo) api.cuerposEnviados.push(cuerpo as Record<string, unknown>)
        return respuestaJson({ ok: true })
      }

      if (ruta === "/api/personas") return respuestaJson(paginar(estado.personas, url))
      if (ruta === "/api/liquidaciones") {
        return respuestaJson(paginar(estado.liquidaciones, url))
      }
      if (ruta === "/api/liquidaciones/adelantos") {
        return respuestaJson({ data: [], page: 1, pageSize: 100, total: 0 })
      }
      if (ruta.startsWith("/api/maestros/")) {
        return respuestaJson({ data: [], page: 1, pageSize: 100, total: 0 })
      }
      if (ruta === "/api/configuracion") return respuestaJson({})

      // Cualquier otra ruta es un contrato que el falso no declaró: 404 a la vista.
      return respuestaJson({ error: `ruta no servida por el falso: ${ruta}` }, 404)
    }
  )

  return api
}

beforeEach(() => {
  instalarEntornoRadix()
  pdfCapturado.actual = null
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Cache SWR fresco por render: un caso no hereda las filas del anterior. */
function renderPagina(): void {
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <RemuneracionesPage />
    </SWRConfig>
  )
}

function peticionesDePersonas(api: ApiArnés): string[] {
  return api.peticiones.filter((p) => p.startsWith("/api/personas?"))
}

/** Abre el Select de trabajador de «Generar liquidación» y devuelve el listbox. */
async function abrirSelectorTrabajadores(
  user: ReturnType<typeof userEvent.setup>
): Promise<HTMLElement> {
  // Pestaña Liquidaciones: 0 es el Select de «Trabajador con ficha PE *».
  const combos = screen.getAllByRole("combobox")
  await user.click(combos[0]!)
  return screen.findByRole("listbox", {}, { timeout: 5_000 })
}

describe("remuneraciones — la regla de negocio opera sobre el padrón completo", () => {
  it("el trabajador de la página 2 se elige, se le liquida y el historial imprime su nombre y RUT; quien no cumple no se ofrece", async () => {
    const api = instalarApiArnés(estadoPadronDeDosPaginas())
    const user = userEvent.setup({ delay: null })
    renderPagina()

    // El portón de carga abre cuando todas las colecciones de la página llegaron.
    await screen.findByText("Remuneraciones")

    // El historial imprime el nombre del trabajador de la página 2, no su id.
    const fila = (await screen.findByText("LIQ-1")).closest("tr") as HTMLElement
    await waitFor(
      () => expect(within(fila).getByText("Zully Fuera De Pagina")).toBeInTheDocument(),
      { timeout: 10_000 }
    )
    // La caminata pidió la página 2 del padrón de personas.
    expect(peticionesDePersonas(api).some((p) => p.includes("page=2"))).toBe(true)

    // El selector de trabajadores ofrece a la trabajadora de la página 2.
    const lista = await abrirSelectorTrabajadores(user)
    await waitFor(
      () => {
        const textos = within(lista)
          .getAllByRole("option")
          .map((o) => o.textContent)
        expect(textos).toContain("Zully Fuera De Pagina — Guardia")
      },
      { timeout: 10_000 }
    )
    // La regla de negocio se mantiene sobre el padrón completo: activa sin
    // ficha y ficha sin activa siguen sin ofrecerse, de ninguna página.
    const textos = within(lista)
      .getAllByRole("option")
      .map((o) => o.textContent)
    expect(textos).not.toContain("Beto Sin Ficha")
    expect(textos).not.toContain("Cesar Inactivo")
    expect(textos).not.toContain("Relleno 50 Vecino")

    // Elegir a la trabajadora de la página 2 y liquidarle.
    await user.click(
      within(lista)
        .getAllByRole("option")
        .find((o) => o.textContent === "Zully Fuera De Pagina — Guardia") as HTMLElement
    )
    const botonGenerar = screen.getByRole("button", { name: /Generar liquidación/i })
    expect(botonGenerar).not.toBeDisabled()
    await user.click(botonGenerar)
    await waitFor(() => expect(api.cuerposEnviados.length).toBeGreaterThan(0))
    const generado = api.cuerposEnviados.find(
      (c) => (c as { trabajadorPersonaId?: string }).trabajadorPersonaId !== undefined
    )
    expect((generado as { trabajadorPersonaId?: string }).trabajadorPersonaId).toBe("p-zully")

    // El PDF imprime nombre y RUT por nombre, no el id crudo.
    const botonPdf = within(fila).getByRole("button", { name: /PDF/i })
    await user.click(botonPdf)
    await waitFor(() => expect(pdfCapturado.actual).not.toBeNull())
    expect(pdfCapturado.actual?.nombre).toBe("Zully Fuera De Pagina")
    expect(pdfCapturado.actual?.rut).toBe("12.345.678-9")
  })

  it("con el padrón entero en la página 1 nada cambia y no se piden páginas extra", async () => {
    const api = instalarApiArnés(estadoPadronChico())
    const user = userEvent.setup({ delay: null })
    renderPagina()

    await screen.findByText("Remuneraciones")

    // El historial imprime el nombre de la trabajadora de la única página.
    const fila = (await screen.findByText("LIQ-1")).closest("tr") as HTMLElement
    expect(within(fila).getByText("Zully Unica Trabajadora")).toBeInTheDocument()

    // El selector ofrece a la trabajadora de la única página y no a quien no cumple.
    const lista = await abrirSelectorTrabajadores(user)
    await waitFor(() => {
      const textos = within(lista)
        .getAllByRole("option")
        .map((o) => o.textContent)
      expect(textos).toContain("Zully Unica Trabajadora — Guardia")
    })
    const textos = within(lista)
      .getAllByRole("option")
      .map((o) => o.textContent)
    expect(textos).not.toContain("Beto Sin Ficha")

    // El padrón completo cabe en una página: completarlo no agrega peticiones.
    expect(peticionesDePersonas(api).some((p) => p.includes("page=2"))).toBe(false)
  })
})
