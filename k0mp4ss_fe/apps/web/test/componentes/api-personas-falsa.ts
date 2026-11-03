/**
 * api-personas-falsa — servidor REST en memoria para las dos pantallas de personas.
 *
 * `/comunidad/personas` y `/admin/gestion` leen con `usePersonas`
 * (`lib/api/use-personas.ts`), que pega en `GET /api/personas`. Este archivo reemplaza `fetch` por
 * un manejador que respeta el contrato de la ruta real, con las dos reglas que producían el
 * defecto medido:
 *
 * - el padrón pagina de a 100 (`pageSize` con tope 100) y ordena por `createdAt` DESCENDENTE
 *   (`id` DESC como desempate), igual que `GET /api/personas`;
 * - `?q=`, `?rol=`, `?rolDirectorio=` y `?estadoCuenta=` se resuelven en el SERVIDOR sobre toda la
 *   colección, ANTES de paginar. Filtrar en el navegador la primera página no puede encontrarlas.
 *
 * La semilla copia la forma de la base de desarrollo (`prisma/dev.db`, 118 personas): 101 personas
 * donde la única con rol `personal` (Zoe) es la MÁS VIEJA y la única `directiva` (Dora) es la
 * segunda más vieja. Con el orden descendente las dos quedan FUERA de la página 1 (100 filas):
 * exactamente la gente que el filtro de navegador dejaba inalcanzable.
 *
 * `instalarApiPersonas()` llama `vi.stubGlobal("fetch", …)`; el test limpia con
 * `vi.unstubAllGlobals()` en el `afterEach`.
 */
import { vi } from "vitest"

/** Fila mínima que consumen las dos pantallas (columnas, roles y fichas). */
export interface PersonaFalsa {
  id: string
  rut: string
  nombreCompleto: string
  nombres: string
  apellidos: string
  email: string
  telefonoMovil: string
  fotografiaUrl?: string
  estadoCuenta: string
  condicionesEspecialesIds: string[]
  roles: string[]
  datosLaborales?: Record<string, unknown> | null
  datosGobernanza?: Record<string, unknown> | null
  /** Orden del padrón: el servidor real ordena por `createdAt` DESCENDENTE. */
  createdAt: string
}

/** Vínculo mínimo que usa el rol derivado «residente»/«propietario» del directorio. */
export interface VinculoFalso {
  id: string
  personaId: string
  unidadId: string
  rol: string
  fechaInicio: string
  fechaFin: string | null
  createdAt: string
}

export interface EstadoApiPersonas {
  /** Personas en orden `createdAt` ASCENDENTE: el servidor las sirve al revés. */
  personas: PersonaFalsa[]
  vinculos: VinculoFalso[]
  unidades: Record<string, unknown>[]
  controles: Record<string, unknown>[]
}

export interface ApiPersonas {
  /** URL de cada petición que atravesó el servidor falso, en orden. */
  peticiones: string[]
  estado: EstadoApiPersonas
}

/** Tope de `pageSize` de `GET /api/personas`. */
const PAGE_SIZE_MAXIMO = 100
const PAGE_SIZE_POR_DEFECTO = 50

/** Roles derivados del Directorio de Gestión Administrativa. */
const ROLES_DIRECTORIO = ["propietario", "residente", "directiva", "personal"] as const

function respuestaJson(datos: unknown, status = 200): Response {
  return new Response(JSON.stringify(datos), {
    status,
    headers: { "content-type": "application/json" },
  })
}

/** Página pedida con el mismo `skip`/`take` y el mismo envelope que el servidor real. */
function paginar<T>(
  filas: T[],
  url: URL
): { data: T[]; page: number; pageSize: number; total: number } {
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1)
  const pageSize = Math.min(
    PAGE_SIZE_MAXIMO,
    Math.max(
      1,
      Number.parseInt(url.searchParams.get("pageSize") ?? String(PAGE_SIZE_POR_DEFECTO), 10) ||
        PAGE_SIZE_POR_DEFECTO
    )
  )
  const desde = (page - 1) * pageSize
  return { data: filas.slice(desde, desde + pageSize), page, pageSize, total: filas.length }
}

/** CSV de un query param, como lo parsea la ruta (`valoresCsv`). */
function valoresCsv(valor: string | null): string[] {
  if (!valor) return []
  return [...new Set(valor.split(",").map((v) => v.trim()).filter(Boolean))]
}

/**
 * Roles derivados del directorio administrativo — espejo de `rolesDe` de
 * `app/admin/gestion/page.tsx` y de `idsPorRolDirectorio` de la ruta.
 */
function rolesDeDirectorio(
  persona: PersonaFalsa,
  vinculos: VinculoFalso[]
): Set<string> {
  const propios = new Set(persona.roles)
  const suyos = vinculos.filter((v) => v.personaId === persona.id)
  const salida = new Set<string>()
  if (propios.has("propietario") || suyos.some((v) => v.rol === "propietario")) {
    salida.add("propietario")
  }
  if (
    suyos.some((v) => v.rol === "arrendatario" && v.fechaFin === null) ||
    (propios.has("residente") && !propios.has("propietario"))
  ) {
    salida.add("residente")
  }
  if (persona.datosGobernanza != null) salida.add("directiva")
  if (persona.datosLaborales != null) salida.add("personal")
  return salida
}

