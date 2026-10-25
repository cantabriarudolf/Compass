/**
 * /api/pe/unidades — padrón de unidades para la operación de conserjería (F6).
 *
 * El conserje registra visitas, encomiendas y contratistas contra una unidad destino y necesita
 * buscar en TODO el padrón de su comunidad. El padrón completo vive en `/api/unidades`, pero ese
 * recurso es `mp` y conserjería no lo tiene (`mp:propios` es ABAC del propio vínculo): pedirlo
 * ahí devolvía 403 al rol que registra la visita.
 *
 * Esta ruta es una PROYECCIÓN de solo lectura para esa operación: cuatro campos, el scope de la
 * sesión y el permiso `pe:bitacora`, que conserjería ya tiene por su trabajo en la bitácora.
 * No expone el resto del registro (metraje, prorrateo, estado, servicios) ni permite escribir.
 *
 * Excluye las plazas de estacionamiento: no son destino de visita. La pertenencia la decide la
 * etiqueta y no el prefijo del id — los departamentos de la torre E comparten el prefijo `u-E-`
 * con las plazas.
 *
 * Envelope: `{ data, pageSize, total }`. El `total` es el count del MISMO `where` que la lista,
 * para que el panel pueda avisar el truncamiento (AvisoTruncamiento) en vez de cortar en silencio:
 * los selects de la operación piden el padrón completo con `pageSize=100`, mientras que las
 * búsquedas por texto siguen pidiendo `pageSize=25`.
 */
import type { Prisma } from "@prisma/client"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { ETIQUETA_NO_DESTINO } from "@/lib/unidades-destino"

const PAGE_SIZE_POR_DEFECTO = 25
/**
 * Tope de página: sube de 50 a 100 porque el padrón de los selects de la operación pide
 * `pageSize=100` (`LIMITE_SELECT` en `components/pe/aviso-truncamiento.tsx`); las búsquedas por
 * texto siguen pidiendo el default de 25.
 */
const PAGE_SIZE_MAXIMO = 100

export async function GET(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  // Conserjería y mantención operan la bitácora; el administrador entra por wildcard.
  if (!puede(scope.rol, "ver", "pe:bitacora")) {
    return jsonError(403, "Permiso denegado.")
  }

  let url: URL
  try {
    url = new URL(req.url)
  } catch {
    return jsonError(400, "URL de solicitud inválida.")
  }
  const q = url.searchParams.get("q")?.trim() ?? ""
  const pageSize = Math.min(
    PAGE_SIZE_MAXIMO,
    Math.max(
      1,
      Number.parseInt(
        url.searchParams.get("pageSize") ?? String(PAGE_SIZE_POR_DEFECTO),
        10
      ) || PAGE_SIZE_POR_DEFECTO
    )
  )

  const where: Prisma.UnidadWhereInput = {
    comunidadId: scope.comunidadId,
    etiqueta: { not: ETIQUETA_NO_DESTINO },
    ...(q
      ? {
          OR: [
            { numero: { contains: q } },
            { etiqueta: { contains: q } },
            { rolSii: { contains: q } },
          ],
        }
      : {}),
  }

  try {
    const [data, total] = await Promise.all([
      prisma.unidad.findMany({
        where,
        orderBy: [{ numero: "asc" }, { rolSii: "asc" }],
        take: pageSize,
        select: { id: true, numero: true, etiqueta: true, rolSii: true },
      }),
      prisma.unidad.count({ where }),
    ])
    return Response.json({ data, pageSize, total })
  } catch (e) {
    logger.error({ err: e }, "[api/pe/unidades] error inesperado")
    return jsonError(500, "No se pudo consultar el padrón de unidades.")
  }
}
