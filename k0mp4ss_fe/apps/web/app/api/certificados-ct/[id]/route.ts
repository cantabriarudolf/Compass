/**
 * /api/certificados-ct/[id] — detalle/actualización parcial/baja de un certificado CT.
 *
 * GET por id con alcance por objeto (permisos por objeto, 2026-11-06): la fila se
 * busca ya acotada por `alcanceCertificadosCT`, el MISMO `where` que usa la
 * colección. Administrador y comité leen toda la comunidad; cualquier otro rol
 * —el residente— solo los certificados de sus unidades con vínculo vigente o
 * emitidos a su persona (`unidadesVinculadasDb` / `personaIdDelUsuarioDb`,
 * resueltos del servidor).
 *
 * La fila ajena responde 404 «Registro no encontrado.» y no 403: el 403
 * confirmaría que el certificado existe. La consulta va acotada, así que la fila
 * ajena tampoco se carga en memoria.
 */
import { alcanceCertificadosCT, certificadosHandlers } from "../route"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"

type Ctx = { params: Promise<{ id: string }> }

/** GET por id — `ct` ver, con el alcance por objeto aplicado en el `where`. */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  if (!puede(scope.rol, "ver", "ct")) {
    return jsonError(403, "Permiso denegado.")
  }

  const { id } = await ctx.params
  try {
    const alcance = await alcanceCertificadosCT(scope)
    const record = await prisma.certificadoCT.findFirst({
      where: { id, comunidadId: scope.comunidadId, ...(alcance ?? {}) },
    })
    if (!record) return jsonError(404, "Registro no encontrado.")
    return Response.json(record)
  } catch (e) {
    logger.error({ err: e }, "[api/certificados-ct/[id]] error GET")
    return jsonError(500, "Error interno del servidor.")
  }
}

export const PUT = certificadosHandlers.PUT

/** DELETE: 409 siempre — el certificado es inmutable (design.md Decisión 5).
 *
 * Un certificado emitido es un documento que no se elimina. La regla se aplica
 * en la capa API, no en el cliente, para que ningún consumidor distinto del
 * QA-Lab pueda saltarla. El scoping y la authz se evalúan ANTES del rechazo
 * (401/403/404 igual que la factory), así el 409 sólo confirma la inmutabilidad
 * de un registro propio y no filtra existencia ajena. El alcance por objeto no
 * hace falta acá: `ct` eliminar lo tiene solo el administrador (wildcard), así
 * que el rol con unidad nunca llega al 409 — se queda en el 403 de la clave.
 * El residuo TEST lo purga `e2e:higiene`, no un endpoint de borrado.
 */
export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  if (!puede(scope.rol, "eliminar", "ct")) {
    return jsonError(403, "Permiso denegado.")
  }

  const { id } = await ctx.params
  const record = await prisma.certificadoCT.findUnique({ where: { id } })
  if (!record || record.comunidadId !== scope.comunidadId) {
    return jsonError(404, "Registro no encontrado.")
  }
  return jsonError(
    409,
    "Documento inmutable: no se puede eliminar un certificado."
  )
}
