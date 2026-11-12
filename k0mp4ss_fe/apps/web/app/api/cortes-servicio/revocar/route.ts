/**
 * POST /api/cortes-servicio/revocar — dejar sin efecto un corte (F28).
 *
 * La ley admite dos causas, y las dos terminan en lo mismo: la unidad vuelve a
 * estar habilitada y la reposición del servicio corre desde el DÍA HÁBIL
 * SIGUIENTE de regularizada la deuda (Ley 21.442 art. 20 N°9). El sistema no puede
 * reconectar: lo que registra es el hecho administrativo de que el corte dejó de
 * regir, con su motivo, para que la orden a la empresa proveedora tenga respaldo.
 *
 *   · por PAGO de la deuda: el deudor se puso al día;
 *   · por ERROR del trámite: se preavisó o se ejecutó un corte que no correspondía.
 *
 * Revocar sirve tanto para un `preaviso` (todavía no se cortó nada) como para un
 * `ejecutado` (se cortó y hay que reponer). NO sirve para uno ya `revocado`: el
 * estado se cambia con un `updateMany` CONDICIONAL, así que la segunda revocación
 * actualiza cero filas y responde 409 en vez de reescribir el motivo del primero.
 *
 * Guard `fi:cobranza` + editar (administración). El motivo es obligatorio: la
 * revocación deja sin efecto un acto administrativo y la bitácora tiene que decir
 * por qué.
 */
import { CorteServicioRevocacionSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import {
  jsonError,
  withComunidadScope,
  type ComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { vistaDeCorte } from "../_vista"

/** Mismo recurso que el preaviso: el corte es cobranza (ver `../route.ts`). */
const RECURSO_CORTES = "fi:cobranza"

/** Centinela del conflicto de estado (la fila cambió entre la lectura y el update). */
const CORTE_YA_REVOCADO = "CORTE_YA_REVOCADO"

/** Estados que la revocación puede dejar sin efecto: el preaviso y el ejecutado. */
const ESTADOS_REVOCABLES = ["preaviso", "ejecutado"] as const

export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope: ComunidadScope = resultado.scope

  if (!puede(scope.rol, "editar", RECURSO_CORTES)) {
    return jsonError(403, "Permiso denegado.")
  }

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")

  const parsed = CorteServicioRevocacionSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const { corteId, motivo } = parsed.data

  const corte = await prisma.corteServicio.findFirst({
    where: { id: corteId, comunidadId: scope.comunidadId },
  })
  if (!corte) return jsonError(404, "Corte de servicio no encontrado.")
  if (corte.estado === "revocado") {
    return jsonError(409, "El corte ya está revocado.")
  }

  const unidad = await prisma.unidad.findFirst({
    where: { id: corte.unidadId, comunidadId: scope.comunidadId },
    select: { id: true, numero: true },
  })
  if (!unidad) return jsonError(404, "Unidad no encontrada.")

  const acuerdo = await prisma.acuerdo.findFirst({
    where: { id: corte.acuerdoId, comunidadId: scope.comunidadId },
    select: { id: true, folio: true },
  })

  const ahora = new Date()

  try {
    const revocado = await prisma.$transaction(async (tx) => {
      const cambiadas = await tx.corteServicio.updateMany({
        where: {
          id: corte.id,
          comunidadId: scope.comunidadId,
          estado: { in: [...ESTADOS_REVOCABLES] },
        },
        data: {
          estado: "revocado",
          revocadoPor: scope.usuarioId,
          revocadoEn: ahora,
          motivo,
        },
      })
      if (cambiadas.count === 0) throw new Error(CORTE_YA_REVOCADO)

      await registrarEventoAuditoria(
        {
          id: generarId("ev"),
          comunidadId: scope.comunidadId,
          timestamp: ahora.toISOString(),
          usuario: scope.usuarioId,
          categoria: "FI",
          tipoAccion: "FI_CORTE_REVOCADO",
          referenciaId: corte.id,
          descripcion: `Se dejó sin efecto el corte de ${corte.servicio} de la unidad ${unidad.numero}, que estaba en estado ${corte.estado}: ${motivo}. La reposición del servicio corre desde el día hábil siguiente de regularizada la deuda (Ley 21.442 art. 20 N°9).`,
        },
        tx
      )

      const fila = await tx.corteServicio.findUnique({ where: { id: corte.id } })
      if (!fila) throw new Error(CORTE_YA_REVOCADO)
      return fila
    })

    return Response.json(
      vistaDeCorte(revocado, {
        unidadNumero: unidad.numero,
        acuerdoFolio: acuerdo?.folio ?? null,
      })
    )
  } catch (e) {
    if (e instanceof Error && e.message === CORTE_YA_REVOCADO) {
      return jsonError(409, "El corte ya está revocado.")
    }
    logger.error({ err: e }, "[api/cortes-servicio/revocar] error inesperado al revocar el corte")
    return jsonError(500, "Error interno del servidor.")
  }
}
