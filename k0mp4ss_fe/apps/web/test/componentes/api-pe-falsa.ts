/**
 * api-pe-falsa — servidor REST en memoria para los casos de los paneles PE.
 *
 * Los tres paneles (`components/pe/{visitas,encomiendas,contratistas}-panel.tsx`) ya no usan el
 * store zustand: leen y escriben con los hooks de `lib/api/`, que pegan en rutas REST reales.
 * Este archivo reemplaza `fetch` por un manejador en memoria que respeta el mismo contrato, para
 * que cada test afirme el efecto observable por la interfaz pública:
 *
 * - el cuerpo de la petición que el panel manda (`peticiones` exclusivo de escrituras);
 * - la fila que se renderiza (el estado del servidor alimenta las respuestas revalidadas);
 * - el mensaje que recibe el usuario (`onSuccess` / `onError`).
 *
 * Contrato servido:
 * - `GET /api/pe/unidades?...` y `GET /api/pe/personas?...` → `{ data, pageSize, total }`.
 *   Soportan `?q=` (contains, minúsculas) y — para personas — `?rut=`.
 * - `GET /api/maestros/<tipo>?pageSize=100`, `GET /api/pe/maestros/<tipo>` (proyección de la
 *   operación), `GET /api/vinculos?pageSize=100` y
 *   `GET /api/pe/bitacora-visitas|encomiendas|ingresos-contratistas?pageSize=100` →
 *   `{ data, page: 1, pageSize, total }` con `data` recortada al pageSize pedido.
 * - `POST` a las bases → upsert por `body.id`; responde la fila con 201 (200 si ya existía).
 * - `PUT <base>/<id>` → merge parcial, responde la fila.
 * - `DELETE <base>/<id>` → elimina y responde `{ ok: true }`.
 *
 * `instalarApiPE()` llama `vi.stubGlobal("fetch", ...)`; el test limpia con
 * `vi.unstubAllGlobals()` en el `afterEach`. El estado queda vivo: se puede mutar para preparar
 * escenarios y las mutaciones vía API se reflejan en las mismas listas.
 */
import { vi } from "vitest"
import { normalizarRun } from "@/lib/validacion-rut"
import type {
  BitacoraVisitaPE,
  EncomiendaPE,
  IngresoContratistaPE,
  VinculoUnidad,
} from "@/lib/schemas"

/** Registro de cada petición que atraviesa el servidor falso. */
export interface PeticionApiPE {
  metodo: string
  url: string
  /** Cuerpo tal como lo mandó el panel (undefined en GET y DELETE). */
  cuerpo?: unknown
}

/** Filas por defecto que alimentan los paneles en estado base. */
export interface EstadoApiPE {
  /** Padrón de operación: proyecto mínimo `/api/pe/personas`. */
  personas: { id: string; rut: string; nombreCompleto: string }[]
  unidades: { id: string; numero: string; etiqueta: string; rolSii: string }[]
  jornadas: { id: string; nombre: string }[]
  couriers: { id: string; nombre: string }[]
  contratistas: { id: string; nombre: string }[]
  vinculos: VinculoUnidad[]
  bitacora: BitacoraVisitaPE[]
  encomiendas: EncomiendaPE[]
  ingresos: IngresoContratistaPE[]
  /**
   * Cuando `true`, `GET /api/pe/personas?rut=` responde 500 pero el padrón
   * `?pageSize=100` sigue respondiendo bien: es el escenario «sin red justo en
   * la consulta del RUN, con el padrón ya cargado».
   */
  fallarRutPersona: boolean
}

export interface OpcionesApiPE extends Partial<Omit<EstadoApiPE, "fallarRutPersona">> {
  fallarRutPersona?: boolean
}

export interface ApiPE {
  peticiones: PeticionApiPE[]
  /** Estado vivo del servidor (mutarlo prepara escenarios; las escrituras se reflejan acá). */
  estado: EstadoApiPE
  /** Escrituras (todo lo que NO fue GET), para afirmar qué mandó el panel. */
  escrituras: () => PeticionApiPE[]
}

/** Persona del padrón que usa por defecto `resolverCoincidencia` del QR de la cédula. */
export const PERSONA_P1 = {
  id: "p-1",
  rut: "15.123.456-9",
  nombreCompleto: "Juan Pérez González",
}

