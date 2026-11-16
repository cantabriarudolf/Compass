// @vitest-environment jsdom
/**
 * Padrón completo en `finanzas/multas` — identidad, selectores y cifra fuera de
 * la página 1 (F38/F40, lote «cerrar el techo de 100», T2).
 *
 * `app/finanzas/multas/page.tsx` resuelve identidad con `.find()` sobre lo que
 * trajeron `usePersonas()`/`useUnidades()` (ambos piden `pageSize=100`), deriva
 * la cifra (contadores por estado, `montoAplicadoTotal`, categorías y el folio
 * correlativo `IN-####`) de `useInfraccionesIN()` —otra colección
 * `pageSize=100`— y llena dos `Select` con esos mismos padrones. Con un padrón
 * o un libro de dos páginas: la tabla y el expediente imprimen el id crudo, la
 * persona y la unidad de la página 2 no se pueden elegir, la cifra miente y el
 * folio nuevo puede colisionar con un folio que vive en la página 2.
 *
 * La palanca ya existe en los hooks: `{ todasLasPaginas: true }` para los dos
 * padrones (universo acotado) y `useColeccionCompleta` para el libro de
 * infracciones (universo que se acumula). El caso monta las páginas REALES y
 * sustituye solo la capa de red (mismo arnés que
 * `padron-completo-identidad-comunidad.test.tsx`): colecciones de dos páginas
 * (tope de `pageSize` en 100 y `?page=` respetado), orden fijo. Así el RED cae
 * por identidad, por opción ausente o por cifra parcial, no por una petición
 * ausente.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SWRConfig } from "swr"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { instalarEntornoRadix } from "./entorno-radix"
import MultasPage from "@/app/finanzas/multas/page"
import type { InfraccionIN, TipoInfraccionIN } from "@/lib/schemas"

vi.setConfig({ testTimeout: 60_000 })

interface PersonaFalsa {
  id: string
  rut: string
  nombreCompleto: string
  nombres: string
  apellidos: string
  email: string
  telefonoMovil: string
  estadoCuenta: string
  roles: string[]
}

interface UnidadFalsa {
  id: string
  numero: string
  etiqueta: string
}

interface EstadoPadronMultas {
  infracciones: InfraccionIN[]
  tipos: TipoInfraccionIN[]
  personas: PersonaFalsa[]
  unidades: UnidadFalsa[]
}

interface ApiMultas {
  /** URL de cada petición que atravesó el falso, en orden. */
  peticiones: string[]
  /** Cuerpo de cada POST capturado, en orden. */
  posts: Record<string, unknown>[]
}

const TIPO: TipoInfraccionIN = {
  id: "tin-1",
  nombre: "Ruidos Molestos",
  categoria: "leve",
  tipoSancion: "monto_fijo",
  valor: 30_000,
}

function respuestaJson(datos: unknown, status = 200): Response {
  return new Response(JSON.stringify(datos), {
    status,
    headers: { "content-type": "application/json" },
  })
}

/** Página con el mismo envelope y el mismo tope de `pageSize` que el servidor. */
function paginar(
  filas: unknown[],
  url: URL
): { data: unknown[]; page: number; pageSize: number; total: number } {
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1)
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(url.searchParams.get("pageSize") ?? "100", 10) || 100)
  )
  const desde = (page - 1) * pageSize
  return { data: filas.slice(desde, desde + pageSize), page, pageSize, total: filas.length }
}

function persona(id: string, nombreCompleto: string, estadoCuenta: string): PersonaFalsa {
  const [nombres = "", ...resto] = nombreCompleto.split(" ")
  return {
    id,
    rut: `1${id.replace(/\D/g, "").padStart(7, "0").slice(-7)}-9`,
    nombreCompleto,
    nombres,
    apellidos: resto.join(" "),
    email: `${id}@test.cl`,
    telefonoMovil: "+56900000000",
    estadoCuenta,
    roles: ["propietario"],
  }
}

