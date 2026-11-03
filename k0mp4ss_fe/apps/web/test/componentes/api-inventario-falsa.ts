/**
 * api-inventario-falsa — servidor REST en memoria para las pantallas de inventario EF.
 *
 * `/inventario/estructura` y `/inventario/tipos` leen con los hooks de `lib/api/`, que pegan en
 * rutas REST reales. Este archivo reemplaza `fetch` por un manejador que respeta el contrato de
 * `lib/api/crud-factory.ts`, en particular las dos reglas que causaban el defecto medido:
 *
 * - `GET /api/unidades` pagina de a 100 (`pageSize` con tope 100, `page` con `skip`) y ordena por
 *   `createdAt` DESCENDENTE;
 * - `?q=` filtra en el servidor por `numero`, `etiqueta` y `rolSii`.
 *
 * La semilla replica la forma de la base de desarrollo: 184 unidades, 80 de ellas departamentos,
 * y los departamentos son los MÁS VIEJOS (`createdAt` ascendente primero), así que el orden
 * descendente los deja fuera de la primera página. Con eso, cualquier pantalla que filtre en el
 * navegador la página 1 no puede encontrar un departamento: es exactamente el caso del defecto.
 *
 * Contrato servido:
 * - `GET /api/{unidades,tipos-unidad,macro-sectores,micro-sectores,personas,vinculos}` →
 *   `{ data, page, pageSize, total }` (envelope de `crud-factory`).
 * - `GET /api/maestros/<tipo>` → mismo envelope, sin paginación real (los maestros son chicos).
 *
 * `peticiones` guarda cada URL pedida para que los casos puedan afirmar qué viajó al servidor.
 */
import { vi } from "vitest"
import type {
  MacroSector,
  MicroSector,
  TipoUnidad,
  Unidad,
} from "@/data/inventario/estructura"

export interface EstadoApiInventario {
  /** Unidades en el orden de `createdAt` ASCENDENTE: el servidor las sirve al revés. */
  unidades: Unidad[]
  tipos: TipoUnidad[]
  macroSectores: MacroSector[]
  microSectores: MicroSector[]
  maestros: Record<string, Record<string, unknown>[]>
  personas: Record<string, unknown>[]
  vinculos: Record<string, unknown>[]
}