/** Depto 101 (torre A): coincide con el vínculo por defecto del padrón. */
export const UNIDAD_A101 = { id: "u-A-101", numero: "101", etiqueta: "Depto", rolSii: "123-A11" }
/** Plaza de estacionamiento homónima por prefijo de id: NO es destino de visita. */
export const UNIDAD_E001 = { id: "u-E-001", numero: "E-001", etiqueta: "Estacionamiento", rolSii: "" }

function semillaPorDefecto(): EstadoApiPE {
  return {
    personas: [PERSONA_P1],
    unidades: [UNIDAD_A101, UNIDAD_E001],
    jornadas: [{ id: "j-manana", nombre: "Mañana" }],
    couriers: [{ id: "co-chilex", nombre: "Chilexpress" }],
    contratistas: [{ id: "ct-servex", nombre: "Servex Ltda." }],
    vinculos: [
      {
        id: "vu-1",
        personaId: "p-1",
        unidadId: "u-A-101",
        rol: "propietario",
        fechaInicio: "2024-01-01",
        permiteVerFinanzas: true,
      },
    ],
    bitacora: [],
    encomiendas: [],
    ingresos: [],
    fallarRutPersona: false,
  }
}

function respuestaJson(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function cuerpoDe(init?: RequestInit): Record<string, unknown> {
  if (typeof init?.body !== "string") return {}
  try {
    return JSON.parse(init.body) as Record<string, unknown>
  } catch {
    return {}
  }
}

interface EntradaBase {
  base: string
  coleccion: keyof EstadoApiPE
}

/** Fila genérica de cualquier colección del estado (siempre tiene id). */
type FilaApi = Record<string, unknown> & { id: string }

const BASES: EntradaBase[] = [
  { base: "/api/vinculos", coleccion: "vinculos" },
  { base: "/api/pe/bitacora-visitas", coleccion: "bitacora" },
  { base: "/api/pe/encomiendas", coleccion: "encomiendas" },
  { base: "/api/pe/ingresos-contratistas", coleccion: "ingresos" },
]

const MAESTROS: Record<string, keyof EstadoApiPE> = {
  jornadas: "jornadas",
  couriers: "couriers",
  contratistas: "contratistas",
}

/**
 * Instala el servidor falso como `fetch` global y devuelve el registro de peticiones + estado.
 * Cada llamada crea un servidor limpio: no hay estado compartido entre tests.
 */
export function instalarApiPE(opciones: OpcionesApiPE = {}): ApiPE {
  const estado: EstadoApiPE = { ...semillaPorDefecto(), ...opciones }
  const peticiones: PeticionApiPE[] = []

  const respuestaFetch = async (entrada: unknown, init?: RequestInit): Promise<Response> => {
    const url = typeof entrada === "string" ? entrada : String(entrada)
    const metodo = (init?.method ?? "GET").toUpperCase()
    const parseada = new URL(url, "http://localhost")
    const path = parseada.pathname
    const search = parseada.searchParams
    const registro: PeticionApiPE = {
      metodo,
      url: `${path}${parseada.search}`,
      ...(metodo === "GET" || metodo === "DELETE" ? {} : { cuerpo: cuerpoDe(init) }),
    }
    peticiones.push(registro)
    const pageSize = Math.max(Number(search.get("pageSize") ?? "100") || 100, 0)

    // --- Proyecciones de solo lectura de la operación (`{ data, pageSize, total }`) ---
    if (path === "/api/pe/personas" && metodo === "GET") {
      const filtroRut = search.get("rut")
      const filtroIds = search.get("ids")
      if (filtroRut && estado.fallarRutPersona) {
        return respuestaJson({ error: "Error 500 al consultar la ruta." }, 500)
      }
      const canonico = filtroRut ? normalizarRun(filtroRut) : null
      let filas = estado.personas
      if (filtroIds !== null) {
        // Lista cerrada: solo los ids pedidos (los de la lista vacía no filtran nada).
        const ids = filtroIds.split(",").map((s) => s.trim()).filter(Boolean)
        filas = filas.filter((p) => ids.includes(p.id))
      } else if (canonico) {
        filas = filas.filter((p) => normalizarRun(p.rut) === canonico)
      } else if (!filtroRut) {
        const termino = (search.get("q") ?? "").toLowerCase()
        filas = termino
          ? filas.filter((p) =>
              `${p.nombreCompleto} ${p.rut}`.toLowerCase().includes(termino)
            )
          : filas
      }
      return respuestaJson({
        data: filas.slice(0, pageSize || 100),
        pageSize: pageSize || 100,
        total: filas.length,
      })
    }
    if (path === "/api/pe/unidades" && metodo === "GET") {
      const filtroIds = search.get("ids")
      let candidatas = estado.unidades
      if (filtroIds !== null) {
        // Lista cerrada: solo los ids pedidos (los de la lista vacía no filtran nada).
        const ids = filtroIds.split(",").map((s) => s.trim()).filter(Boolean)
        candidatas = candidatas.filter((u) => ids.includes(u.id))
      } else {
        const termino = (search.get("q") ?? "").toLowerCase()
        candidatas = termino
          ? candidatas.filter((u) =>
              `${u.numero} ${u.etiqueta} ${u.rolSii}`.toLowerCase().includes(termino)
            )
          : candidatas
      }
      // La lista cerrada no se trunca por pageSize: el panel necesita TODAS las etiquetas pedidas.
      const filas = filtroIds !== null ? candidatas : candidatas.slice(0, pageSize || 100)
      return respuestaJson({
        data: filas,
        pageSize: pageSize || 100,
        total: filas.length,
      })
    }

    // --- Maestros (`/api/maestros/<tipo>` y su proyección de operación `/api/pe/maestros/<tipo>`) ---
    const prefijoMaestro = ["/api/pe/maestros/", "/api/maestros/"].find((p) =>
      path.startsWith(p)
    )
    const tipoMaestro = prefijoMaestro ? path.slice(prefijoMaestro.length) : null
    if (tipoMaestro) {
      const coleccionMaestro = MAESTROS[tipoMaestro]
      const filas = (coleccionMaestro ? estado[coleccionMaestro] : []) as FilaApi[]
      return respuestaJson({
        data: filas.slice(0, pageSize || 100),
        page: 1,
        pageSize: pageSize || 100,
        total: filas.length,
      })
    }

    // --- Colecciones CRUD paginadas (VU + las tres bases PE) ---
    if (metodo === "GET") {
      const entrada = BASES.find((b) => b.base === path)
      if (entrada) {
        const filas = estado[entrada.coleccion] as FilaApi[]
        return respuestaJson({
          data: filas.slice(0, pageSize || 100),
          page: 1,
          pageSize: pageSize || 100,
          total: filas.length,
        })
      }
      return respuestaJson({ error: `Ruta no respondida por el servidor falso: ${path}` }, 404)
    }

    const entradaConId = BASES.find((b) => path === b.base || path.startsWith(`${b.base}/`))
    if (!entradaConId) {
      return respuestaJson({ error: `Ruta no respondida por el servidor falso: ${path}` }, 404)
    }
    const filas = estado[entradaConId.coleccion] as FilaApi[]

    if (metodo === "POST") {
      const fila = registro.cuerpo ?? {}
      const id = String((fila as { id?: unknown }).id ?? "")
      const indice = filas.findIndex((f) => f.id === id)
      if (indice >= 0) {
        filas[indice] = { ...filas[indice], ...(fila as FilaApi) }
        return respuestaJson(filas[indice], 200)
      }
      filas.push(fila as FilaApi)
      return respuestaJson(fila, 201)
    }

    const id = path.slice(entradaConId.base.length + 1)
    const indice = filas.findIndex((f) => f.id === id)

    if (metodo === "PUT") {
      if (indice < 0) {
        return respuestaJson({ error: `No existe la fila ${id} en ${entradaConId.base}.` }, 404)
      }
      filas[indice] = { ...filas[indice], ...cuerpoDe(init), id } as FilaApi
      return respuestaJson(filas[indice])
    }
    if (metodo === "DELETE") {
      const fila = indice >= 0 ? filas.splice(indice, 1)[0] : null
      return respuestaJson(fila ? { ok: true } : { error: `No existe la fila ${id}.` }, indice >= 0 ? 200 : 404)
    }
    return respuestaJson({ error: `Método no soportado: ${metodo}` }, 405)
  }

  vi.stubGlobal("fetch", vi.fn(respuestaFetch))
  return {
    peticiones,
    estado,
    escrituras: () => peticiones.filter((p) => p.metodo !== "GET"),
  }
}
