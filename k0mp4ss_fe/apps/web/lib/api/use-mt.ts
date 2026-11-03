"use client"

/** use-mt — hooks SWR para Mantenimiento y Proyectos MT (Fase 4). */
import * as React from "react"
import {
  postAccion,
  useCrudCollection,
  type CrudCollection,
} from "./use-crud-collection"
import type { ProyectoMT, TrabajoMT } from "@/lib/schemas"
import type { StoreResult } from "@/lib/store"

/**
 * Opciones de lectura de las colecciones MT. Aditivas: sin ellas la petición es la de siempre
 * (`?pageSize=100`), así que los consumidores que ya existían no cambian de petición ni de caché.
 */
export interface UseColeccionMTOpciones {
  /**
   * Completa la colección pidiendo las páginas siguientes hasta agotar el `total` del servidor.
   *
   * Es para las vistas que FILTRAN, CUENTAN o CONSULTAN en el navegador: `/api/mt/trabajos` y
   * `/api/mt/proyectos` paginan de a 100 y ordenan por `createdAt` descendente, así que filtrar la
   * primera página deja fuera todo lo anterior — el defecto del tablero de «Próximos
   * vencimientos de mantención obligatoria», que armaba esa lista con `filter` sobre la página 1.
   *
   * La ruta de trabajos no acepta `?q=` y su GET además resuelve las garantías al leer, así que
   * completar la colección con la misma paginación de `cargarMas` es la forma correcta de no
   * perder filas sin tocar la ruta. Mismo contrato que `useUnidades({ todasLasPaginas: true })`.
   */
  todasLasPaginas?: boolean
}

/** Tope de páginas que `todasLasPaginas` pide solo: corta el bucle si el servidor
 * devolviera páginas vacías con `total` todavía mayor. */
const MAXIMO_PAGINAS_AUTO = 50

/**
 * Auto-paginación de una colección MT: pide una página por vez mientras queden filas del `total`
 * del servidor. Mismo patrón que `useUnidades`, `usePersonas` y `use-ir`.
 */
function useCompletarPaginacion<T extends { id: string }>(
  coleccion: CrudCollection<T>,
  activo: boolean
): void {
  const { items, isLoading, hasMore, cargarMas, cargandoMas } = coleccion
  const ultimoPedidoRef = React.useRef(-1)
  const paginasRef = React.useRef(0)

  React.useEffect(() => {
    if (!activo) return
    // Una invalidación (mutación) descarta las páginas extra y el largo de la colección baja: el
    // tope vuelve a cero para esta carga, así una sesión larga con muchas mutaciones no lo agota
    // y deja de completar la colección en silencio.
    if (items.length < ultimoPedidoRef.current) paginasRef.current = 0
    if (isLoading || cargandoMas) return
    if (!hasMore) return
    if (paginasRef.current >= MAXIMO_PAGINAS_AUTO) return
    // Un pedido por tamaño de colección: así una página vacía no deja el bucle girando (el
    // contador de filas no cambia y no se vuelve a pedir con el mismo largo).
    if (ultimoPedidoRef.current === items.length) return
    ultimoPedidoRef.current = items.length
    paginasRef.current += 1
    void cargarMas()
  }, [activo, isLoading, cargandoMas, hasMore, items.length, cargarMas])
}

export function useTrabajosMT(
  opciones: UseColeccionMTOpciones = {}
): CrudCollection<TrabajoMT> {
  const coleccion = useCrudCollection<TrabajoMT>("/api/mt/trabajos")
  useCompletarPaginacion(coleccion, opciones.todasLasPaginas === true)
  return coleccion
}

export function useProyectosMT(
  opciones: UseColeccionMTOpciones = {}
): CrudCollection<ProyectoMT> {
  const coleccion = useCrudCollection<ProyectoMT>("/api/mt/proyectos")
  useCompletarPaginacion(coleccion, opciones.todasLasPaginas === true)
  return coleccion
}

/**
 * POST `/api/mt/garantias/verificar` — sin body.
 *
 * Paridad server-side con `verificarGarantiasMT` legacy: recorre los trabajos
 * finalizados con `garantiaFin` y alerta aún no enviada; marca la alerta de
 * forma idempotente por trabajo (una segunda corrida no repite el evento) y
 * devuelve cuántas alertas emitió. La colección de trabajos se revalida porque
 * el servidor actualiza `alertaGarantiaEnviada`.
 */
export async function verificarGarantiasMT(): Promise<
  StoreResult & { alertadas?: number }
> {
  const r = await postAccion("/api/mt/garantias/verificar", {}, ["/api/mt/trabajos"])
  if (!r.ok) {
    return { ok: false, error: r.error ?? "No se pudieron verificar las garantías." }
  }
  const alertadas = (r.data as { alertadas?: number } | undefined)?.alertadas
  return { ok: true, alertadas }
}