function infraccion(
  parcial: Partial<InfraccionIN> & Pick<InfraccionIN, "id">
): InfraccionIN {
  return {
    folio: "IN-0001",
    tipoInfraccionId: "tin-1",
    unidadId: "u-f-001",
    fechaSuceso: "2026-10-20",
    horaSuceso: "22:35",
    antecedentes: "Ruidos molestos reiterados después de las 22:00 según conserjería.",
    evidencias: [],
    estado: "en_revision",
    fechaRegistro: "2026-10-21",
    comentariosDirectiva: [],
    respaldosDirectiva: [],
    ...parcial,
  }
}

/**
 * Identidad y selector: el padrón de personas y de unidades tiene dos páginas y
 * LA MULTA DE LA PÁGINA 1 del libro referencia gente de la página 2, para que
 * el RED muestre el id crudo en la tabla y en el expediente (no una fila
 * ausente). Héctor es activa (debe poder elegirse) y Silvia inactiva (no debe
 * ofrecerse nunca, tampoco desde la página completa).
 */
function estadoIdentidad(): EstadoPadronMultas {
  const infracciones: InfraccionIN[] = [
    infraccion({
      id: "in-fuera",
      folio: "IN-0001",
      unidadId: "u-fuera-907",
      reportantePersonaId: "p-hector",
    }),
  ]
  for (let i = 2; i <= 100; i++) {
    infracciones.push(infraccion({ id: `in-${i}`, folio: `IN-${String(i).padStart(4, "0")}` }))
  }
  const personas: PersonaFalsa[] = []
  for (let i = 1; i <= 100; i++) {
    personas.push(persona(`p-f-${String(i).padStart(3, "0")}`, `Relleno ${i} Padron`, "activa"))
  }
  personas.push(persona("p-hector", "Héctor Fuera De Pagina", "activa"))
  personas.push(persona("p-silvia", "Silvia Inactiva", "inactiva"))
  const unidades: UnidadFalsa[] = []
  for (let i = 1; i <= 100; i++) {
    unidades.push({ id: `u-f-${String(i).padStart(3, "0")}`, numero: String(i), etiqueta: "Depto" })
  }
  unidades.push({ id: "u-fuera-907", numero: "907", etiqueta: "Casa" })
  return { infracciones, tipos: [TIPO], personas, unidades }
}

/**
 * Cifra y folio: 150 infracciones en dos páginas. Página 1: cien en revisión
 * del catálogo (leve), sin monto aplicado. Página 2: treinta aplicadas con
 * monto (leve) y veinte desestimadas por daño directo. El folio máximo visible
 * en la página 1 es IN-0100; el correlativo real del libro es IN-0151.
 */
function estadoCifra(): EstadoPadronMultas {
  const infracciones: InfraccionIN[] = []
  for (let i = 1; i <= 100; i++) {
    infracciones.push(infraccion({ id: `in-${i}`, folio: `IN-${String(i).padStart(4, "0")}` }))
  }
  for (let i = 101; i <= 130; i++) {
    infracciones.push(
      infraccion({
        id: `in-${i}`,
        folio: `IN-${String(i).padStart(4, "0")}`,
        estado: "aplicada",
        montoAplicado: 1_000,
      })
    )
  }
  for (let i = 131; i <= 150; i++) {
    infracciones.push(
      infraccion({
        id: `in-${i}`,
        folio: `IN-${String(i).padStart(4, "0")}`,
        estado: "desestimada",
        danoDirecto: {
          descripcionDaño: "Rotura de espejo del ascensor",
          costoReparacion: 5_000,
        },
      })
    )
  }
  return {
    infracciones,
    tipos: [TIPO],
    personas: [persona("p-uno", "Única Padron", "activa")],
    unidades: [{ id: "u-f-001", numero: "1", etiqueta: "Depto" }],
  }
}

