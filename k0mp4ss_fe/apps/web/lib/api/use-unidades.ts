"use client"

/**
 * use-unidades — colección de unidades EF y búsqueda de destino de la operación (F6).
 *
 * - `useUnidades(opciones?)`: hooks SWR para unidades EF (BD-FUENTE-VERDAD Fase 3). Sin
 *   opciones la clave SWR y las peticiones son las de siempre (`?pageSize=100`); con `q` la
 *   búsqueda la resuelve el servidor sobre TODA la colección, con `todasLasPaginas` la
 *   colección se completa a través de la misma paginación y con `mantenerFilasPrevias` las
 *   filas anteriores siguen en pantalla mientras la consulta nueva está en vuelo.
 * - `useUnidadesOperacion()`: padrón completo de la operación para los selects de los paneles PE
 *   (`pageSize=100`, el `LIMITE_SELECT` de `components/pe/aviso-truncamiento.tsx`), con el `total`
 *   del servidor para poder avisar el truncamiento en vez de cortar en silencio.
 * - `buscarUnidades()`: búsqueda por texto para el selector de «Unidad destino» de la bitácora
 *   PE. Pega en `GET /api/pe/unidades?q=`, la proyección de solo lectura de la operación de
 *   conserjería: cuatro campos, el scope de la sesión y el permiso `pe:bitacora`, que es el que
 *   tiene el rol que registra la visita. `/api/unidades` es el padrón completo y está detrás de
 *   `mp`, que conserjería no tiene: pedirlo ahí devolvía 403 al rol que lo necesita. Con el
 *   `{ page }` del selector forwardea `?page=` y devuelve `{ opciones, hayMas }`.
 * - `etiquetasDeUnidades(ids)`: etiquetas de una lista cerrada de ids contra `?ids=` de la misma
 *   proyección. Resuelve el rótulo de filas del día cuya unidad quedó fuera de la primera página
 *   del padrón (`pageSize=100`), que hoy muestra el id crudo que el conserje no puede leer.
 *
 * Mismo patrón que `buscarPersonaPorRun` en `use-personas.ts`: función suelta que propaga el
 * error, para que el consumidor decida si lo declara o cae a un padrón local.
 */
import * as React from "react"
import useSWR from "swr"
import { useCrudCollection, type CrudCollection } from "./use-crud-collection"
import type { Unidad } from "@/lib/schemas"
import type { ContextoBusqueda, PaginaOpciones } from "@/components/selector-buscable"
import {
  esUnidadDestino,
  etiquetaUnidad,
  type UnidadBuscable,
  type UnidadOpcion,
} from "@/lib/unidades-destino"

/** Colección EF (`/api/unidades`): la de siempre más el estado de la consulta en vuelo. */
export interface UseUnidadesResultado extends CrudCollection<Unidad> {
  /** Hay una consulta en vuelo (incluye la revalidación con las filas previas en pantalla). */
  isValidando: boolean
}

/** Opciones de lectura de la colección EF. Aditivas: sin ellas nada cambia. */
export interface UseUnidadesOpciones {
  /**
   * Búsqueda por texto resuelta en el servidor (`?q=` sobre número, etiqueta y rol SII).
   *
   * Es la forma correcta de buscar en el padrón: `/api/unidades` pagina de a 100 y la lista
   * llega ordenada por `createdAt` descendente, así que filtrar en el navegador solo ve la
   * primera página. Filtrar ahí deja fuera todo lo que no entró en esas 100 filas.
   */
  q?: string
  /**
   * Mantiene las filas de la consulta anterior mientras la nueva está en vuelo: el buscador no
   * vacía la tabla entre tecla y tecla. El `total` de la consulta previa se conserva con las
   * filas, para que el pie de paginación no salte.
   */
  mantenerFilasPrevias?: boolean
  /**
   * Completa la colección pidiendo las páginas siguientes hasta agotar el `total` del servidor.
   * Es para las vistas que CUENTAN filas (saldos por tipo, cantidades): un conteo sobre la
   * primera página miente. Usa la misma paginación de `cargarMas`, con un tope de seguridad.
   */
  todasLasPaginas?: boolean
}

/**
 * Tope de páginas que `todasLasPaginas` pide solo: corta un bucle si el servidor devolviera
 * páginas vacías con `total` todavía mayor.
 */
const MAXIMO_PAGINAS_AUTO = 50

/**
 * Colección de unidades EF.
 *
 * Sin opciones, la clave SWR es `?pageSize=100` —la misma de los consumidores que ya existían—
 * así que esos consumidores no cambian de caché ni de petición.
 */
