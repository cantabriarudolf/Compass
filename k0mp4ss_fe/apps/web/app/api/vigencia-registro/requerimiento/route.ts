/**
 * POST /api/vigencia-registro/requerimiento — el acto que arranca los 60 días (S2, S6).
 *
 * Requerir la actualización del Registro no es un aviso suelto: es el hecho que
 * pone en marcha el plazo del copropietario y, por lo tanto, la única base para
 * una multa (S1: sin requerimiento no se multa a nadie). Por eso se escribe dos
 * veces con propósitos distintos:
 *
 * - `VigenciaRegistroUnidad.requerimientoEn` — el cursor del ciclo abierto.
 * - `RequerimientoVigencia` — la evidencia append-only, con el vencimiento ya
 *   congelado (S6), que sobrevive a la declaración posterior.
 *
 * Un segundo requerimiento sobre la misma unidad sin haber declarado nada
 * responde 409: dos plazos abiertos a la vez permitirían elegir el más
 * conveniente.
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { generarId } from "@/lib/id-utils"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import { RequerimientoVigenciaSchema } from "@/lib/schemas"
import {
  jsonError,
  withComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { vencimientoDelRequerimiento } from "@/lib/vigencia-registro"

/** Centinela para distinguir el conflicto de negocio de una falla real. */
const YA_REQUERIDA = "VIGENCIA_YA_REQUERIDA"

export async function POST(request: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "crear", "ad")) {
    return jsonError(403, "Permiso denegado.")
  }

  const cuerpo: unknown = await request.json().catch(() => null)
  const parseado = RequerimientoVigenciaSchema.safeParse(cuerpo)
  if (!parseado.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parseado.error.issues.map(
        (issue) => `${issue.path.join(".") || "body"}: ${issue.message}`
      ),
    })
  }

  const unidad = await prisma.unidad.findFirst({
    where: { id: parseado.data.unidadId, comunidadId: scope.comunidadId },
    select: { id: true, numero: true },
  })
  if (!unidad) return jsonError(404, "Unidad no encontrada.")

  const ahora = new Date()
  const venceEn = vencimientoDelRequerimiento(ahora)

  try {
    await prisma.$transaction(async (tx) => {
      // La fila del caso se crea sin declaración: `null` significa «no consta» y
      // se reporta como incidente de datos, nunca como unidad al día.
      await tx.vigenciaRegistroUnidad.upsert({
        where: {
          comunidadId_unidadId: {
            comunidadId: scope.comunidadId,
            unidadId: unidad.id,
          },
        },
        create: { comunidadId: scope.comunidadId, unidadId: unidad.id },
        update: {},
      })

      // Toma condicional del ciclo: si otro requerimiento ganó la carrera,
      // `count` vuelve en 0 y el 409 sale sin escribir evidencia duplicada.
      const tomado = await tx.vigenciaRegistroUnidad.updateMany({
        where: {
          comunidadId: scope.comunidadId,
          unidadId: unidad.id,
          requerimientoEn: null,
        },
        data: { requerimientoEn: ahora },
      })
      if (tomado.count === 0) throw new Error(YA_REQUERIDA)

      await tx.requerimientoVigencia.create({
        data: {
          comunidadId: scope.comunidadId,
          unidadId: unidad.id,
          fecha: ahora,
          venceEn,
          registradoPor: scope.usuarioId,
          fundamento: parseado.data.fundamento,
        },
      })

      await registrarEventoAuditoria(
        {
          id: generarId("ev"),
          comunidadId: scope.comunidadId,
          timestamp: ahora.toISOString(),
          usuario: scope.usuarioId,
          categoria: "AD",
          tipoAccion: "AD_VIGENCIA_REQUERIMIENTO",
          referenciaId: unidad.id,
          descripcion: `Requerimiento de actualización del Registro de Copropietarios para la unidad ${unidad.numero}; vence el ${venceEn.toISOString().slice(0, 10)}.`,
        },
        tx
      )
    })
  } catch (error) {
    if (error instanceof Error && error.message === YA_REQUERIDA) {
      return jsonError(409, "Ya hay un requerimiento abierto para esta unidad.")
    }
    return jsonError(500, "No se pudo registrar el requerimiento.")
  }

  return Response.json({
    ok: true,
    unidadId: unidad.id,
    requerimientoEn: ahora.toISOString(),
    venceEn: venceEn.toISOString(),
  })
}
