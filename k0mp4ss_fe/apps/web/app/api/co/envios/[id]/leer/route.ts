/**
 * POST /api/co/envios/[id]/leer — el destinatario marca leído SU envío.
 *
 * Decisión del owner (2026-10-22): la lectura tiene que ser **real**. Antes el
 * administrador tenía un botón "Simular lectura" que agregaba un `personaId` a
 * `lecturas` sin que nadie hubiera leído nada: el badge "X/Y leídos" mentía y el
 * dato persistido era falso.
 *
 * Reglas:
 * - Solo el **destinatario** registra su lectura (validado acá, server-side).
 * - Envío ajeno o inexistente → 404 (no filtra existencia).
 * - Idempotente: leer dos veces no duplica la entrada.
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { personaIdDelUsuarioDb } from "@/lib/api/sesion-persona"
import { logger } from "@/lib/logger"
import type { DestinatarioEnvio } from "@/lib/schemas"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: Request, ctx: Ctx): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  if (!puede(scope.rol, "ver", "co")) {
    return jsonError(403, "Permiso denegado.")
  }

  const { id } = await ctx.params
  try {
    const personaId = await personaIdDelUsuarioDb(scope.usuarioId)
    const envio = await prisma.envioCO.findFirst({
      where: { id, comunidadId: scope.comunidadId },
    })
    if (!envio) return jsonError(404, "Registro no encontrado.")

    // SAFETY: `destinatarios` es Json con shape DestinatarioEnvio[] validado por EnvioCOSchema al escribir.
    const destinatarios = (envio.destinatarios as unknown as DestinatarioEnvio[]) ?? []
    // SAFETY: `lecturas` es Json string[] de personaIds, validado por EnvioCOSchema al escribir.
    const lecturas = (envio.lecturas as unknown as string[]) ?? []

    const esDestinatario =
      personaId != null && destinatarios.some((d) => d.personaId === personaId)
    if (!esDestinatario) return jsonError(404, "Registro no encontrado.")

    if (!lecturas.includes(personaId)) {
      await prisma.envioCO.update({
        where: { id },
        data: { lecturas: [...lecturas, personaId] as never },
      })
      return Response.json({ ok: true, lecturas: lecturas.length + 1 })
    }
    return Response.json({ ok: true, lecturas: lecturas.length })
  } catch (e) {
    logger.error({ err: e }, "[co/envios] error POST leer")
    return jsonError(500, "Error interno del servidor.")
  }
}
