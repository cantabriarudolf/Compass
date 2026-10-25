/**
 * /api/pe/personas — padrón de personas para la operación de conserjería (F6).
 *
 * El padrón completo vive en `/api/personas`, detrás del recurso `mp`: conserjería no lo tiene y
 * esa ruta le responde 403. Consecuencias en el panel de visitas, anotadas como H9:
 * 1. la búsqueda por RUN del QR de la cédula siempre fallaba y caía al padrón local del store;
 * 2. el selector de «Residente destino» leía el store y truncaba a 100.
 *
 * Esta ruta es la PROYECCIÓN de solo lectura para esa operación: permiso `pe:bitacora` (el que la
 * conserjería ya tiene por la bitácora), scope de la sesión y **tres campos de identidad**
 * (`id`, `rut`, `nombreCompleto`). No expone email, teléfono, fecha de nacimiento, previsión ni
 * ningún otro dato del maestro, y no permite escribir.
 *
 * Filtros: `?rut=` exacto (acepta el RUN con o sin puntos, vía sus variantes canónicas) o `?q=`
 * de texto sobre nombre y RUT. `rut` gana cuando vienen los dos.
 */
import type { Prisma } from "@prisma/client"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { variantesRun } from "@/lib/validacion-rut"

const PAGE_SIZE_POR_DEFECTO = 25
const PAGE_SIZE_MAXIMO = 50

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

  const rut = url.searchParams.get("rut")?.trim() ?? ""
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

  let where: Prisma.PersonaWhereInput = { comunidadId: scope.comunidadId }
  if (rut) {
    // El RUN se guarda canónico, pero puede llegar con puntos: se buscan sus variantes.
    const variantes = variantesRun(rut)
    if (variantes.length === 0) {
      return jsonError(400, "El RUT informado no es válido.")
    }
    where = { ...where, rut: { in: variantes } }
  } else if (q) {
    where = {
      ...where,
      OR: [{ nombreCompleto: { contains: q } }, { rut: { contains: q } }],
    }
  }

  try {
    const data = await prisma.persona.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize,
      select: { id: true, rut: true, nombreCompleto: true },
    })
    return Response.json({ data })
  } catch (e) {
    logger.error({ err: e }, "[api/pe/personas] error inesperado")
    return jsonError(500, "No se pudo consultar el padrón de personas.")
  }
}
