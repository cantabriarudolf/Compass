/**
 * POST /api/vigencia-registro/multa — el sistema propone la multa (S4).
 *
 * «Parametrizada y automatizada» hasta la propuesta (L4): al vencer los 60 días
 * corridos del requerimiento, el caso queda `habilitado_para_multa` y la
 * administración propone la multa con un acto explícito —sin cron—. La propuesta
 * no inventa nada: congela el monto y el ancla legal que la comunidad declaró en
 * su maestro de infracciones (S1). Si el maestro cambia después, la propuesta ya
 * escrita no se mueve: esa diferencia es la evidencia.
 *
 * Una propuesta por ciclo. El ciclo lo abre el acto de requerir, así que la clave
 * es la unidad más su `requerimientoEn`: proponer dos veces el mismo ciclo
 * responde 409 y nunca escribe una segunda fila. La decisión no se re-deriva acá:
 * la resuelve la regla pura `propuestaDeMultaPermitida` de `lib/vigencia-multa.ts`.
 *
 * Aplicar no pasa por esta ruta: exige el acuerdo del Comité y vive en
 * `[id]/aplicar`.
 */
import { Prisma } from "@prisma/client"
import { z } from "zod"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { generarId } from "@/lib/id-utils"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import { IdEntidadSchema } from "@/lib/schemas"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { estadoDelCaso } from "@/lib/vigencia-registro"
import {
  multaDeVigenciaDeLaComunidad,
  propuestaDeMultaPermitida,
} from "@/lib/vigencia-multa"

const PropuestaMultaVigenciaSchema = z.object({
  unidadId: IdEntidadSchema,
})

export async function POST(request: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "crear", "ad")) {
    return jsonError(403, "Permiso denegado.")
  }

  const cuerpo: unknown = await request.json().catch(() => null)
  const parseado = PropuestaMultaVigenciaSchema.safeParse(cuerpo)
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

  type Resultado =
    | {
        ok: true
        propuestaId: string
        monto: number
        referenciaLegal: string | null
      }
    | { ok: false; status: 400 | 409; motivo: string }

  let resultadoPropuesta: Resultado
  try {
    resultadoPropuesta = await prisma.$transaction(async (tx) => {
      // El estado no se persiste: se deriva del caso guardado con la regla pura.
      const caso = await tx.vigenciaRegistroUnidad.findUnique({
        where: {
          comunidadId_unidadId: {
            comunidadId: scope.comunidadId,
            unidadId: unidad.id,
          },
        },
        select: { ultimaActualizacion: true, requerimientoEn: true },
      })

      const veredicto = estadoDelCaso(
        {
          ultimaActualizacion: caso?.ultimaActualizacion ?? null,
          requerimientoEn: caso?.requerimientoEn ?? null,
        },
        ahora
      )

      // Se lee dentro de la transacción: el monto congelado sale del maestro
      // vigente en el instante de proponer, no de una lectura previa.
      const multa = await multaDeVigenciaDeLaComunidad(scope.comunidadId, tx)

      // Sin requerimiento abierto no hay ciclo que multar (y el veredicto ya lo
      // dirá): la búsqueda de la propuesta existente usa esa misma clave.
      const requerimientoEn = caso?.requerimientoEn ?? null
      const existente = requerimientoEn
        ? await tx.propuestaMultaVigencia.findUnique({
            where: {
              comunidadId_unidadId_requerimientoEn: {
                comunidadId: scope.comunidadId,
                unidadId: unidad.id,
                requerimientoEn,
              },
            },
            select: { id: true },
          })
        : null

      const decision = propuestaDeMultaPermitida({
        veredicto,
        multa,
        propuestaExistente: existente !== null,
      })
      if (!decision.permitida) {
        return {
          ok: false,
          // La propuesta ya escrita es un conflicto del ciclo; el resto, una
          // regla del caso o del maestro que el llamador debe poder leer.
          status: existente ? 409 : 400,
          motivo: decision.motivo,
        }
      }
      // La regla ya concluyó que hay monto declarado; esto sólo afina el tipo.
      if (!multa.disponible) {
        return { ok: false, status: 400, motivo: multa.motivo }
      }

      const propuesta = await tx.propuestaMultaVigencia.create({
        data: {
          comunidadId: scope.comunidadId,
          unidadId: unidad.id,
          fecha: ahora,
          // S1/S4: monto y ancla legal congelados en el acto de proponer.
          monto: multa.monto,
          referenciaLegal: multa.referenciaLegal,
          tipoInfraccionId: multa.tipoInfraccionId,
          estado: "propuesta",
          requerimientoEn: requerimientoEn as Date,
          propuestaPor: scope.usuarioId,
        },
      })

      const ancla = multa.referenciaLegal ? ` (${multa.referenciaLegal})` : ""
      await registrarEventoAuditoria(
        {
          id: generarId("ev"),
          comunidadId: scope.comunidadId,
          timestamp: ahora.toISOString(),
          usuario: scope.usuarioId,
          categoria: "AD",
          tipoAccion: "AD_VIGENCIA_MULTA_PROPUESTA",
          referenciaId: unidad.id,
          descripcion: `Propuesta de multa por el Registro de Copropietarios no actualizado de la unidad ${unidad.numero}: monto congelado del maestro de la comunidad $${multa.monto}${ancla}. La aplica el Comité con su acuerdo.`,
        },
        tx
      )

      return {
        ok: true,
        propuestaId: propuesta.id,
        monto: propuesta.monto,
        referenciaLegal: propuesta.referenciaLegal,
      }
    })
  } catch (error) {
    // Carrera entre dos propuestas del mismo ciclo: el índice único decide y el
    // segundo intento recibe el mismo 409 que si hubiera leído la fila.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return jsonError(
        409,
        "Ya hay una propuesta de multa para este ciclo: la multa se propone una sola vez por requerimiento y no se duplica."
      )
    }
    return jsonError(500, "No se pudo registrar la propuesta de multa.")
  }

  if (!resultadoPropuesta.ok) {
    return jsonError(resultadoPropuesta.status, resultadoPropuesta.motivo)
  }

  return Response.json({
    ok: true,
    propuestaId: resultadoPropuesta.propuestaId,
    monto: resultadoPropuesta.monto,
    referenciaLegal: resultadoPropuesta.referenciaLegal,
  })
}