export interface ApiInventario {
  /** URL de cada petición que atravesó el servidor falso, en orden. */
  peticiones: string[]
  estado: EstadoApiInventario
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

/** `?q=` del servidor: `contains` sobre los campos que declara la ruta de unidades. */
function buscarUnidades(filas: Unidad[], q: string): Unidad[] {
  const termino = q.trim().toLowerCase()
  if (!termino) return filas
  return filas.filter((u) =>
    [u.numero, u.etiqueta, u.rolSii].some((campo) =>
      (campo ?? "").toLowerCase().includes(termino)
    )
  )
}

function tipo(id: string, nombre: string, categoria: string, metraje: number, monto: number): TipoUnidad {
  return {
    id,
    nombre,
    categoria,
    metraje,
    montoBaseGc: monto,
    activo: true,
    historialTarifas: [
      { id: `tar-${id}`, monto, fechaVigencia: "2024-01-01", creadoEn: "2023-11-15" },
    ],
  }
}

/** Una unidad EF con los campos que leen las dos pantallas. */
function unidad(
  id: string,
  numero: string,
  etiqueta: string,
  tipoUnidadId: string,
  rolSii: string
): Unidad {
  return {
    id,
    microSectorId: "micro-a-1",
    numero,
    etiqueta,
    tipoUnidadId,
    metraje: 55.5,
    prorrateo: 0.05,
    rolSii,
    estadoId: "est-ocupada",
    servicios: {},
  }
}

/**
 * Semilla con la forma de la base de desarrollo: 184 unidades y 80 departamentos, los más viejos.
 *
 * Orden `createdAt` ascendente = orden del arreglo: departamentos (101–180), estacionamientos,
 * estacionamientos de visita y locales. Servido al revés, la página 1 (100 filas) es
 * locales + estacionamientos y NO trae un solo departamento.
 */
export function estadoBase(): EstadoApiInventario {
  const unidades: Unidad[] = []

  for (let i = 1; i <= 80; i++) {
    const numero = String(100 + i) // 101…180
    const tipoUnidadId = i <= 40 ? "tipo-a" : "tipo-b"
    unidades.push(unidad(`u-depto-${numero}`, numero, "Depto", tipoUnidadId, `900-${numero}`))
  }
  for (let i = 1; i <= 80; i++) {
    unidades.push(unidad(`u-est-${i}`, `E-${String(i).padStart(3, "0")}`, "Estacionamiento", "tipo-es-1", `800-${i}`))
  }
  for (let i = 1; i <= 20; i++) {
    unidades.push(
      unidad(`u-evis-${i}`, `V-${String(i).padStart(3, "0")}`, "Estacionamiento Visita", "tipo-es-visita", `700-${i}`)
    )
  }
  for (let i = 1; i <= 4; i++) {
    const tipoUnidadId = i === 1 ? "local-a" : "local-b"
    unidades.push(unidad(`u-local-${i}`, `L-0${i}`, "Local", tipoUnidadId, `600-0${i}`))
  }

  return {
    unidades,
    tipos: [
      tipo("tipo-a", "Depto Tipo A", "Depto", 55.5, 45000),
      tipo("tipo-b", "Depto Tipo B", "Depto", 42, 35000),
      tipo("local-a", "Local Comercial A (Grande)", "Local", 120, 95000),
      tipo("local-b", "Local Comercial B (Estándar)", "Local", 60, 50000),
      tipo("tipo-es-1", "Estacionamiento Estándar", "Estacionamiento", 12.5, 5000),
      tipo("tipo-es-visita", "Estacionamiento Visita", "Estacionamiento", 12.5, 0),
    ],
    macroSectores: [{ id: "macro-a", nombre: "A", etiqueta: "Torre" }],
    microSectores: [{ id: "micro-a-1", macroSectorId: "macro-a", nombre: "Piso 1", etiqueta: "Piso" }],
    maestros: {
      "estados-ocupacion": [{ id: "est-ocupada", nombre: "Ocupada", color: "bg-red-100 text-red-800" }],
      "categorias-unidad": [{ id: "cat-depto", nombre: "Depto" }],
      "categorias-macro": [{ id: "cat-torre", nombre: "Torre" }],
      "categorias-micro": [{ id: "cat-piso", nombre: "Piso" }],
    },
    personas: [],
    vinculos: [],
  }
}

/**
 * Instala el servidor falso. Devuelve el registro de peticiones y el estado, que el caso puede
 * mutar antes de renderizar para preparar escenarios.
 */
export function instalarApiInventario(estado: EstadoApiInventario = estadoBase()): ApiInventario {
  const api: ApiInventario = { peticiones: [], estado }

  vi.stubGlobal("fetch", async (entrada: RequestInfo | URL): Promise<Response> => {
    const crudo = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url
    api.peticiones.push(crudo)
    const url = new URL(crudo, "http://localhost")
    const ruta = url.pathname

    if (ruta === "/api/unidades") {
      // `createdAt` descendente: el servidor real ordena así y por eso la página 1 no trae deptos.
      const ordenadas = [...estado.unidades].reverse()
      const filtradas = buscarUnidades(ordenadas, url.searchParams.get("q") ?? "")
      return respuestaJson(paginar(filtradas, url))
    }
    if (ruta === "/api/tipos-unidad") return respuestaJson(paginar(estado.tipos, url))
    if (ruta === "/api/macro-sectores") return respuestaJson(paginar(estado.macroSectores, url))
    if (ruta === "/api/micro-sectores") return respuestaJson(paginar(estado.microSectores, url))
    if (ruta === "/api/personas") return respuestaJson(paginar(estado.personas, url))
    if (ruta === "/api/vinculos") return respuestaJson(paginar(estado.vinculos, url))
    if (ruta.startsWith("/api/maestros/")) {
      const tipoMaestro = ruta.slice("/api/maestros/".length)
      return respuestaJson({
        data: estado.maestros[tipoMaestro] ?? [],
        page: 1,
        pageSize: PAGE_SIZE_MAXIMO,
        total: estado.maestros[tipoMaestro]?.length ?? 0,
      })
    }

    // Ruta no servida: se ve en el mensaje en vez de esconderse detrás de una lista vacía.
    return respuestaJson({ error: `api-inventario-falsa: ruta no servida ${ruta}` }, 404)
  })

  return api
}
