/**
 * GET /api/onboarding — el estado del arranque de la comunidad (F47 · S1/S2/S4).
 *
 * Responde, para la comunidad de la SESIÓN, la lista ordenada de los doce pasos del
 * manual 41 con su estado (`hecho` | `pendiente`), el número medido y la pantalla
 * donde se hace. El estado se computa contra la base en cada llamada
 * (`lib/onboarding-arranque.ts`): no hay columna, tabla ni configuración con «paso
 * hecho», así que borrar el dato devuelve el paso a `pendiente` solo.
 *
 * Authz: `cf` con `ver` — el mismo recurso de administración que gobierna la
 * configuración de la comunidad. El arranque no declara un recurso propio porque no
 * crea ni mueve nada: es la lectura de lo que ya existe, y `cf` es el recurso con el
 * que la matriz ya distingue administración (y comité, que audita) del resto.
 *
 * No hay POST: los pasos se ejecutan en sus pantallas, no acá. El único botón que
 * podría tentar —asegurar el catálogo del país— vive en `/admin/maestros`
 * (`POST /api/maestros/catalogo-nacional`, F46) y la pantalla enlaza ahí.
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { logger } from "@/lib/logger"
import { calcularArranque } from "@/lib/onboarding-arranque"

export async function GET(): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "ver", "cf")) {
    return jsonError(403, "Permiso denegado.")
  }

  try {
    const { pasos, faltantes } = await calcularArranque(scope.comunidadId, scope.usuarioId)
    return Response.json({ pasos, faltantes })
  } catch (error) {
    logger.error({ err: error }, "[api/onboarding] error GET")
    return jsonError(500, "No se pudo calcular el estado del arranque.")
  }
}
