/**
 * /api/convenios/documento/reenviar — el REENVÍO MANUAL de la constancia de
 * entrega del papel firmado del convenio (F29 · T2 · S2).
 *
 * El archivo del papel (`POST /api/convenios/documento`) cursa el envío real
 * después del commit y su constancia queda `pendiente` cuando no hay con qué
 * cursar (sin credencial de correo, sin correo del deudor) o `fallido` cuando
 * el SMTP rebotó. Esta ruta es la mano que lo vuelve a intentar:
 *
 *   · el reenvío ACTUALIZA la constancia que ya existe — `pendiente` o
 *     `fallido` — con el desenlace del nuevo intento, y SUMA UN evento de
 *     auditoría (`FI_CONVENIO_DOCUMENTO_REENVIO`): nunca crea una segunda
 *     constancia, porque entregar el papel es UN hecho que se corrobora, no
 *     dos;
 *   · sobre `entregado` responde 409: la aceptación del servidor ya está
 *     probada en la constancia y en su motivo, y reenviarla sería escribir el
 *     mismo hecho dos veces;
 *   · el convenio se resuelve EN la comunidad de la sesión: el de otra
 *     comunidad no es un dato ajeno que se ignora, es una fila que no existe
 *     (404); un convenio sin papel firmado no tiene constancia que reenviar
 *     (409);
 *   · la cursada corre fuera de toda transacción (el diálogo SMTP no retiene
 *     el lock de la base) y reusa el emisor de la comunidad con el PDF adjunto
 *     leído del depósito privado — la misma maquinaria del archivo.
 *
 * - POST (guard `fi:cobranza` editar): administración. La constancia del
 *   papel del convenio es parte del convenio y comparte su compuerta.
 */
import { z } from "zod"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { IdEntidadSchema } from "@/lib/schemas"
import { cursarConstanciaDelConvenio } from "@/lib/entrega-aviso"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"

/**
 * Recurso de la matriz que gobierna el convenio: `fi:cobranza`.
 *
 * El reenvío es un acto de administración sobre el papel firmado y su
 * constancia: la misma compuerta que archiva el papel y que lo lee el comité
 * para auditar. No se declara una clave nueva.
 */
const RECURSO_CONVENIOS = "fi:cobranza"

/** Entrada: el único dato es el convenio cuya constancia se reenvía. */
const EntradaReenvioSchema = z.object({
  convenioId: IdEntidadSchema,
})

export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  if (!puede(scope.rol, "editar", RECURSO_CONVENIOS)) {
    return jsonError(403, "Permiso denegado.")
  }

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")

  const parsed = EntradaReenvioSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }

  // El convenio se resuelve EN la comunidad de la sesión: el id de otra
  // comunidad es una fila que no existe (404), como en el archivo del papel.
  const convenio = await prisma.convenioPago.findFirst({
    where: { id: parsed.data.convenioId, comunidadId: scope.comunidadId },
    select: { id: true, documentoId: true, personaId: true },
  })
  if (!convenio) return jsonError(404, "Convenio no encontrado.")

  if (!convenio.documentoId) {
    return jsonError(
      409,
      "El convenio no tiene documento firmado: primero se sube el papel que la administración escaneó."
    )
  }

  // La constancia que nació con el archivo del papel: una sola fila por
  // (documento, deudor, canal). El reenvío la ACTUALIZA, nunca la duplica.
  const constancia = await prisma.envioDocumento.findFirst({
    where: {
      comunidadId: scope.comunidadId,
      documentoId: convenio.documentoId,
      personaId: convenio.personaId,
      canal: "email",
    },
    orderBy: { createdAt: "asc" },
  })
  if (!constancia) {
    return jsonError(
      409,
      "El convenio no tiene la constancia de entrega de su papel firmado."
    )
  }
  if (constancia.estado === "entregado") {
    return jsonError(
      409,
      "La constancia de entrega del convenio ya figura como entregado: el servidor de correo aceptó el mensaje y el reenvío no se cursa de nuevo."
    )
  }

  // La cursada reusa la maquinaria del archivo: emisor de la comunidad, PDF
  // adjunto leído del depósito privado, evento que suma el intento.
  try {
    const cursada = await cursarConstanciaDelConvenio({
      comunidadId: scope.comunidadId,
      convenioId: convenio.id,
      documentoId: convenio.documentoId,
      constanciaId: constancia.id,
      personaId: convenio.personaId,
      usuarioId: scope.usuarioId,
      reenvio: true,
    })

    return Response.json({
      ok: true,
      convenioId: convenio.id,
      constancia: {
        id: constancia.id,
        estado: cursada.estado,
        personaId: convenio.personaId,
        motivo: cursada.motivo,
      },
    })
  } catch (e) {
    logger.error(
      { err: e, convenioId: convenio.id, documentoId: convenio.documentoId },
      "[api/convenios/documento/reenviar] la cursada del reenvío falló de forma inesperada"
    )
    return jsonError(500, "Error interno del servidor.")
  }
}
