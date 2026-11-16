// @vitest-environment jsdom
/**
 * Padrón completo en Comunidad — identidad y disponibilidad fuera de la página 1.
 *
 * Las dos pantallas resuelven identidad con un `.find()` sobre lo que trajeron
 * `useUnidades()`/`usePersonas()`, y esos hooks piden `pageSize=100` por defecto.
 * Con un padrón de dos páginas, la unidad o la persona de la segunda página no
 * existe para la pantalla:
 *
 * - `app/comunidad/portal/page.tsx`: `refUnidad()` imprime el id crudo de la
 *   unidad fuera de página (catálogo, ficha y gestión); `propietarioDeUnidad()`
 *   pierde al propietario que vive en la página 2 del padrón de personas; y
 *   `crearPublicacionManual()` deriva la unidad disponible sobre la página 1,
 *   de modo que declara «Todas las unidades ya tienen publicación.» mientras la
 *   unidad libre queda fuera de página — y la unidad de la página 2 que ya
 *   tiene publicación tiene que no salir ofrecida.
 * - `app/comunidad/personas/[id]/page.tsx`: `etiquetaUnidad()` imprime el id
 *   crudo de la unidad vinculada que cayó en la página 2, donde la ficha debe
 *   imprimir el rótulo del vínculo.
 *
 * La palanca la exponen los hooks: `{ todasLasPaginas: true }`. El caso monta
 * las páginas REALES y sustituye solo la capa de red (mismo arnés que
 * `api-personas-falsa.ts`): padrones de dos páginas (tope de `pageSize` en 100 y
 * `?page=` respetado), orden fijo. Así el RED cae por identidad o por la
 * derivación de disponibilidad, no por una petición ausente.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SWRConfig } from "swr"
import { instalarEntornoRadix } from "./entorno-radix"
import PortalInmobiliarioPage from "@/app/comunidad/portal/page"
import PersonaPerfilPage from "@/app/comunidad/personas/[id]/page"

/** La ficha de persona lee su identidad del segmento de ruta. */
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "p-ana" }),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/comunidad/personas/p-ana",
}))

interface UnidadFalsa {
  id: string
  numero: string
  etiqueta: string
}

interface PublicacionFalsa {
  id: string
  unidadId: string
  operacion: string
  precio: number
  imagenes: unknown[]
  activa: boolean
  fechaPublicacion: string
}

interface PersonaFalsa {
  id: string
  rut: string
  nombreCompleto: string
  nombres: string
  apellidos: string
  email: string
  telefonoMovil: string
  estadoCuenta: string
  condicionesEspecialesIds: string[]
  roles: string[]
  datosLaborales: null
  datosGobernanza: null
}

interface VinculoFalso {
  id: string
  personaId: string
  unidadId: string
  rol: string
  fechaInicio: string
  fechaFin: string | null
  permiteVerFinanzas: boolean
}

interface EstadoPadron {
  /** En el orden en que el servidor las sirve (las últimas, página 2). */
  personas: PersonaFalsa[]
  unidades: UnidadFalsa[]
  vinculos: VinculoFalso[]
  publicaciones: PublicacionFalsa[]
}

interface ApiPadron {
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

/** Una persona del padrón con los campos que leen las dos pantallas. */
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
    telefonoMovil: "+56900000000",
    estadoCuenta: "activa",
    condicionesEspecialesIds: [],
    roles,
    datosLaborales: null,
    datosGobernanza: null,
    ...extra,
  }
}

function publicacion(id: string, unidadId: string, activa: boolean): PublicacionFalsa {
  return {
    id,
    unidadId,
    operacion: "venta",
    precio: 5_000_000,
    imagenes: [],
    activa,
    fechaPublicacion: "2026-01-01",
  }
}

/**
 * Portal — disponibilidad: 100 unidades de página 1 todas con publicación
 * (inactivas, para que el catálogo quede vacío y no estorbe), y en la página 2
 * la libre primero (`u-libre-901`) y la ya publicada después (`u-tomada-902`,
 * cuya publicación cae en la fila 101, fuera de lo que el hook del portal ve).
 */
function estadoPortalDisponibilidad(): EstadoPadron {
  const unidades: UnidadFalsa[] = []
  const publicaciones: PublicacionFalsa[] = []
  for (let i = 1; i <= 100; i++) {
    const id = `u-f-${String(i).padStart(3, "0")}`
    unidades.push({ id, numero: String(i), etiqueta: "Depto" })
    publicaciones.push(publicacion(`pub-${id}`, id, false))
  }
  unidades.push({ id: "u-libre-901", numero: "901", etiqueta: "Casa" })
  unidades.push({ id: "u-tomada-902", numero: "902", etiqueta: "Casa" })
  publicaciones.push(publicacion("pub-tomada-902", "u-tomada-902", false))
  return {
    personas: [
      persona("p-berta", "Berta Relleno", ["propietario"]),
      persona("p-bruno", "Bruno Relleno", ["residente"]),
      persona("p-belen", "Belén Relleno", ["residente"]),
    ],
    unidades,
    vinculos: [],
    publicaciones,
  }
}

