/**
 * GET /api/co/envios/[id]/lecturas — desglose nominativo de lecturas.
 *
 * Change co-lectura-residente (tarea 1.5 · decisión D5 del design):
 * - **solo** el rol administrador (`co:lecturas`); residente y comité reciben 403;
 * - responde las parejas `personaId` / `leidoEn` de `EnvioDestinatarioCO`;
 * - cada consulta emite `CO_LECTURA_CONSULTADA` con el envío y el rol que
 *   consultó: el detalle nominativo se justifica por la rendición de cuentas del
 *   art. 21 de la Ley 21.442, así que hay que poder acreditar quién miró la
 *   lectura de los vecinos;
 * - no hay endpoint de exportación (decisión del owner): el desglose se consulta
 *   en pantalla, no se descarga.
 *
 * Por lectura solo se expone fecha y persona: ni RUT, ni IP, ni user-agent (D6).
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "ver", "co:lecturas")) {
    return jsonError(403, "Permiso denegado.")
  }

  const { id } = await ctx.params
  try {
    const envio = await prisma.envioCO.findFirst({
      where: { id, comunidadId: scope.comunidadId },
      select: { id: true, asunto: true },
    })
    if (!envio) return jsonError(404, "Registro no encontrado.")

    const lecturas = await prisma.envioDestinatarioCO.findMany({
      where: { envioId: id },
      select: { personaId: true, leidoEn: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    })

    try {
      await prisma.eventoAuditoria.create({
        data: {
          id: generarId("ev"),
          comunidadId: scope.comunidadId,
          timestamp: new Date().toISOString(),
          usuario: scope.usuarioId,
          categoria: "CO",
          tipoAccion: "CO_LECTURA_CONSULTADA",
          referenciaId: id,
          descripcion: `Consulta del desglose de lecturas del envío "${envio.asunto}" por el rol ${scope.rol}: ${lecturas.filter((l) => l.leidoEn !== null).length} de ${lecturas.length} destinatarios con lectura registrada.`,
        },
      })
    } catch (e) {
      // La auditoría nunca bloquea la consulta autorizada; se deja rastro en logs.
      logger.error({ err: e }, "[api/co/envios/lecturas] no se pudo registrar CO_LECTURA_CONSULTADA")
    }

    return Response.json(lecturas)
  } catch (e) {
    logger.error({ err: e }, "[api/co/envios/lecturas] error en GET")
    return jsonError(500, "Error interno del servidor.")
  }
}