export function useUnidades(opciones: UseUnidadesOpciones = {}): UseUnidadesResultado {
  const q = opciones.q?.trim() ?? ""
  const mantenerFilasPrevias = opciones.mantenerFilasPrevias === true
  const todasLasPaginas = opciones.todasLasPaginas === true

  // Con `q` la búsqueda viaja al servidor; sin `q` la query queda vacía y la URL es la de antes.
  const coleccion = useCrudCollection<Unidad>(
    "/api/unidades",
    q ? `pageSize=100&q=${encodeURIComponent(q)}` : ""
  )
  const url = q ? `/api/unidades?pageSize=100&q=${encodeURIComponent(q)}` : "/api/unidades?pageSize=100"

  /**
   * Última consulta resuelta con filas: es lo que se sigue viendo mientras la siguiente está
   * en vuelo. Se guarda por URL para que una respuesta de otro término no se mezcle.
   */
  const [ultima, setUltima] = React.useState<{
    url: string
    filas: Unidad[]
    total: number
  } | null>(null)

  const filasFrescas = coleccion.items
  const cargandoPrimera = coleccion.isLoading
  const totalFresco = coleccion.total

  // Ajuste durante el render (mismo patrón que usa la pantalla de estructura para «storing
  // information from previous renders»): la última consulta resuelta queda como referencia sin
  // un effect que dispare un segundo render. Una consulta sin resultados no se guarda: el vacío
  // es una respuesta, no un error que haya que tapar con filas viejas.
  const ultimaDesactualizada =
    ultima === null || ultima.url !== url || ultima.filas !== filasFrescas
  if (
    mantenerFilasPrevias &&
    !cargandoPrimera &&
    filasFrescas.length > 0 &&
    ultimaDesactualizada
  ) {
    setUltima({ url, filas: filasFrescas, total: totalFresco })
  }

  const mostrandoPrevias =
    mantenerFilasPrevias && cargandoPrimera && filasFrescas.length === 0 && ultima !== null

  const items = mostrandoPrevias ? ultima.filas : filasFrescas
  const total = mostrandoPrevias ? ultima.total : totalFresco
  const hasMore = items.length < total

  // Auto-paginación: un pedido por tamaño de colección. Así una página vacía no deja el bucle
  // girando (el contador de filas no cambia y no se vuelve a pedir) y el tope acota el resto.
  const ultimoPedidoRef = React.useRef(-1)
  const paginasAutoRef = React.useRef(0)
  const { cargarMas, cargandoMas } = coleccion

  React.useEffect(() => {
    paginasAutoRef.current = 0
    ultimoPedidoRef.current = -1
  }, [url])

  React.useEffect(() => {
    if (!todasLasPaginas) return
    if (cargandoPrimera || cargandoMas) return
    if (!hasMore) return
    if (paginasAutoRef.current >= MAXIMO_PAGINAS_AUTO) return
    if (ultimoPedidoRef.current === items.length) return
    ultimoPedidoRef.current = items.length
    paginasAutoRef.current += 1
    void cargarMas()
  }, [todasLasPaginas, cargandoPrimera, cargandoMas, hasMore, items.length, cargarMas])

  return {
    ...coleccion,
    items,
    total,
    hasMore,
    isValidando: cargandoPrimera,
  }
}

const LISTA = "/api/pe/unidades"

/**
 * Tamaño de página de la búsqueda: más chico que el tope de la ruta (100) para que el listbox
 * del selector no monte cientos de opciones por tecla.
 */
const PAGE_SIZE_BUSQUEDA = 25

/** Tamaño de página del padrón completo: coincide con `LIMITE_SELECT` (AvisoTruncamiento). */
const PAGE_SIZE_PADRON = 100

/**
 * Tamaño del lote por petición de etiquetas: es el tope de la lista cerrada `?ids=` de la ruta
 * (`MAXIMO_IDS` en `app/api/pe/unidades/route.ts`). Lotes mayores se parten en varias peticiones.
 */
const LOTE_ETIQUETAS = 50

/**
 * Fetcher SWR del padrón de la operación: lanza Error con el mensaje del cuerpo cuando el HTTP
 * falla, mismo estilo que el resto de los hooks de `lib/api/`.
 */
async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } })
  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(cuerpo?.error ?? `Error ${res.status} al consultar ${url}.`)
  }
  return (await res.json()) as T
}

interface ColeccionUnidadesOperacion {
  data: UnidadBuscable[]
  pageSize: number
  total: number
}

export interface UseUnidadesOperacionResultado {
  unidades: UnidadBuscable[]
  /**
   * Total de unidades que reporta el servidor para el scope activo.
   *
   * La lista se pide con `pageSize=100`, así que `unidades.length` puede ser menor que `total`:
   * el consumidor DEBE avisar en pantalla cuando `total > unidades.length` en vez de truncar en
   * silencio (ver `components/pe/aviso-truncamiento.tsx`).
   */
  total: number
  isLoading: boolean
  error: Error | null
}

