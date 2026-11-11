/**
 * POST /api/vigencia-registro/revalidacion — revalidar sin cambios es cumplir (S3).
 *
 * El requerimiento anual abre 60 días corridos y, sin esta ruta, la única forma
 * de cerrarlos era editar el dato. Una unidad que no cambió nada quedaba
 * igualmente en `habilitado_para_multa`: el sistema multaba al que estaba al día
 * simplemente porque nada había cambiado. Confirmar con un click y una fecha es
 * la segunda forma de cumplir, y este acto lo deja por escrito.
 *
 * Se escribe dos veces con propósitos distintos, en una sola transacción:
 *
 * - `VigenciaRegistroUnidad` — el caso: `ultimaActualizacion` pasa a `ahora` y el
 *   cursor del ciclo abierto (`requerimientoEn`) se limpia. Revalidar cierra el
 *   ciclo; el requerimiento NO se borra.
 * - `RevalidacionVigencia` — la evidencia append-only: qué se confirmó y quién
 *   lo confirmó, con su fecha. Las filas de `RequerimientoVigencia` quedan
 *   intactas (S6): la historia de que se requirió sigue probando que la
 *   administración cumplió su deber del art. 9.
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { generarId } from "@/lib/id-utils"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import { RevalidacionVigenciaSchema } from "@/lib/schemas"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { estadoDelCaso } from "@/lib/vigencia-registro"

export async function POST(request: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "editar", "ad")) {
    return jsonError(403, "Permiso denegado.")
  }

  const cuerpo: unknown = await request.json().catch(() => null)
  const parseado = RevalidacionVigenciaSchema.safeParse(cuerpo)
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

  try {
    await prisma.$transaction(async (tx) => {
      // Se lee el caso ANTES de escribir: el evento tiene que poder decir si
      // esta revalidación cerró un ciclo o si la unidad no tenía requerimiento.
      const previo = await tx.vigenciaRegistroUnidad.findUnique({
        where: {
          comunidadId_unidadId: {
            comunidadId: scope.comunidadId,
            unidadId: unidad.id,
          },
        },
        select: { requerimientoEn: true },
      })

      await tx.vigenciaRegistroUnidad.upsert({
        where: {
          comunidadId_unidadId: {
            comunidadId: scope.comunidadId,
            unidadId: unidad.id,
          },
        },
        create: {
          comunidadId: scope.comunidadId,
          unidadId: unidad.id,
          ultimaActualizacion: ahora,
          requerimientoEn: null,
        },
        // La fecha declarada es la de la revalidación y el ciclo abierto se
        // cierra: los `RequerimientoVigencia` no se tocan (append-only).
        update: { ultimaActualizacion: ahora, requerimientoEn: null },
      })

      await tx.revalidacionVigencia.create({
        data: {
          comunidadId: scope.comunidadId,
          unidadId: unidad.id,
          fecha: ahora,
          revalidadoPor: scope.usuarioId,
          detalle: parseado.data.detalle,
        },
      })

      const cierre = previo?.requerimientoEn
        ? ` Cierra el ciclo abierto el ${previo.requerimientoEn.toISOString().slice(0, 10)}: el caso queda al día.`
        : ""

      await registrarEventoAuditoria(
        {
          id: generarId("ev"),
          comunidadId: scope.comunidadId,
          timestamp: ahora.toISOString(),
          usuario: scope.usuarioId,
          categoria: "AD",
          tipoAccion: "AD_VIGENCIA_REVALIDACION",
          referenciaId: unidad.id,
          descripcion: `Revalidación del Registro de Copropietarios de la unidad ${unidad.numero}: se confirmó que los datos siguen sin cambios.${cierre}`,
        },
        tx
      )
    })
  } catch {
    return jsonError(500, "No se pudo registrar la revalidación.")
  }

  const veredicto = estadoDelCaso(
    { ultimaActualizacion: ahora, requerimientoEn: null },
    ahora
  )

  return Response.json({
    ok: true,
    unidadId: unidad.id,
    ultimaActualizacion: ahora.toISOString(),
    estado: veredicto.estado,
  })
}