/**
 * Portal — identidad: `u-casa-707` vive en la página 2 de unidades y su
 * publicación activa (la única) abre el catálogo; `p-gregorio`, su propietario
 * por vínculo, vive en la página 2 de personas.
 */
function estadoPortalIdentidad(): EstadoPadron {
  const unidades: UnidadFalsa[] = []
  for (let i = 1; i <= 100; i++) {
    unidades.push({
      id: `u-f-${String(i).padStart(3, "0")}`,
      numero: String(i),
      etiqueta: "Depto",
    })
  }
  unidades.push({ id: "u-casa-707", numero: "707", etiqueta: "Casa" })
  return {
    personas: [
      ...Array.from({ length: 100 }, (_, i) =>
        persona(`p-f-${String(i + 1).padStart(3, "0")}`, `Relleno ${i + 1} Propietario`, [
          "propietario",
        ])
      ),
      persona("p-gregorio", "Gregorio Fuera De Pagina", ["propietario"]),
    ],
    unidades,
    vinculos: [
      {
        id: "v-casa-707",
        personaId: "p-gregorio",
        unidadId: "u-casa-707",
        rol: "propietario",
        fechaInicio: "2024-01-01",
        fechaFin: null,
        permiteVerFinanzas: true,
      },
    ],
    publicaciones: [publicacion("pub-casa-707", "u-casa-707", true)],
  }
}

/** Portal — padrón chico: todo entra en la página 1 y nada extra se pide. */
function estadoPortalChico(): EstadoPadron {
  return {
    personas: [
      persona("p-lidia", "Lidia Propietaria", ["propietario"]),
      persona("p-lucas", "Lucas Residente", ["residente"]),
    ],
    unidades: [
      { id: "u-chica-1", numero: "1", etiqueta: "Casa" },
      { id: "u-chica-2", numero: "2", etiqueta: "Casa" },
      { id: "u-chica-3", numero: "3", etiqueta: "Casa" },
    ],
    vinculos: [
      {
        id: "v-chica-1",
        personaId: "p-lidia",
        unidadId: "u-chica-1",
        rol: "propietario",
        fechaInicio: "2024-01-01",
        fechaFin: null,
        permiteVerFinanzas: true,
      },
    ],
    publicaciones: [publicacion("pub-chica-1", "u-chica-1", true)],
  }
}

/**
 * Ficha de persona: `u-parcela-12` vive en la página 2 de unidades y el único
 * vínculo de Ana apunta a ella.
 */
function estadoFichaPersona(): EstadoPadron {
  const unidades: UnidadFalsa[] = []
  for (let i = 1; i <= 100; i++) {
    unidades.push({
      id: `u-f-${String(i).padStart(3, "0")}`,
      numero: String(i),
      etiqueta: "Depto",
    })
  }
  unidades.push({ id: "u-parcela-12", numero: "12", etiqueta: "Parcela" })
  return {
    personas: [persona("p-ana", "Ana Vinculada", ["propietario"])],
    unidades,
    vinculos: [
      {
        id: "v-ana",
        personaId: "p-ana",
        unidadId: "u-parcela-12",
        rol: "propietario",
        fechaInicio: "2024-05-01",
        fechaFin: null,
        permiteVerFinanzas: true,
      },
    ],
    publicaciones: [],
  }
}

