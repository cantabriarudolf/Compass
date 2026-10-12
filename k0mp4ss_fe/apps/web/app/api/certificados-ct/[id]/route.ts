/**
 * /api/certificados-ct/[id] — detalle/actualización parcial/baja de un certificado CT.
 */
import { certificadosHandlers } from "../route"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"

type Ctx = { params: Promise<{ id: string }> }

export const GET = certificadosHandlers.GET_ONE
export const PUT = certificadosHandlers.PUT

/** DELETE: 409 siempre — el certificado es inmutable (design.md Decisión 5).
 *
 * Un certificado emitido es un documento que no se elimina. La regla se aplica
 * en la capa API, no en el cliente, para que ningún consumidor distinto del
 * QA-Lab pueda saltarla. El scoping y la authz se evalúan ANTES del rechazo
 * (401/403/404 igual que la factory), así el 409 sólo confirma la inmutabilidad
 * de un registro propio y no filtra existencia ajena. El residuo TEST lo purga
 * `e2e:higiene`, no un endpoint de borrado.
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
