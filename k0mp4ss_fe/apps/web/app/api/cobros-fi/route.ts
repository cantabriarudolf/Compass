/**
 * /api/cobros-fi — colección de cobros FI (BD-FUENTE-VERDAD Fase 3).
 *
 * GET con filtros `?periodo=` y `?unidadId=`. ABAC residente: solo ve los
 * cobros de unidades donde tiene vínculo activo (paridad con el filtro
 * `fi` por unidad del store). Otros roles requieren ver "fi".
 * POST upsert vía factory (solo administrador escribe).
 */
import { CobroFISchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { createCrudHandlers, type CrudDelegate } from "@/lib/api/crud-factory"
import {
  jsonError,
  withComunidadScope,
  type ComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { errorGenerico, personaIdDelUsuario } from "@/app/api/personas/route"

// Adaptador de delegate Prisma a la factory (mismo patrón que maestros/[tipo]).
function delegado(modelo: unknown): CrudDelegate {
  return modelo as CrudDelegate
}

export const cobrosHandlers = createCrudHandlers({
  model: delegado(prisma.cobroFI),
  schema: CobroFISchema,
  authzCheck: (rol, accion) => puede(rol, accion, "fi"),
})

export const POST = cobrosHandlers.POST

/** Unidades con vínculo activo de la persona (para el filtro residente). */
export async function unidadesDePersona(
  comunidadId: string,
  personaId: string
): Promise<string[]> {
  const vinculos = await prisma.vinculoUnidad.findMany({
    where: { comunidadId, personaId, fechaFin: null },
    select: { unidadId: true },
  })
  return vinculos.map((v) => v.unidadId)
}

/** GET lista paginada, filtrable por período y unidad. */
export async function GET(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope: ComunidadScope = resultado.scope

  let url: URL
  try {
    url = new URL(req.url)
  } catch {
    return jsonError(400, "URL de solicitud inválida.")
  }
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1)
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(url.searchParams.get("pageSize") ?? "50", 10) || 50)
  )
  const periodo = url.searchParams.get("periodo")?.trim() || undefined
  const unidadId = url.searchParams.get("unidadId")?.trim() || undefined

  try {
    const where: Record<string, unknown> = { comunidadId: scope.comunidadId }
    if (scope.rol === "residente") {
      const personaId = await personaIdDelUsuario(scope.usuarioId)
      if (!personaId) {
        return Response.json({ data: [], page, pageSize, total: 0 })
      }
      const propias = await unidadesDePersona(scope.comunidadId, personaId)
      where.unidadId = { in: unidadId ? propias.filter((u) => u === unidadId) : propias }
    } else {
      if (!puede(scope.rol, "ver", "fi")) {
        return jsonError(403, "Permiso denegado.")
      }
      if (unidadId) where.unidadId = unidadId
    }
    if (periodo) where.periodo = periodo

    const [data, total] = await Promise.all([
      prisma.cobroFI.findMany({
        where: where as never,
        orderBy: [{ periodo: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.cobroFI.count({ where: where as never }),
    ])
    return Response.json({ data, page, pageSize, total })
  } catch (e) {
    logger.error({ err: e }, "[api/cobros-fi] error inesperado")
    return errorGenerico(e)
  }
}
