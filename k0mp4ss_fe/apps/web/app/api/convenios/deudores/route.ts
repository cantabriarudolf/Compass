/**
 * /api/convenios/deudores — quién puede firmar el convenio de una unidad (F29).
 *
 * La pantalla del alta ofrecía TODAS las personas de la comunidad
 * (`/api/personas?pageSize=100`, recortado a 100 y sin búsqueda) para elegir al
 * deudor, así que el convenio de la deuda de una unidad podía quedar firmado por
 * quien no la debía. El deudor del convenio es el PROPIETARIO VIGENTE de la
 * unidad (rol `propietario`, `fechaFin` null, el mismo criterio de la cobranza
 * FI), así que esta ruta lo DERIVA de la unidad y no de una lista de personas.
 *
 *   · guard `fi:cobranza` con `crear`: es exactamente la acción que habilita el
 *     alta del convenio; quien sólo audita la cobranza (`ver`) no necesita esta
 *     lista;
 *   · la unidad se resuelve EN la comunidad de la sesión: la de otra comunidad no
 *     es un dato ajeno que se ignora, es una fila que no existe (404);
 *   · una unidad sin propietario vigente devuelve la lista VACÍA con 200, no un
 *     403 ni un error: el registro está incompleto y la pantalla tiene que decir
 *     que se corrige ahí, no ofrecer a cualquiera.
 *
 * La ruta es ESTÁTICA —la unidad viaja en la query, sin segmento `[id]`— y
 * comparte la compuerta del convenio, no una clave nueva.
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import {
  jsonError,
  withComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { propietariosVigentesDeUnidad } from "../_deudores"

/**
 * Recurso de la matriz que gobierna el convenio: `fi:cobranza` (la misma clave de
 * `app/api/convenios/route.ts`: el deudor es parte del alta del convenio, no un
 * catálogo con permiso propio).
 */
const RECURSO_CONVENIOS = "fi:cobranza"

export async function GET(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "crear", RECURSO_CONVENIOS)) {
    return jsonError(403, "Permiso denegado.")
  }

  let url: URL
  try {
    url = new URL(req.url)
  } catch {
    return jsonError(400, "URL de solicitud inválida.")
  }

  const unidadId = url.searchParams.get("unidadId")?.trim() ?? ""
  if (unidadId === "") return jsonError(400, "Falta el parámetro unidadId.")

  const unidad = await prisma.unidad.findFirst({
    where: { id: unidadId, comunidadId: scope.comunidadId },
    select: { id: true },
  })
  if (!unidad) return jsonError(404, "Unidad no encontrada.")

  try {
    const data = await propietariosVigentesDeUnidad(scope.comunidadId, unidad.id)
    return Response.json({ data, total: data.length })
  } catch (e) {
    logger.error({ err: e }, "[api/convenios/deudores] error GET")
    return jsonError(500, "Error interno del servidor.")
  }
}
