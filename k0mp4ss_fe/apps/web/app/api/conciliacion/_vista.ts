/**
 * `_vista.ts` — la forma con la que la conciliación sale por la API.
 *
 * Vive fuera de las rutas para que la lectura (`GET /api/conciliacion`) y la
 * resolución manual (`POST /api/conciliacion/resolver`, que devuelve el movimiento
 * actualizado con los contadores de su cartola) no armen la fila cada una a su
 * manera: un movimiento que se ve distinto según la ruta que lo devuelve obliga al
 * cliente a saber cuál llamó.
 *
 * La fecha del movimiento se expone como DÍA (`AAAA-MM-DD`): la cartola trae un
 * día de banco, no una hora, y devolver el ISO completo haría que la misma fila
 * cambiara de día según la zona horaria de quien la lee.
 */
import type { CartolaImportada, MovimientoCartola } from "@prisma/client"

export interface MovimientoEnLaVista {
  id: string
  cartolaId: string
  fecha: string
  descripcion: string
  referencia: string | null
  contraparte: string | null
  monto: number
  tipo: string
  estado: string
  origen: string | null
  resueltoPor: string | null
  resueltoEn: string | null
  cargoReferencia: string | null
}

export interface CartolaEnLaVista {
  id: string
  nombreArchivo: string
  importadaPor: string
  filas: number
  conciliadas: number
  noConciliadas: number
  createdAt: string
  movimientos: MovimientoEnLaVista[]
}

/** Fila del banco tal como queda en la respuesta. */
export function vistaDeMovimiento(movimiento: MovimientoCartola): MovimientoEnLaVista {
  return {
    id: movimiento.id,
    cartolaId: movimiento.cartolaId,
    fecha: movimiento.fecha.toISOString().slice(0, 10),
    descripcion: movimiento.descripcion,
    referencia: movimiento.referencia,
    contraparte: movimiento.contraparte,
    monto: movimiento.monto,
    tipo: movimiento.tipo,
    estado: movimiento.estado,
    origen: movimiento.origen,
    resueltoPor: movimiento.resueltoPor,
    resueltoEn: movimiento.resueltoEn ? movimiento.resueltoEn.toISOString() : null,
    cargoReferencia: movimiento.cargoReferencia,
  }
}

/** Cartola con sus movimientos, ordenados por día (que es como se lee una cartola). */
export function vistaDeCartola(
  cartola: CartolaImportada,
  movimientos: readonly MovimientoCartola[]
): CartolaEnLaVista {
  return {
    id: cartola.id,
    nombreArchivo: cartola.nombreArchivo,
    importadaPor: cartola.importadaPor,
    filas: cartola.filas,
    conciliadas: cartola.conciliadas,
    noConciliadas: cartola.noConciliadas,
    createdAt: cartola.createdAt.toISOString(),
    movimientos: movimientos.map(vistaDeMovimiento),
  }
}