/**
 * Padrón completo de unidades destino de la operación, paginado al tope del selector.
 *
 * Pega en `GET /api/pe/unidades?pageSize=100`, la proyección de solo lectura gobernada por
 * `pe:bitacora` (el padrón de `mp` le devuelve 403 a la conserjería). El filtro
 * `esUnidadDestino` de la vista NO se aplica acá: la ruta ya excluye las plazas, y el total
 * del envelope se referencia contra lo que efectivamente devuelve.
 */
export function useUnidadesOperacion(): UseUnidadesOperacionResultado {
  const url = `${LISTA}?pageSize=${PAGE_SIZE_PADRON}`
  const { data, error, isLoading } = useSWR<ColeccionUnidadesOperacion, Error>(url, fetcher, {
    revalidateOnFocus: true,
  })

  return {
    unidades: data?.data ?? [],
    total: data?.total ?? 0,
    isLoading,
    error: error ?? null,
  }
}

/**
 * Resuelve las etiquetas de una lista cerrada de unidades por id (F6, rótulos del día).
 *
 * Pega en `GET /api/pe/unidades?ids=…` y devuelve `{ id: etiqueta }` con la MISMA etiqueta
 * (`etiquetaUnidad`) que muestran el selector y la tabla. Tolerante a fallos: cualquier error de
 * red o HTTP devuelve `{}` y la fila sigue mostrando el id, como hasta hoy, en vez de romper el
 * panel. Deduplica y parte en lotes de 50 si la lista pasa el tope de la ruta.
 */
export async function etiquetasDeUnidades(ids: string[]): Promise<Record<string, string>> {
  const unicos = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
  if (unicos.length === 0) return {}

  const etiquetas: Record<string, string> = {}
  for (let inicio = 0; inicio < unicos.length; inicio += LOTE_ETIQUETAS) {
    const lote = unicos.slice(inicio, inicio + LOTE_ETIQUETAS)
    try {
      const res = await fetch(
        `${LISTA}?ids=${encodeURIComponent(lote.join(","))}`,
        { headers: { accept: "application/json" } }
      )
      if (!res.ok) return {}
      const coleccion = (await res.json()) as { data?: UnidadBuscable[] }
      for (const unidad of coleccion.data ?? []) {
        etiquetas[unidad.id] = etiquetaUnidad(unidad)
      }
    } catch {
      // Sin red o con error HTTP: la fila sigue mostrando el id, no se rompe la pantalla.
      return {}
    }
  }
  return etiquetas
}

/**
 * Busca unidades destino por texto y devuelve las opciones listas para el selector.
 *
 * La ruta ya excluye las plazas de estacionamiento; se filtra otra vez acá como guarda, porque
 * esta lista también alimenta la preselección de la identidad leída del QR.
 *
 * Sin `contexto` devuelve la lista suelta de siempre (una sola página de `PAGE_SIZE_BUSQUEDA`),
 * así que los consumidores que no paginan no cambian. Con `contexto` —el `{ page }` que pasa
 * `components/selector-buscable.tsx`— forwardea `?page=` a la ruta y devuelve `{ opciones, hayMas }`
 * calculado contra el `total` del servidor: es lo que habilita «Cargar más resultados» en vez de
 * dejar al conserje viendo las primeras 25 unidades de una búsqueda que tiene más.
 */
export function buscarUnidades(q: string): Promise<UnidadOpcion[]>
export function buscarUnidades(
  q: string,
  contexto: ContextoBusqueda
): Promise<PaginaOpciones>
export async function buscarUnidades(
  q: string,
  contexto?: ContextoBusqueda
): Promise<UnidadOpcion[] | PaginaOpciones> {
  const termino = q.trim()
  if (!termino) return contexto ? { opciones: [], hayMas: false } : []
  const page = Math.max(1, Math.trunc(contexto?.page ?? 1) || 1)
  // `page` va al final y solo cuando el consumidor pagina: sin contexto la URL es la de antes.
  const sufijoPagina = contexto ? `&page=${page}` : ""
  const url = `${LISTA}?q=${encodeURIComponent(termino)}&pageSize=${PAGE_SIZE_BUSQUEDA}${sufijoPagina}`
  const res = await fetch(url, { headers: { accept: "application/json" } })
  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(cuerpo?.error ?? `Error ${res.status} al buscar unidades.`)
  }
  const coleccion = (await res.json()) as {
    data?: UnidadBuscable[]
    pageSize?: number
    total?: number
  }
  const opciones = (coleccion.data ?? [])
    .filter(esUnidadDestino)
    .map((unidad) => ({ id: unidad.id, etiqueta: etiquetaUnidad(unidad) }))
  if (!contexto) return opciones
  // Quedan páginas mientras el borde de esta página no alcance el total del servidor.
  const tamanoPagina = coleccion.pageSize ?? PAGE_SIZE_BUSQUEDA
  return { opciones, hayMas: page * tamanoPagina < (coleccion.total ?? 0) }
}
