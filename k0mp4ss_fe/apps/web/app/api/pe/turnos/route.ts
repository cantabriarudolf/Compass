/**
 * /api/pe/turnos — inicios de turno PE del día (lectura del panel de monitoreo).
 *
 * GET devuelve los eventos `PE_START_SHIFT` de HOY, scoped por la comunidad de
 * la sesión. El panel de monitoreo mostraba "Turnos iniciados hoy: …" leyendo el
 * array `eventos` del store legacy; como `/api/auditoria` exige `am:ver`
 * (comité/admin) y quien opera el turno es conserjería, esta vista tiene su
 * propio recurso: `pe:cierre_turno` ver.
 *
 * Mismo contrato paginado que el resto de la API (`{data,page,pageSize,total}`)
 * para que la página lo consuma con el patrón SWR del repo. El tamaño por
 * defecto es 100 porque es una lista del día, acotada por definición.
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { hoyISO } from "@/lib/date-utils"
import { jsonError } from "@/lib/api/with-comunidad-scope"
import { contextoAccionPE, RECURSO_TURNO_PE } from "../_acciones"

export const dynamic = "force-dynamic"

/** GET lista los inicios de turno de hoy (orden descendente por timestamp). */
export async function GET(request: Request): Promise<Response> {
  const contexto = await contextoAccionPE(RECURSO_TURNO_PE, "ver")
  if (!contexto.ok) return contexto.response
  const { scope } = contexto

  try {
    const url = new URL(request.url)
    const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1)
    const pageSizeRaw = Number.parseInt(url.searchParams.get("pageSize") ?? "100", 10) || 100
    const pageSize = Math.min(100, Math.max(1, pageSizeRaw))

    const where = {
      comunidadId: scope.comunidadId,
      categoria: "PE",
      tipoAccion: "PE_START_SHIFT",
      timestamp: { startsWith: hoyISO() },
    }
    const [total, filas] = await Promise.all([
      prisma.eventoAuditoria.count({ where }),
      prisma.eventoAuditoria.findMany({
        where,
        orderBy: [{ timestamp: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          timestamp: true,
          referenciaId: true,
          descripcion: true,
        },
      }),
    ])
    return Response.json({ data: filas, page, pageSize, total })
  } catch (e) {
    logger.error({ err: e }, "[api/pe/turnos] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}
