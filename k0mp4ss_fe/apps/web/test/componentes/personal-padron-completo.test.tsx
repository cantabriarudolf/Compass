// @vitest-environment jsdom
/**
 * Padrón completo en `personas/personal` — la regla de negocio sobre el padrón
 * entero (F38/F40, lote «cerrar el techo de 100», T7, S4).
 *
 * `app/personas/personal/page.tsx` deriva quién es personal con
 * `personas.filter(p => p.roles.includes("personal") || p.datosLaborales !== undefined)`
 * sobre lo que trae `usePersonas()`, que pide `pageSize=100`. Es una regla de
 * negocio en el cliente sobre una lista truncada: con un padrón de dos páginas,
 * el trabajador de la página 2 NO existe para la pantalla — no se cuenta en la
 * pestaña, no sale como opción del selector de turno, no cruza con los trabajos
 * MT ni resuelve al responsable. Eso no se tapa con un aviso: se arregla.
 *
 * La palanca ya existe en el hook: `{ todasLasPaginas: true }` (universo
 * acotado: el padrón de una comunidad). La regla se queda donde está y ahora
 * opera sobre el padrón entero: quien no la cumple no se ofrece aunque venga
 * en la página 2. El arnés respeta `?pageSize=100` y `?page=N` (mismo molde
 * que `padron-completo-identidad-comunidad.test.tsx`); el hermano
 * `ficha-consentimiento.test.tsx` de esta página tiene su falso inline y sin
 * paginación, así que acá se monta el mismo patrón con páginas reales.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SWRConfig } from "swr"
import { instalarEntornoRadix } from "./entorno-radix"
import PersonalPage from "@/app/personas/personal/page"

vi.setConfig({ testTimeout: 60_000 })

interface PersonaFalsa {
  id: string
  rut: string
  nombreCompleto: string
  nombres: string
  apellidos: string
  email: string
  estadoCuenta: string
  roles: string[]
  /** Ficha laboral: PRESENTE sólo cuando la persona la tiene (contrato de
   * `lib/schemas.ts` y de la semilla: ausente, no `null`). La regla de la
   * página distingue ficha por `!== undefined`. */
  datosLaborales?: Record<string, unknown>
}

interface TrabajoFalso {
  id: string
  titulo: string
  estado: string
  responsablePersonaId: string | null
}

interface EstadoArnés {
  /** En el orden en que el servidor las sirve (las de la página 2, al final). */
  personas: PersonaFalsa[]
  trabajosMT: TrabajoFalso[]
}

interface ApiArnés {
  /** URL de cada petición que atravesó el falso, en orden. */
  peticiones: string[]
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
  roles: string[],
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
    estadoCuenta: "activa",
    roles,
    ...extra,
  } as PersonaFalsa
}

/**
 * Padrón de dos páginas. Página 1: 100 vecinos que NO cumplen la regla (ni rol
 * personal ni ficha). Página 2: Eva cumple por rol, Hugo cumple por ficha y
 * Rosa NO cumple — con el padrón completo la regla tiene que seguir excluyéndola.
 */
function estadoPadronDeDosPaginas(): EstadoArnés {
  const personas: PersonaFalsa[] = []
  for (let i = 1; i <= 100; i++) {
    personas.push(persona(`p-f-${String(i).padStart(3, "0")}`, `Relleno ${i} Vecino`, ["propietario"]))
  }
  personas.push(persona("p-eva", "Eva Fuera De Pagina", ["personal"]))
  personas.push(
    persona("p-hugo", "Hugo Con Ficha", [], {
      datosLaborales: { id: "dl-hugo", cargo: "Guardia" },
    })
  )
  personas.push(persona("p-rosa", "Rosa Sin Condicion", ["propietario"]))
  return {
    personas,
    trabajosMT: [
      { id: "mt-1", titulo: "Revision de ficha", estado: "planificado", responsablePersonaId: "p-eva" },
    ],
  }
}

/** Padrón chico: todo entra en la página 1 y nada extra se pide. */
function estadoPadronChico(): EstadoArnés {
  return {
    personas: [
      persona("p-lidia", "Lidia Personal Unica", ["personal"]),
      persona("p-rosa", "Rosa Sin Condicion", ["propietario"]),
    ],
    trabajosMT: [
      { id: "mt-1", titulo: "Revision de ficha", estado: "planificado", responsablePersonaId: "p-lidia" },
    ],
  }
}

/** Instala el servidor falso. Limpiar con `vi.unstubAllGlobals()`. */
function instalarApiArnés(estado: EstadoArnés): ApiArnés {
  const api: ApiArnés = { peticiones: [] }

  vi.stubGlobal("fetch", async (entrada: RequestInfo | URL): Promise<Response> => {
    const crudo =
      typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url
    api.peticiones.push(crudo)
    const url = new URL(crudo, "http://localhost")
    const ruta = url.pathname

    if (ruta === "/api/personas") return respuestaJson(paginar(estado.personas, url))
    if (ruta === "/api/mt/trabajos") return respuestaJson(paginar(estado.trabajosMT, url))
    if (ruta === "/api/pe/cierres-turno" || ruta === "/api/pe/proyecciones") {
      return respuestaJson({ data: [], page: 1, pageSize: 100, total: 0 })
    }
    if (ruta === "/api/pe/turnos") return respuestaJson({ data: [], page: 1, pageSize: 100, total: 0 })
    if (ruta.startsWith("/api/maestros/")) {
      return respuestaJson({ data: [], page: 1, pageSize: 100, total: 0 })
    }
    if (ruta === "/api/configuracion") return respuestaJson({})

    // Cualquier otra ruta es un contrato que el falso no declaró: 404 a la vista.
    return respuestaJson({ error: `ruta no servida por el falso: ${ruta}` }, 404)
  })

  return api
}

