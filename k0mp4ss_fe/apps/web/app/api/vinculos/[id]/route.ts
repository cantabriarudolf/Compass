/**
 * /api/vinculos/[id] — detalle/actualización parcial/baja de un vínculo (VU).
 *
 * PUT revalida contra el registro mergeado (fuente de verdad + parche) por la
 * misma ruta de negocio que POST (cierre automático y solapamientos).
 * Baja protegida: un tramo de propietario vigente no se elimina si la unidad
 * tiene ControlPropiedad (409); el resto se elimina libremente.
 */
import { VinculoUnidadSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { ejecutarUpsertVinculo, type DatosVinculo } from "../route"
import { errorGenerico } from "@/app/api/personas/route"

type CtxTipo = { params: Promise<{ id: string }> }

/** GET_ONE por id (scoped a la comunidad). */
export async function GET(req: Request, ctx: CtxTipo): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  if (!puede(scope.rol, "ver", "mp")) return jsonError(403, "Permiso denegado.")
  const { id } = await ctx.params

  try {
    const record = await prisma.vinculoUnidad.findUnique({ where: { id } })
    if (!record || record.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    return Response.json(record)
  } catch (e) {
    return errorGenerico(e)
  }
}

/** PUT parcial sobre el vínculo mergeado, con revalidación completa. */
export async function PUT(req: Request, ctx: CtxTipo): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  if (!puede(scope.rol, "editar", "mp")) return jsonError(403, "Permiso denegado.")
  const { id } = await ctx.params

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")

  try {
    const existente = await prisma.vinculoUnidad.findUnique({ where: { id } })
    if (!existente || existente.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    const parcial = VinculoUnidadSchema.partial().safeParse(body)
    if (!parcial.success) {
      return jsonError(400, "Datos inválidos.", { detalles: parcial.error.flatten() })
    }
    // SAFETY: existente es una fila Prisma (fechaFin: string | null) y el
    // parche Zod opcional; el spread mezcla Record<string, unknown> que TS
    // no puede estrechar, pero el shape es el validado por el schema
    // parcial de VinculoUnidad más el id de la URL.
    const mergeado = {
      ...(existente as unknown as Record<string, unknown>),
      ...(parcial.data as Record<string, unknown>),
      id,
    } as DatosVinculo
    return await ejecutarUpsertVinculo(
      mergeado,
      scope,
      { id, comunidadId: existente.comunidadId }
    )
  } catch (e) {
    return errorGenerico(e)
  }
}

/** DELETE: 409 si es tramo de propietario vigente con ControlPropiedad. */
export async function DELETE(req: Request, ctx: CtxTipo): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  if (!puede(scope.rol, "eliminar", "mp")) return jsonError(403, "Permiso denegado.")
  const { id } = await ctx.params

  try {
    const existente = await prisma.vinculoUnidad.findUnique({ where: { id } })
    if (!existente || existente.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    if (existente.fechaFin === null && existente.rol === "propietario") {
      const controles = await prisma.controlPropiedad.count({
        // Solo los vigentes bloquean: un control desestimado ya no aplica.
        where: {
          comunidadId: scope.comunidadId,
          unidadId: existente.unidadId,
          estado: "vigente",
        },
      })
      if (controles > 0) {
        return jsonError(
          409,
          "No se puede eliminar el vínculo: el tramo de propietario vigente tiene ControlPropiedad asociado."
        )
      }
    }
    await prisma.vinculoUnidad.delete({ where: { id } })
    return Response.json({ ok: true })
  } catch (e) {
    return errorGenerico(e)
  }
}