/** Filtros del servidor real, en el mismo orden: `q`, `rol`, `rolDirectorio`, `estadoCuenta`. */
function filtrarPersonas(
  filas: PersonaFalsa[],
  estado: EstadoApiPersonas,
  url: URL
): PersonaFalsa[] {
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase()
  const roles = valoresCsv(url.searchParams.get("rol"))
  const rolesDirectorio = valoresCsv(url.searchParams.get("rolDirectorio"))
  const estadosCuenta = valoresCsv(url.searchParams.get("estadoCuenta"))
  return filas.filter((p) => {
    if (
      q &&
      ![p.nombreCompleto, p.rut, p.email].some((campo) =>
        (campo ?? "").toLowerCase().includes(q)
      )
    ) {
      return false
    }
    if (roles.length > 0 && !p.roles.some((r) => roles.includes(r))) return false
    if (rolesDirectorio.length > 0) {
      const derivados = rolesDeDirectorio(p, estado.vinculos)
      if (!rolesDirectorio.some((r) => derivados.has(r))) return false
    }
    if (estadosCuenta.length > 0 && !estadosCuenta.includes(p.estadoCuenta)) return false
    return true
  })
}

/** Una persona del padrón con todos los campos que leen las pantallas. */
function persona(
  id: string,
  nombreCompleto: string,
  roles: string[],
  estadoCuenta: string,
  createdAt: string,
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
    estadoCuenta,
    condicionesEspecialesIds: [],
    roles,
    datosLaborales: null,
    datosGobernanza: null,
    createdAt,
    ...extra,
  }
}

/**
 * Semilla con la forma de la base de desarrollo: 101 personas.
 *
 * Zoe (`personal`, ficha laboral) es la más vieja y Dora (`directiva`, ficha de gobernanza) la
 * segunda; las 99 restantes son propietarias y activas, más nuevas que las dos. Servido al revés
 * (`createdAt` DESC), la página 1 (100 filas) trae a las 99 propietarias + Dora, y Zoe queda en la
 * página 2.
 */
export function estadoBasePersonas(): EstadoApiPersonas {
  const personas: PersonaFalsa[] = [
    persona("p-zoe", "Zoe Inalcanzable", ["personal"], "inactiva", "2024-01-01T00:00:00.000Z", {
      datosLaborales: { cargo: "Conserje", afp: "Habitat" },
    }),
    persona("p-dora", "Dora Directiva", ["directiva"], "bloqueada", "2024-01-02T00:00:00.000Z", {
      datosGobernanza: { cargoDirectiva: "presidenta", fechaAsuncion: "2024-01-02" },
    }),
  ]
  for (let i = 1; i <= 99; i++) {
    const numero = String(i).padStart(3, "0")
    personas.push(
      persona(
        `p-relleno-${numero}`,
        `Persona ${numero} Propietaria`,
        ["propietario"],
        "activa",
        `2024-02-01T00:00:${String(i % 60).padStart(2, "0")}.000Z`
      )
    )
  }
  return { personas, vinculos: [], unidades: [], controles: [] }
}

/** Instala el servidor falso. El estado se puede mutar antes de renderizar. */
export function instalarApiPersonas(estado: EstadoApiPersonas = estadoBasePersonas()): ApiPersonas {
  const api: ApiPersonas = { peticiones: [], estado }

  vi.stubGlobal("fetch", async (entrada: RequestInfo | URL): Promise<Response> => {
    const crudo =
      typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url
    api.peticiones.push(crudo)
    const url = new URL(crudo, "http://localhost")
    const ruta = url.pathname

    if (ruta === "/api/personas") {
      // `createdAt` descendente: el orden del servidor real, que deja a la gente vieja al final.
      const ordenadas = [...estado.personas].reverse()
      return respuestaJson(paginar(filtrarPersonas(ordenadas, estado, url), url))
    }
    if (ruta === "/api/vinculos") return respuestaJson(paginar(estado.vinculos, url))
    if (ruta === "/api/unidades") return respuestaJson(paginar(estado.unidades, url))
    if (ruta === "/api/controles-propiedad") return respuestaJson(paginar(estado.controles, url))
    // Cualquier otra ruta es un contrato que el test no declaró: que falle a la vista.
    return respuestaJson({ error: `ruta no servida por el falso: ${ruta}` }, 404)
  })

  return api
}

/** URLs de las peticiones al padrón, en orden (excluye vínculos/unidades/controles). */
export function peticionesDePersonas(api: ApiPersonas): string[] {
  return api.peticiones.filter((url) => url.startsWith("/api/personas"))
}

/** Roles de directorio que el fake reconoce (para no repetir la lista en cada test). */
export const ROLES_DIRECTORIO_FALSO = ROLES_DIRECTORIO
