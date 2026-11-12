/**
 * /api/configuracion/correo/probar — envío de PRUEBA de la credencial de correo
 * de la comunidad (F33).
 *
 * Descifra el secreto en memoria (con la clave maestra del entorno), manda UN
 * correo al email del propio usuario de sesión —nunca a un destinatario elegido
 * por el cliente— y devuelve el desenlace:
 *
 *   `{ enviado: true, messageId }`  el servidor aceptó el mensaje.
 *   `{ enviado: false, motivo }`    no se pudo o rebotó, con el texto EXACTO del
 *                                   proveedor (código y detalle), redactado.
 *
 * La prueba es una operación con resultado, no un error de la API: responde 200
 * en los dos desenlaces y el cliente mira `enviado`. Los 403/500 quedan para lo
 * que sí impide probar (permiso, clave maestra ausente o inválida, credencial
 * guardada ilegible).
 *
 * Reglas que no se reinterpretan:
 * - **La credencial manda sobre `SMTP_PASSWORD`**: el envío de prueba usa el
 *   secreto de la comunidad, no la variable global. Se puede probar la de una
 *   comunidad mientras el despliegue sigue enviando con la global.
 * - **Sin credencial guardada no se abre ninguna conexión**: se informa la
 *   ausencia en vez de intentar con otra credencial.
 * - **Sin clave maestra no se prueba nada** (500, fail-closed): el secreto no se
 *   puede descifrar y no hay camino alternativo.
 * - **El secreto no sale del servidor**: se descifra en memoria, se pasa al
 *   emisor y cualquier motivo de error lo redacta `lib/smtp.ts` (literal y en
 *   base64) antes de devolverlo.
 *
 * Authz: recurso `cf` con `editar`, el mismo permiso que guarda la credencial
 * (solo administración). El comité la lee pero no la opera.
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { logger } from "@/lib/logger"
import { descifrarSecreto, estadoClaveMaestra } from "@/lib/cifrado-secretos"
import { enviarCorreoSMTP, leerConfiguracionSMTP } from "@/lib/smtp"

/** Asunto y cuerpo del mensaje de prueba: texto fijo, sin datos de filas. */
const ASUNTO = "Prueba de envío de la comunidad"
const CUERPO =
  "Este es un correo de prueba de la configuración de correo de la comunidad. Si lo recibe, la credencial guardada funciona."

const SIN_CREDENCIAL =
  "La comunidad no tiene una credencial de correo guardada: no hay nada que probar."

export async function POST(): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  if (!puede(scope.rol, "editar", "cf")) {
    return jsonError(403, "Permiso denegado.")
  }

  // Fail-closed antes de leer o descifrar: sin clave maestra no se abre conexión.
  const estadoClave = estadoClaveMaestra()
  if (estadoClave === "ausente") {
    return jsonError(
      500,
      "No se puede probar el envío: falta la clave maestra de secretos en el servidor (CLAVE_MAESTRA_SECRETOS)."
    )
  }
  if (estadoClave === "invalida") {
    return jsonError(
      500,
      "No se puede probar el envío: la clave maestra de secretos del servidor (CLAVE_MAESTRA_SECRETOS) no es válida."
    )
  }

  try {
    const [credencial, usuario] = await Promise.all([
      prisma.credencialCorreoComunidad.findUnique({
        where: { comunidadId: scope.comunidadId },
      }),
      prisma.usuario.findUnique({
        where: { id: scope.usuarioId },
        select: { email: true },
      }),
    ])

    if (!credencial) {
      return Response.json({ enviado: false, motivo: SIN_CREDENCIAL })
    }
    if (!usuario?.email) {
      return jsonError(500, "No se puede probar el envío: la sesión no tiene un correo registrado.")
    }

    let secreto: string
    try {
      secreto = descifrarSecreto({
        secretoCifrado: credencial.secretoCifrado,
        iv: credencial.iv,
        authTag: credencial.authTag,
      })
    } catch (e) {
      logger.error({ err: e }, "[configuracion/correo/probar] credencial ilegible")
      return jsonError(
        500,
        "No se puede probar el envío: la credencial guardada no se puede descifrar con la clave maestra del servidor."
      )
    }

    // El remitente y la seguridad salen de CF; host, puerto, usuario y secreto de
    // la credencial de la comunidad.
    const filaCF = await leerConfiguracionSMTP(scope.comunidadId)
    const envio = await enviarCorreoSMTP(
      filaCF,
      { to: usuario.email, subject: ASUNTO, text: CUERPO },
      {
        credencial: {
          host: credencial.host,
          puerto: credencial.puerto,
          usuario: credencial.usuario,
          secreto,
        },
      }
    )

    if (envio.estado === "enviado") {
      return Response.json({ enviado: true, messageId: envio.messageId })
    }
    // `fallido` trae el texto del proveedor y `no_configurado` el campo que falta:
    // los dos son el motivo por el que no se envió, ya redactados por el emisor.
    return Response.json({ enviado: false, motivo: envio.motivo })
  } catch (e) {
    logger.error({ err: e }, "[configuracion/correo/probar] error al probar el envío")
    return jsonError(500, "Error interno del servidor.")
  }
}
