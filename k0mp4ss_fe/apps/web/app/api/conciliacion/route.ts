/**
 * GET /api/conciliacion — las cartolas de la comunidad con sus movimientos (F30).
 *
 * `_req` se declara porque Next lo entrega, pero NO se lee: no hay parámetro que
 * cambie el alcance. La comunidad sale de `withComunidadScope()`, la única fuente,
 * así que un `?comunidadId=` del cliente no mueve nada.
 *
 * La lectura se hace en un número FIJO de consultas —las cartolas, TODOS sus
 * movimientos y el conteo—: los movimientos se agrupan en memoria por cartola, no
 * con una consulta por cartola. El comité la usa para auditar la cobranza; la
 * administración, para ver qué quedó en la cola.
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import {
  jsonError,
  withComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { vistaDeCartola } from "./_vista"
import type { MovimientoCartola } from "@prisma/client"

/** El mismo recurso que las otras dos rutas: la conciliación es acto de cobranza. */
const RECURSO_CONCILIACION = "fi:cobranza"

export async function GET(_req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "ver", RECURSO_CONCILIACION)) {
    return jsonError(403, "Permiso denegado.")
  }

  try {
    const [cartolas, movimientos, total] = await Promise.all([
      prisma.cartolaImportada.findMany({
        where: { comunidadId: scope.comunidadId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
      prisma.movimientoCartola.findMany({
        where: { comunidadId: scope.comunidadId },
        orderBy: [{ fecha: "asc" }, { id: "asc" }],
      }),
      prisma.cartolaImportada.count({ where: { comunidadId: scope.comunidadId } }),
    ])

    const porCartola = new Map<string, MovimientoCartola[]>()
    for (const movimiento of movimientos) {
      const lista = porCartola.get(movimiento.cartolaId)
      if (lista) lista.push(movimiento)
      else porCartola.set(movimiento.cartolaId, [movimiento])
    }

    const data = cartolas.map((cartola) =>
      vistaDeCartola(cartola, porCartola.get(cartola.id) ?? [])
    )

    return Response.json({ data, total, mostrados: data.length })
  } catch (e) {
    logger.error({ err: e }, "[api/conciliacion] error inesperado al leer las cartolas")
    return jsonError(500, "Error interno del servidor.")
  }
}
