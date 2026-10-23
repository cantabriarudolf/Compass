/**
 * POST /api/co/envios/[id]/leer — el destinatario marca leído SU envío.
 *
 * Decisión del owner (2026-10-22): la lectura tiene que ser **real**. Antes el
 * administrador tenía un botón "Simular lectura" que agregaba un `personaId` a
 * `lecturas` sin que nadie hubiera leído nada: el badge "X/Y leídos" mentía y el
 * dato persistido era falso.
 *
 * Reglas (change co-lectura-residente, tarea 1.4):
 * - Solo el **destinatario** registra su lectura, validado contra
 *   `EnvioDestinatarioCO` (la tabla es la fuente de verdad, no el JSON).
 * - Envío ajeno o inexistente → 404 (no filtra existencia).
 * - Idempotente y segura en concurrencia: `registrarLecturaDestinatario` marca la
 *   fila con un update condicional, así dos lecturas simultáneas no se pierden.
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { personaIdDelUsuarioDb } from "@/lib/api/sesion-persona"
import { logger } from "@/lib/logger"
import { registrarLecturaDestinatario } from "../../../_lib/registro-lectura"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: Request, ctx: Ctx): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "ver", "co")) {
    return jsonError(403, "Permiso denegado.")
  }

  const { id } = await ctx.params
  try {
    const personaId = await personaIdDelUsuarioDb(scope.usuarioId)
    const envio = await prisma.envioCO.findFirst({
      where: { id, comunidadId: scope.comunidadId },
      select: { id: true },
    })
    if (!envio) return jsonError(404, "Registro no encontrado.")

    const destino = personaId
      ? await prisma.envioDestinatarioCO.findUnique({
          where: { envioId_personaId: { envioId: id, personaId } },
          select: { id: true },
        })
      : null
    // No es destinatario (o el usuario no tiene persona vinculada): mismo 404.
    if (!destino || !personaId) return jsonError(404, "Registro no encontrado.")

    const { leidos } = await registrarLecturaDestinatario(id, personaId)
    return Response.json({ ok: true, lecturas: leidos })
  } catch (e) {
    logger.error({ err: e }, "[co/envios] error POST leer")
    return jsonError(500, "Error interno del servidor.")
  }
}