beforeEach(() => {
  instalarEntornoRadix()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Cache SWR fresco por render: un caso no hereda las filas del anterior. */
function renderPagina(): void {
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <PersonalPage />
    </SWRConfig>
  )
}

function peticionesDePersonas(api: ApiArnés): string[] {
  return api.peticiones.filter((p) => p.startsWith("/api/personas?"))
}

/** Abre el selector de trabajador del panel de monitoreo y devuelve el listbox. */
async function abrirSelectorTrabajador(
  user: ReturnType<typeof userEvent.setup>
): Promise<HTMLElement> {
  await user.click(screen.getByRole("tab", { name: "Panel de Monitoreo" }))
  // El rótulo «Trabajador» es htmlFor del trigger del Select de turno.
  await user.click(screen.getByRole("combobox", { name: "Trabajador" }))
  return screen.findByRole("listbox", {}, { timeout: 5_000 })
}

describe("personal — la regla de negocio opera sobre el padrón completo", () => {
  it("el trabajador de la página 2 cuenta, se elige y cruza con los trabajos MT; quien no cumple no se ofrece", async () => {
    const api = instalarApiArnés(estadoPadronDeDosPaginas())
    const user = userEvent.setup({ delay: null })
    renderPagina()

    // El portón de carga abre cuando todas las colecciones de la página llegaron.
    await screen.findByText("Personal y Servicios")

    // El conteo es sobre el padrón entero: Eva (rol) + Hugo (ficha) = 2. Los
    // 100 vecinos de la página 1 no cumplen la regla y no cuentan.
    await waitFor(
      () =>
        expect(screen.getByRole("tab", { name: "Trabajadores (2)" })).toBeInTheDocument(),
      { timeout: 10_000 }
    )
    // La caminata pidió la página 2 del padrón de personas.
    expect(peticionesDePersonas(api).some((p) => p.includes("page=2"))).toBe(true)

    // El cruce con trabajos MT ya no pierde a la responsable de la página 2:
    // la fila vive en el Panel de Monitoreo.
    await user.click(screen.getByRole("tab", { name: "Panel de Monitoreo" }))
    const filaTarea = (await screen.findByText("Revision de ficha")).closest(
      "tr"
    ) as HTMLElement
    await waitFor(() =>
      expect(within(filaTarea).getByText("Eva Fuera De Pagina")).toBeInTheDocument()
    )

    // El selector de turno ofrece al personal de la página 2 y elige a Eva.
    const lista = await abrirSelectorTrabajador(user)
    await waitFor(
      () => {
        const textos = within(lista)
          .getAllByRole("option")
          .map((o) => o.textContent)
        expect(textos).toContain("Eva Fuera De Pagina")
        expect(textos).toContain("Hugo Con Ficha")
      },
      { timeout: 10_000 }
    )
    // La regla de negocio se mantiene sobre el padrón completo: ni Rosa ni los
    // vecinos de ninguna página se ofrecen como personal.
    const textos = within(lista)
      .getAllByRole("option")
      .map((o) => o.textContent)
    expect(textos).not.toContain("Rosa Sin Condicion")
    expect(textos).not.toContain("Relleno 50 Vecino")

    await user.click(
      within(lista)
        .getAllByRole("option")
        .find((o) => o.textContent === "Eva Fuera De Pagina") as HTMLElement
    )
    expect(screen.getByRole("combobox", { name: "Trabajador" })).toHaveTextContent(
      "Eva Fuera De Pagina"
    )
  })

  it("con el padrón entero en la página 1 nada cambia y no se piden páginas extra", async () => {
    const api = instalarApiArnés(estadoPadronChico())
    const user = userEvent.setup({ delay: null })
    renderPagina()

    await screen.findByText("Personal y Servicios")

    // Sólo Lidia cumple la regla: la exclusión sigue en un padrón de una página.
    expect(screen.getByRole("tab", { name: "Trabajadores (1)" })).toBeInTheDocument()

    // La fila de tareas vive en el Panel de Monitoreo.
    await user.click(screen.getByRole("tab", { name: "Panel de Monitoreo" }))
    const filaTarea = (await screen.findByText("Revision de ficha")).closest(
      "tr"
    ) as HTMLElement
    expect(within(filaTarea).getByText("Lidia Personal Unica")).toBeInTheDocument()

    const lista = await abrirSelectorTrabajador(user)
    await waitFor(() => {
      const textos = within(lista)
        .getAllByRole("option")
        .map((o) => o.textContent)
      expect(textos).toContain("Lidia Personal Unica")
    })
    const textos = within(lista)
      .getAllByRole("option")
      .map((o) => o.textContent)
    expect(textos).not.toContain("Rosa Sin Condicion")

    // El padrón completo cabe en una página: completarlo no agrega peticiones.
    expect(peticionesDePersonas(api).some((p) => p.includes("page=2"))).toBe(false)
  })
})