/** Instala el servidor falso. Limpiar con `vi.unstubAllGlobals()`. */
function instalarApiMultas(estado: EstadoPadronMultas): ApiMultas {
  const api: ApiMultas = { peticiones: [], posts: [] }

  vi.stubGlobal(
    "fetch",
    async (entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const crudo =
        typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url
      api.peticiones.push(crudo)
      const url = new URL(crudo, "http://localhost")
      const ruta = url.pathname
      const metodo = init?.method ?? "GET"

      if (metodo !== "GET") {
        if (ruta === "/api/in/infracciones") {
          const cuerpo = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
          api.posts.push(cuerpo)
          // El upsert del servidor real agrega la fila: el re-fetch tras la
          // mutación la encuentra y el folio siguiente no retrocede.
          estado.infracciones.push(cuerpo as unknown as InfraccionIN)
          return respuestaJson({ ok: true })
        }
        return respuestaJson({ error: `mutación no servida por el falso: ${ruta}` }, 404)
      }

      if (ruta === "/api/in/infracciones") return respuestaJson(paginar(estado.infracciones, url))
      if (ruta === "/api/in/tipos") return respuestaJson(paginar(estado.tipos, url))
      if (ruta === "/api/personas") return respuestaJson(paginar(estado.personas, url))
      if (ruta === "/api/unidades") return respuestaJson(paginar(estado.unidades, url))
      if (ruta === "/api/co/mensajes-buzon") return respuestaJson(paginar([], url))
      // Cualquier otra ruta es un contrato que el falso no declaró: 404 a la vista.
      return respuestaJson({ error: `ruta no servida por el falso: ${ruta}` }, 404)
    }
  )

  return api
}

