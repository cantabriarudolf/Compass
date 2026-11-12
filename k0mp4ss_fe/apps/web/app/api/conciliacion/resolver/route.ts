/**
 * POST /api/conciliacion/resolver — resolución manual de un movimiento en la cola
 * (F30).
 *
 * La regla pura deja en `no_conciliado` todo lo que no puede enlazar con certeza:
 * dos candidatos con el mismo monto, un cargo sin egreso registrado, una
 * transferencia sin referencia. Esa cola no se vacía sola — y no debe: adivinar un
 * enlace es peor que dejarlo abierto, porque el error se descubre meses después,
 * cuando la cuenta ya no cuadra. La resuelve una persona con la cartola a la vista,
 * y acá queda el rastro: quién, cuándo y con qué referencia.
 *
 * Tres reglas:
 *
 *   · el movimiento se resuelve DENTRO de la comunidad de la sesión: el id de otra
 *     comunidad no es un dato ajeno que se ignora, es una fila que no existe (404);
 *   · un movimiento ya conciliado —por la regla o a mano— no se vuelve a resolver
 *     (409): el enlace es un hecho con autor y fecha, no un campo libre que se pisa;
 *   · la actualización es CONDICIONAL (`estado = no_conciliado`) y los contadores de
 *     la cartola se recalculan en la misma transacción, así que `filas` sigue
 *     siendo `conciliadas + noConciliadas` después de cada resolución.
 *
 * El movimiento manual NO crea el asiento contable: queda atado a la referencia que
 * la persona escribió (`cargoReferencia`), que puede ser el id de un egreso, un
 * folio o el dato que el banco trajo. Imputarlo a un fondo es trabajo del trámite
 * que hace ese asiento, no de la conciliación.
 */
import { ConciliacionResolucionSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import { contadoresDeCartola } from "@/lib/conciliacion"
import {
  jsonError,
  withComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { vistaDeMovimiento } from "../_vista"

/** El mismo recurso que las otras dos rutas: la conciliación es acto de cobranza. */
const RECURSO_CONCILIACION = "fi:cobranza"

/** Centinela para distinguir el conflicto de negocio de una falla real. */
const YA_RESUELTO = "MOVIMIENTO_CARTOLA_YA_RESUELTO"

/** Pesos en formato chileno para la bitácora. */
function pesos(monto: number): string {
  return `$${monto.toLocaleString("es-CL")}`
}

export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  // Editar, no crear: resolver la cola es parte del acto de cobranza ya existente,
  // y el comité —que audita la cobranza— no lo ejecuta.
  if (!puede(scope.rol, "editar", RECURSO_CONCILIACION)) {
    return jsonError(403, "Permiso denegado.")
  }

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")

  const parsed = ConciliacionResolucionSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const { movimientoId, cargoReferencia } = parsed.data

  const movimiento = await prisma.movimientoCartola.findFirst({
    where: { id: movimientoId, comunidadId: scope.comunidadId },
  })
  if (!movimiento) return jsonError(404, "Movimiento de cartola no encontrado.")
  if (movimiento.estado === "conciliado") {
    return jsonError(409, "El movimiento ya está conciliado.")
  }
  if (movimiento.estado === "resuelto_manual") {
    return jsonError(409, "El movimiento ya fue resuelto manualmente.")
  }

  const ahora = new Date()

  try {
    const vista = await prisma.$transaction(async (tx) => {
      // Condicional: si otra persona resolvió el mismo movimiento entre la lectura
      // y esta escritura, `count` es 0 y no se pisa el rastro que ya existe.
      const actualizado = await tx.movimientoCartola.updateMany({
        where: {
          id: movimiento.id,
          comunidadId: scope.comunidadId,
          estado: "no_conciliado",
        },
        data: {
          estado: "resuelto_manual",
          origen: "manual",
          resueltoPor: scope.usuarioId,
          resueltoEn: ahora,
          cargoReferencia,
        },
      })
      if (actualizado.count === 0) throw new Error(YA_RESUELTO)

      // Los contadores de la cartola se derivan del estado de TODOS sus
      // movimientos, con la misma regla pura que usó la importación: una cartola
      // no guarda números que no pueda recalcular.
      const estados = await tx.movimientoCartola.findMany({
        where: { cartolaId: movimiento.cartolaId },
        select: { estado: true },
      })
      const contadores = contadoresDeCartola(estados.map((fila) => fila.estado))

      const cartola = await tx.cartolaImportada.update({
        where: { id: movimiento.cartolaId },
        data: {
          filas: contadores.filas,
          conciliadas: contadores.conciliadas,
          noConciliadas: contadores.noConciliadas,
        },
      })

      await registrarEventoAuditoria(
        {
          id: generarId("ev"),
          comunidadId: scope.comunidadId,
          timestamp: ahora.toISOString(),
          usuario: scope.usuarioId,
          categoria: "FI",
          tipoAccion: "FI_MOVIMIENTO_CONCILIADO",
          referenciaId: movimiento.id,
          descripcion: `Movimiento de la cartola «${cartola.nombreArchivo}» (${movimiento.descripcion}, ${pesos(movimiento.monto)}) resuelto a mano contra la referencia ${cargoReferencia}.`,
        },
        tx
      )

      const [movimientoResuelto] = await tx.movimientoCartola.findMany({
        where: { id: movimiento.id },
      })
      if (!movimientoResuelto) throw new Error(YA_RESUELTO)

      return {
        // La fila que se devuelve es la que se acaba de escribir: `estado`,
        // `origen`, `resueltoPor`, `resueltoEn` y `cargoReferencia` son los de esta
        // transacción, y el resto de la fila no cambió.
        movimiento: vistaDeMovimiento(movimientoResuelto),
        cartola: {
          id: cartola.id,
          filas: cartola.filas,
          conciliadas: cartola.conciliadas,
          noConciliadas: cartola.noConciliadas,
        },
      }
    })

    return Response.json(vista)
  } catch (e) {
    if (e instanceof Error && e.message === YA_RESUELTO) {
      return jsonError(409, "El movimiento ya fue resuelto.")
    }
    logger.error(
      { err: e },
      "[api/conciliacion/resolver] error inesperado al resolver el movimiento"
    )
    return jsonError(500, "Error interno del servidor.")
  }
}