/** Instala el servidor falso. Limpiar con `vi.unstubAllGlobals()`. */
function instalarApiPadron(estado: EstadoPadron): ApiPadron {
  const api: ApiPadron = { peticiones: [] }

  vi.stubGlobal("fetch", async (entrada: RequestInfo | URL): Promise<Response> => {
    const crudo =
      typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url
    api.peticiones.push(crudo)
    const url = new URL(crudo, "http://localhost")
    const ruta = url.pathname
    const metodo = typeof entrada === "string" || entrada instanceof URL ? "GET" : entrada.method

    if (metodo !== "GET") {
      // Mutación del flujo (crear publicación): se acepta sin estado, porque la
      // pantalla sigue con el objeto que ya tiene en mano.
      return respuestaJson({ ok: true })
    }

    const coleccion =
      ruta === "/api/personas"
        ? estado.personas
        : ruta === "/api/unidades"
          ? estado.unidades
          : ruta === "/api/vinculos"
            ? estado.vinculos
            : ruta === "/api/publicaciones-portal"
              ? estado.publicaciones
              : ruta === "/api/leads-portal" || ruta === "/api/notificaciones"
                ? []
                : ruta === "/api/maestros/condiciones-especiales"
                  ? []
                  : null
    if (coleccion) return respuestaJson(paginar(coleccion, url))

    const mPersona = ruta.match(/^\/api\/personas\/([^/]+)$/)
    if (mPersona) {
      const encontrada = estado.personas.find((p) => p.id === mPersona[1])
      return encontrada
        ? respuestaJson(encontrada)
        : respuestaJson({ error: "persona no encontrada" }, 404)
    }

    if (ruta === "/api/configuracion") return respuestaJson({})
    if (ruta === "/api/auth/session") {
      return respuestaJson({ user: { id: "sesion-propietario" }, expires: "2099-01-01" })
    }

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

/** SWR con caché fresca por render: un caso no hereda las filas del anterior. */
function renderPagina(nodo: React.ReactElement): void {
  render(<SWRConfig value={{ provider: () => new Map() }}>{nodo}</SWRConfig>)
}

/**
 * Click con reintento sobre la derivación de disponibilidad: el cierre del botón
 * puede ser anterior a la llegada de la página 2 del padrón, así que se
 * reintenta mientras la pantalla solo responda con el error de «nada libre».
 * La derivación no manda POST cuando no encuentra unidad, así que reintentar no
 * deja basura; en cuanto el editor abre, el bucle corta.
 */
async function clicarConReintento(
  user: ReturnType<typeof userEvent.setup>,
  boton: RegExp,
  exito: RegExp
): Promise<void> {
  for (let intento = 0; intento < 25; intento++) {
    await user.click(screen.getByRole("button", { name: boton }))
    await new Promise((r) => setTimeout(r, 20))
    if (screen.queryByText(exito)) return
  }
}

describe("portal — padrón completo para identidad y disponibilidad", () => {
  it("la unidad publicada de la página 2 sale por su rótulo, no por su id", async () => {
    instalarApiPadron(estadoPortalIdentidad())
    renderPagina(<PortalInmobiliarioPage />)

    // La tarjeta del catálogo está mandada por el mismo `refUnidad` que falla:
    // cuando aparece la tarjeta, la resolución de identidad ya se resolvió con
    // lo que el hook trajo. SIN el arreglo ninguna petición va a traer la
    // página 2, así que la ausencia del rótulo es estable, no una carrera.
    await screen.findByRole("button", { name: /Ver ficha y contactar/i })

    expect(await screen.findByText("Casa 707")).toBeInTheDocument()
    expect(screen.queryByText("u-casa-707")).toBeNull()
  })

  it("el propietario de la página 2 se nombra en la ficha de su publicación", async () => {
    instalarApiPadron(estadoPortalIdentidad())
    const user = userEvent.setup({ delay: null })
    renderPagina(<PortalInmobiliarioPage />)

    await screen.findByRole("button", { name: /Ver ficha y contactar/i })
    await user.click(screen.getByRole("button", { name: /Ver ficha y contactar/i }))

    expect(await screen.findByText(/Administrado por Gregorio Fuera De Pagina/)).toBeInTheDocument()
  })

  it("la unidad libre de la página 2 es la que se ofrece; la ya publicada no", async () => {
    const api = instalarApiPadron(estadoPortalDisponibilidad())
    const user = userEvent.setup({ delay: null })
    renderPagina(<PortalInmobiliarioPage />)

    await screen.findByText("Portal Inmobiliario")
    await user.click(screen.getByRole("button", { name: /Gestionar vitrina/i }))
    // La tabla de gestión montó con la página 1 del padrón de unidades.
    await screen.findByText("Depto 100")

    await clicarConReintento(
      user,
      /Nueva publicación manual/i,
      /Editar publicación · Casa 901/
    )

    // La unidad libre vive en la página 2: el editor abre para ella. El error
    // de «nada libre» desaparece, y la unidad de la página 2 que ya tiene
    // publicación no sale ofrecida nunca.
    expect(await screen.findByText(/Editar publicación · Casa 901/)).toBeInTheDocument()
    expect(screen.queryByText("Todas las unidades ya tienen publicación.")).toBeNull()
    expect(screen.queryByText(/Editar publicación · Casa 902/)).toBeNull()
    expect(api.peticiones.some((p) => p === "/api/unidades?pageSize=100&page=2")).toBe(true)
  })

  it("con el padrón entero en la página 1 nada cambia y no se piden páginas extra", async () => {
    const api = instalarApiPadron(estadoPortalChico())
    const user = userEvent.setup({ delay: null })
    renderPagina(<PortalInmobiliarioPage />)

    await screen.findByText("Portal Inmobiliario")
    expect(await screen.findByText("Casa 1")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /Ver ficha y contactar/i }))
    expect(await screen.findByText(/Administrado por Lidia Propietaria/)).toBeInTheDocument()

    // El padrón completo cabe en una página: completar la colección no agrega
    // ninguna petición (el hook solo pide mientras el `total` lo exija).
    expect(api.peticiones.some((p) => p.includes("&page=2"))).toBe(false)
  })
})

describe("ficha de persona — padrón completo para la identidad del vínculo", () => {
  it("la unidad vinculada de la página 2 imprime su rótulo, no su id crudo", async () => {
    const api = instalarApiPadron(estadoFichaPersona())
    renderPagina(<PersonaPerfilPage />)

    await screen.findByText("Ana Vinculada")

    // El rótulo del vínculo es lo que la ficha imprime; el id crudo solo viaja
    // dentro de la línea de trazabilidad (`id · Desde …`), nunca como rótulo.
    expect(await screen.findByText("Parcela 12")).toBeInTheDocument()
    expect(screen.queryByText("u-parcela-12")).toBeNull()
    expect(api.peticiones.some((p) => p === "/api/unidades?pageSize=100&page=2")).toBe(true)
  })
})
