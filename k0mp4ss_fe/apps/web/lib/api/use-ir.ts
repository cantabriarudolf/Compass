"use client"

/**
 * use-ir — hooks SWR para Inventario y Recursos IR (Fase 4).
 *
 * Las dos acciones del ciclo de insumos (entregar / resolver comodín) ya tienen
 * ruta propia en el servidor (`app/api/ir/solicitudes-insumo/[id]/{entregar,
 * resolver-comodin}/route.ts`); acá se cablean con `postAccion` para que la UI
 * deje de depender de las acciones del store legacy. Devuelven `StoreResult`
 * (mismo contrato que el store) y revalidan las colecciones que el servidor
 * toca en la misma transacción: solicitudes Y recursos (el stock baja).
 */
import * as React from "react"
import {
  postAccion,
  useCrudCollection,
  type CrudCollection,
} from "./use-crud-collection"
import type {
  AccionResolucionComodinIR,
  EntregaEPP,
  RecursoIR,
  SolicitudInsumoIR,
} from "@/lib/schemas"
import type { StoreResult } from "@/lib/store"

const BASE_RECURSOS = "/api/ir/recursos"
const BASE_SOLICITUDES = "/api/ir/solicitudes-insumo"

/**
 * Opciones de lectura de las colecciones IR. Aditivas: sin ellas la petición es la de siempre
 * (`?pageSize=100`), así que los consumidores que ya existían no cambian de petición ni de caché.
 */
export interface UseColeccionIROpciones {
  /**
   * Completa la colección pidiendo las páginas siguientes hasta agotar el `total` del servidor.
   *
   * Es para las vistas que FILTRAN, CUENTAN o CONSULTAN en el navegador: `/api/ir/recursos` y
   * `/api/ir/solicitudes-insumo` paginan de a 100 y ordenan por `createdAt` descendente, así que
   * filtrar la primera página deja fuera todo lo anterior — el defecto que tenían el catálogo de
   * recursos (naturaleza y estado), la alarma de reposición, las llaves no devueltas y los
   * selectores de insumo/EPP de los diálogos.
   *
   * Ninguna de las dos rutas acepta `?q=` (`createCrudHandlers` sin `busqueda`), así que completar
   * la colección con la misma paginación de `cargarMas` es la forma correcta de no perder filas.
   * Mismo contrato que `useUnidades({ todasLasPaginas: true })` y `usePersonas`.
   */
  todasLasPaginas?: boolean
}

/** Tope de páginas que `todasLasPaginas` pide solo: corta el bucle si el servidor
 * devolviera páginas vacías con `total` todavía mayor. */
const MAXIMO_PAGINAS_AUTO = 50

/**
 * Auto-paginación de una colección IR: pide una página por vez mientras queden filas del `total`
 * del servidor. Mismo patrón que `useUnidades` y `usePersonas`.
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

export function useRecursosIR(
  opciones: UseColeccionIROpciones = {}
): CrudCollection<RecursoIR> {
  const coleccion = useCrudCollection<RecursoIR>(BASE_RECURSOS)
  useCompletarPaginacion(coleccion, opciones.todasLasPaginas === true)
  return coleccion
}

/** Colección de solicitudes + las dos acciones que cierran el ciclo de insumos. */
export interface UseSolicitudesInsumoIRResultado
  extends CrudCollection<SolicitudInsumoIR> {
  /**
   * POST `/api/ir/solicitudes-insumo/[id]/entregar` — sin body. Marca la
   * solicitud como entregada y descuenta el stock en una sola transacción;
   * una segunda entrega no vuelve a descontar.
   */
  entregar: (id: string) => Promise<StoreResult>
  /**
   * POST `/api/ir/solicitudes-insumo/[id]/resolver-comodin` — body
   * `{ accion, recursoSustitutoId?, justificacion? }`. `sustituir` entrega el
   * sustituto (descuenta su stock), `rechazar` cierra sin descontar y
   * `aprobar_crear` da de alta el artículo en el catálogo.
   */
  resolverComodin: (
    id: string,
    decision: AccionResolucionComodinIR,
    opts?: { recursoSustitutoId?: string; justificacion?: string }
  ) => Promise<StoreResult>
}

export function useSolicitudesInsumoIR(
  opciones: UseColeccionIROpciones = {}
): UseSolicitudesInsumoIRResultado {
  const col = useCrudCollection<SolicitudInsumoIR>(BASE_SOLICITUDES)
  useCompletarPaginacion(col, opciones.todasLasPaginas === true)

  // El servidor mueve stock en la MISMA transacción: la colección de recursos
  // se revalida junto con la de solicitudes (dos vistas, un solo hecho).
  const invalidar = [BASE_SOLICITUDES, BASE_RECURSOS]

  const entregar = async (id: string): Promise<StoreResult> => {
    const r = await postAccion(`${BASE_SOLICITUDES}/${id}/entregar`, {}, invalidar)
    if (!r.ok) return { ok: false, error: r.error ?? "No se pudo entregar." }
    return { ok: true }
  }

  const resolverComodin = async (
    id: string,
    decision: AccionResolucionComodinIR,
    opts?: { recursoSustitutoId?: string; justificacion?: string }
  ): Promise<StoreResult> => {
    const r = await postAccion(
      `${BASE_SOLICITUDES}/${id}/resolver-comodin`,
      { accion: decision, ...opts },
      invalidar
    )
    // Mensajes de respaldo idénticos a los de la página legacy.
    const respaldo =
      decision === "aprobar_crear"
        ? "No se pudo aprobar."
        : decision === "sustituir"
          ? "No se pudo sustituir."
          : "No se pudo rechazar."
    if (!r.ok) return { ok: false, error: r.error ?? respaldo }
    return { ok: true }
  }

  return { ...col, entregar, resolverComodin }
}

export function useEntregasEPP(): CrudCollection<EntregaEPP> {
  return useCrudCollection<EntregaEPP>("/api/ir/entregas-epp")
}
