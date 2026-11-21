/**
 * POST /api/maestros/catalogo-nacional — asegura los catálogos del país (F46).
 *
 * Una base recién migrada tiene los ocho catálogos nacionales vacíos, y hasta hoy
 * la única forma de crearlos era `npm run db:catalogo-nacional`: terminal, y saber
 * que el script existe. El efecto no es cosmético —sin AFP ni salud no hay
 * liquidación, sin feriados el corte no computa el día hábil y sin bancos no se
 * concilia la cartola—, así que el administrador necesita poder hacerlo desde la
 * pantalla que ya usa para los maestros.
 *
 * Es idempotente y global: la primera comunidad que lo corre deja el catálogo para
 * todas (las filas se comparten por id), y correrlo de nuevo no duplica ni pisa
 * nada. El recurso es propio (`mp:catalogo_nacional`, sólo administrador): sembrar el catálogo del país
es provisión de la instalación, no lectura de maestros, así que no hereda la raíz `mp`.
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { puede } from "@/lib/authz"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { asegurarCatalogoNacional } from "@/lib/catalogo-nacional"

export async function POST(): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "crear", "mp:catalogo_nacional")) {
    return jsonError(403, "No tenés permiso para asegurar los catálogos del país.")
  }

  try {
    const porTipo = await asegurarCatalogoNacional(prisma, scope.comunidadId)
    const aseguradas = [...porTipo.values()].reduce((a, b) => a + b, 0)
    logger.info(
      { event: "MAESTROS_CATALOGO_NACIONAL_ASEGURADO", comunidadId: scope.comunidadId, usuarioId: scope.usuarioId, aseguradas },
      "Catálogo nacional asegurado"
    )
    return Response.json({ ok: true, aseguradas, porTipo: Object.fromEntries(porTipo) })
  } catch (error) {
    logger.error({ err: error }, "[api/maestros/catalogo-nacional] error inesperado")
    return jsonError(500, "No se pudo asegurar el catálogo nacional.")
  }
}
