/**
 * api-ir-mt-falsa — servidor REST en memoria para las pantallas de inventario IR y MT.
 *
 * `/inventario/recursos` y `/inventario/proyectos` leen con los hooks de `lib/api/`, que pegan en
 * rutas REST reales. Este archivo reemplaza `fetch` por un manejador que respeta el contrato de
 * `lib/api/crud-factory.ts`, en particular la regla que causaba el defecto medido:
 *
 * - `GET` lista pagina de a 100 (`pageSize` con tope 100, `page` con `skip`) y ordena por
 *   `createdAt` DESCENDENTE.
 *
 * Ninguna de las dos colecciones acepta `?q=`: `/api/ir/recursos`, `/api/mt/trabajos` y
 * `/api/mt/proyectos` no declaran `busqueda` en su `createCrudHandlers`, así que el servidor ignora
 * el parámetro. Por eso la única forma de ver una fila que no está en la página 1 es pedir la
 * página siguiente (`&page=2`), que es lo que hace el arreglo de estas pantallas.
 *
 * La semilla de cada caso pone las filas que importan (EPP, ciclos preventivos) entre las MÁS
 * VIEJAS, así que el orden descendente las deja fuera de la primera página: exactamente el caso
 * del defecto.
 *
 * `instalarApiIrMt()` llama `vi.stubGlobal("fetch", …)`; el test limpia con
 * `vi.unstubAllGlobals()` en el `afterEach`.
 */
import { vi } from "vitest"
import type {
  CategoriaRecursoIR,
  EntregaEPP,
  ProyectoMT,
  RecursoIR,
  SolicitudInsumoIR,
  TrabajoMT,
} from "@/lib/schemas"

export interface EstadoApiIrMt {
  /** Colecciones en orden de `createdAt` ASCENDENTE: el servidor las sirve al revés. */
  recursos: RecursoIR[]
  trabajos: TrabajoMT[]
  proyectos: ProyectoMT[]
  solicitudes: SolicitudInsumoIR[]
  entregas: EntregaEPP[]
  personas: Record<string, unknown>[]
  unidades: Record<string, unknown>[]
  microSectores: Record<string, unknown>[]
  maestros: Record<string, Record<string, unknown>[]>
}

export interface ApiIrMt {
  /** URL de cada petición que atravesó el servidor falso, en orden. */
  peticiones: string[]
  estado: EstadoApiIrMt
}

/** Tope de `pageSize` de `crud-factory` (GET lista). */
const PAGE_SIZE_MAXIMO = 100
const PAGE_SIZE_POR_DEFECTO = 50

function respuestaJson(datos: unknown, status = 200): Response {
  return new Response(JSON.stringify(datos), {
    status,
    headers: { "content-type": "application/json" },
  })
}

/** Página pedida con el mismo `skip`/`take` y el mismo envelope que el servidor real. */
function paginar<T>(filas: T[], url: URL): { data: T[]; page: number; pageSize: number; total: number } {
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

/** Catálogo vacío con todas las colecciones que leen las dos pantallas. */
export function estadoVacio(): EstadoApiIrMt {
  return {
    recursos: [],
    trabajos: [],
    proyectos: [],
    solicitudes: [],
    entregas: [],
    personas: [],
    unidades: [],
    microSectores: [],
    maestros: {},
  }
}

/** Un recurso IR con los campos que lee la pantalla del catálogo. */
export function recurso(
  id: string,
  nombre: string,
  categoria: CategoriaRecursoIR,
  extra: Partial<RecursoIR> = {}
): RecursoIR {
  return {
    id,
    codigo: `IR-A-${id}`,
    nombre,
    categoria,
    estadoActivo: "disponible",
    stock: 1,
    esCritico: false,
    ...extra,
  }
}

/** Un trabajo MT con los campos que leen las pestañas de trabajos y de prevención. */
export function trabajo(
  id: string,
  folio: string,
  titulo: string,
  extra: Partial<TrabajoMT> = {}
): TrabajoMT {
  return {
    id,
    folio,
    titulo,
    descripcion: "Descripción técnica de prueba con más de veinte caracteres.",
    prioridad: "media",
    estado: "planificado",
    costoTotal: 1_000,
    origenFondos: "gasto_comun",
    estadoPago: "pendiente",
    alertaGarantiaEnviada: false,
    evidencias: [],
    ...extra,
  }
}

/** Un proyecto MT de largo plazo. */
export function proyecto(id: string, nombre: string, extra: Partial<ProyectoMT> = {}): ProyectoMT {
  return {
    id,
    nombre,
    presupuestoEstimado: 12_000_000,
    plazoMeses: 12,
    estado: "planificado",
    ...extra,
  }
}

/**
 * Instala el servidor falso. Devuelve el registro de peticiones y el estado, que el caso puede
 * mutar antes de renderizar para preparar escenarios.
 */
export function instalarApiIrMt(estado: EstadoApiIrMt = estadoVacio()): ApiIrMt {
  const api: ApiIrMt = { peticiones: [], estado }

  vi.stubGlobal("fetch", async (entrada: RequestInfo | URL): Promise<Response> => {
    const crudo = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url
    api.peticiones.push(crudo)
    const url = new URL(crudo, "http://localhost")
    const ruta = url.pathname

    // El servidor real ordena por `createdAt` descendente: la semilla viene al revés.
    if (ruta === "/api/ir/recursos") {
      return respuestaJson(paginar([...estado.recursos].reverse(), url))
    }
    if (ruta === "/api/ir/solicitudes-insumo") {
      return respuestaJson(paginar([...estado.solicitudes].reverse(), url))
    }
    if (ruta === "/api/ir/entregas-epp") {
      return respuestaJson(paginar([...estado.entregas].reverse(), url))
    }
    if (ruta === "/api/mt/trabajos") {
      return respuestaJson(paginar([...estado.trabajos].reverse(), url))
    }
    if (ruta === "/api/mt/proyectos") {
      return respuestaJson(paginar([...estado.proyectos].reverse(), url))
    }
    if (ruta === "/api/personas") return respuestaJson(paginar(estado.personas, url))
    if (ruta === "/api/unidades") return respuestaJson(paginar(estado.unidades, url))
    if (ruta === "/api/micro-sectores") return respuestaJson(paginar(estado.microSectores, url))
    if (ruta.startsWith("/api/maestros/")) {
      const tipoMaestro = ruta.slice("/api/maestros/".length)
      const filas = estado.maestros[tipoMaestro] ?? []
      return respuestaJson({ data: filas, page: 1, pageSize: PAGE_SIZE_MAXIMO, total: filas.length })
    }

    // Ruta no servida: se ve en el mensaje en vez de esconderse detrás de una lista vacía.
    return respuestaJson({ error: `api-ir-mt-falsa: ruta no servida ${ruta}` }, 404)
  })

  return api
}