beforeEach(() => {
  instalarEntornoRadix()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** SWR con caché fresca por render: un caso no hereda las filas del anterior. */
function renderPagina(nodo: React.ReactElement): void {
  render(<SWRConfig value={{ provider: () => new Map() }}>{nodo}</SWRConfig>)
}

/** Abre el expediente de la fila cuyo folio se indica. */
async function abrirExpediente(
  user: ReturnType<typeof userEvent.setup>,
  folio: string
): Promise<HTMLElement> {
  const fila = (await screen.findByText(folio)).closest("tr")
  expect(fila).toBeTruthy()
  await user.click(within(fila as HTMLElement).getByRole("button", { name: /Ver/ }))
  return await screen.findByRole("dialog")
}

describe("finanzas/multas — padrón completo para identidad", () => {
  it("la tabla y el expediente imprimen etiqueta numero y nombres apellidos de la página 2, no el id", async () => {
    const api = instalarApiMultas(estadoIdentidad())
    renderPagina(<MultasPage />)

    // La multa de la página 1 del libro referencia unidad y persona de la
    // página 2 de los padrones. La tabla imprime la unidad…
    expect(await screen.findByText("Casa 907")).toBeInTheDocument()
    expect(screen.queryByText("u-fuera-907")).toBeNull()

    // …y el expediente imprime unidad legible y al reportante por su nombre.
    const user = userEvent.setup({ delay: null })
    const dialog = await abrirExpediente(user, "IN-0001")
    expect(await within(dialog).findByText(/Casa 907 · Suceso/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Reporta Héctor Fuera De Pagina/)).toBeInTheDocument()
    expect(within(dialog).queryByText("u-fuera-907")).toBeNull()
    expect(within(dialog).queryByText("p-hector")).toBeNull()

    // La identidad salió de las páginas 2 de ambos padrones: se caminaron.
    expect(api.peticiones.some((p) => p === "/api/unidades?pageSize=100&page=2")).toBe(true)
    expect(api.peticiones.some((p) => p === "/api/personas?pageSize=100&page=2")).toBe(true)
  })
})

describe("finanzas/multas — padrón completo para los selectores", () => {
  it("la unidad y la persona activa de la página 2 se pueden elegir; la inactiva no se ofrece", async () => {
    instalarApiMultas(estadoIdentidad())
    const user = userEvent.setup({ delay: null })
    renderPagina(<MultasPage />)

    await screen.findByText("Casa 907")
    await user.click(screen.getByRole("button", { name: /Registrar infracción/ }))
    const dialog = await screen.findByRole("dialog")
    const combos = await within(dialog).findAllByRole("combobox")
    // 0 Origen · 1 Tipo de infracción · 2 Convertir desde reclamo CO
    // 3 Unidad infractora · 4 Reportante
    expect(combos).toHaveLength(5)

    await user.click(combos[3]!)
    const listaUnidades = await screen.findByRole("listbox", {}, { timeout: 5_000 })
    const unidadFuera = within(listaUnidades)
      .getAllByRole("option")
      .find((o) => o.textContent === "Casa 907")
    expect(unidadFuera).toBeTruthy()
    await user.click(unidadFuera as HTMLElement)
    expect(await within(dialog).findByText("Casa 907")).toBeInTheDocument()

    await user.click(combos[4]!)
    const listaReportantes = await screen.findByRole("listbox", {}, { timeout: 5_000 })
    const hector = within(listaReportantes)
      .getAllByRole("option")
      .find((o) => o.textContent === "Héctor Fuera De Pagina")
    expect(hector).toBeTruthy()
    // La inactiva de la página 2 sigue sin ofrecerse con el padrón completo.
    expect(
      within(listaReportantes).queryByText("Silvia Inactiva")
    ).toBeNull()
    await user.click(hector as HTMLElement)
    expect(await within(dialog).findByText("Héctor Fuera De Pagina")).toBeInTheDocument()
  })
})

describe("finanzas/multas — la cifra y el folio no bajan con más de cien filas", () => {
  it("contadores, monto aplicado y categorías suman el universo completo de dos páginas", async () => {
    const api = instalarApiMultas(estadoCifra())
    renderPagina(<MultasPage />)

    expect(await screen.findByText("En Revisión: 100")).toBeInTheDocument()
    expect(screen.getByText("Cerrada / Aplicada: 30")).toBeInTheDocument()
    expect(screen.getByText("Desestimada: 20")).toBeInTheDocument()
    // Catálogo (leve): cien de la página 1 + treinta aplicadas de la página 2;
    // las veinte desestimadas son daño directo y no entran por categoría.
    expect(screen.getByText("Leve: 130")).toBeInTheDocument()
    expect(screen.getByText(/Montos aplicados acumulados: \$30\.000/)).toBeInTheDocument()
    expect(api.peticiones.some((p) => p === "/api/in/infracciones?pageSize=100&page=2")).toBe(
      true
    )
  })

  it("el folio nuevo no colisiona con un folio que vive en la segunda página", async () => {
    const api = instalarApiMultas(estadoCifra())
    const user = userEvent.setup({ delay: null })
    renderPagina(<MultasPage />)

    await screen.findByRole("button", { name: /Registrar infracción/ })
    await user.click(screen.getByRole("button", { name: /Registrar infracción/ }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: "Registrar" }))

    await waitFor(() => expect(api.posts).toHaveLength(1))
    // La página 1 termina en IN-0100 y la página 2 llega hasta IN-0150: el
    // correlativo del libro completo es IN-0151. Con la lista cortada, el folio
    // caería en IN-0101, que ya existe en la página 2.
    expect(api.posts[0]?.folio).toBe("IN-0151")
  })

  it("con el padrón y el libro en una sola página nada cambia y no se piden páginas extra", async () => {
    const api = instalarApiMultas({
      infracciones: [
        infraccion({ id: "in-1", unidadId: "u-101" }),
        infraccion({ id: "in-2", folio: "IN-0002", unidadId: "u-102" }),
      ],
      tipos: [TIPO],
      personas: [persona("p-lidia", "Lidia Propietaria", "activa")],
      unidades: [
        { id: "u-101", numero: "101", etiqueta: "Depto" },
        { id: "u-102", numero: "102", etiqueta: "Depto" },
      ],
    })
    renderPagina(<MultasPage />)

    expect(await screen.findByText("Depto 101")).toBeInTheDocument()
    // Todo cabe en una página: completar las colecciones no agrega ninguna
    // petición (los hooks solo caminan mientras el `total` lo exija).
    expect(api.peticiones.some((p) => p.includes("&page=2"))).toBe(false)
  })
})
