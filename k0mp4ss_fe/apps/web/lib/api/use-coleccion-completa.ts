"use client"

/**
 * use-coleccion-completa — completa una colección de `useCrudCollection` antes
 * de agregarla o resolver identidad sobre ella.
 *
 * `useCrudCollection` pide `pageSize=100`: con 501 cobros o 182 egresos,
 * sumar `items` sin completar las páginas daría un total falso, y un `.find()`
 * sobre la primera página no encuentra a quien quedó fuera de ella. El efecto
 * pide la página siguiente mientras `hasMore`; el tope de pedidos evita un
 * bucle si una página falla de forma persistente (`cargarMas` no propaga el
 * error).
 *
 * El tope es POR EPISODIO de paginación: cuando la colección queda completa se
 * reinicia, porque una mutación (`create`/`update`/`remove`) descarta las
 * páginas acumuladas y el efecto debe poder volver a caminarlas. Sin el
 * reinicio, una pantalla que escribe en la colección quedaría clavada en la
 * página 1 después de la segunda escritura.
 *
 * Vive en `lib/api/` (y no en el dashboard) porque lo consumen a la vez los
 * paneles del dashboard operativo, `/admin/reporteria` y pantallas que derivan
 * cifra o identidad de una colección entera (p. ej. `finanzas/multas`).
 *
 * El `pageSize` se parametriza porque el helper no debe importar constantes de
 * un módulo de UI: es el tamaño de página que la colección pide al servidor
 * (el fijo de `useCrudCollection` es 100, el valor por defecto).
 */
import * as React from "react"
import type { CrudCollection } from "./use-crud-collection"

/** Tamaño de página fijo de `useCrudCollection` (`?pageSize=100`). */
const PAGE_SIZE_COLECCION = 100

export interface OpcionesColeccionCompleta {
  /**
   * Tamaño de página que la colección pide al servidor. Por defecto el fijo de
   * `useCrudCollection` (100): solo cambia si la colección pide otro tamaño.
   */
  pageSize?: number
}

export function useColeccionCompleta<T extends { id: string }>(
  coleccion: CrudCollection<T>,
  opciones: OpcionesColeccionCompleta = {}
): { items: T[]; total: number; completa: boolean; isLoading: boolean; error: Error | null } {
  const { items, total, hasMore, cargandoMas, cargarMas, isLoading, error } = coleccion
  const pageSize = opciones.pageSize ?? PAGE_SIZE_COLECCION
  const pedidos = React.useRef(0)
  const maximoPedidos = Math.ceil(total / pageSize) + 1

  React.useEffect(() => {
    if (!hasMore) {
      // Episodio de paginación terminado: el tope aplica al siguiente.
      pedidos.current = 0
      return
    }
    if (cargandoMas) return
    if (pedidos.current >= maximoPedidos) return
    pedidos.current += 1
    void cargarMas()
  }, [hasMore, cargandoMas, maximoPedidos, cargarMas])

  return { items, total, completa: !hasMore, isLoading, error }
}
