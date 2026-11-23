/**
 * entrega/notificar — el puente único entre un aviso in-app y su entrega (T1 de
 * `odd/tasks/un-camino-de-entrega.md`, specs S1, S2, S3 y S6).
 *
 * Por qué existe: hasta hoy la constancia in-app y el correo eran dos
 * preocupaciones sin puente. Once módulos escribían su `Notificacion` inline —y
 * cinco de ellos nunca mandaban nada—, el correo salía por caminos distintos y el
 * desenlace de la entrega sólo vivía en la respuesta HTTP de cada módulo. Este
 * módulo junta las tres cosas en UNA llamada, para que los once avisos tengan el
 * mismo camino y cada intento deje su fila.
 *
 * ── Las reglas que están codificadas acá (no reinterpretar) ─────────────────
 *
 * 1. **El aviso in-app se escribe SIEMPRE (S6).** Antes de resolver la
 *    dirección y antes de intentar el correo. Si el transporte falla, rebota o
 *    no hay emisor, la fila in-app queda: la entrega falla, el aviso no. Por eso
 *    el puente NUNCA propaga una excepción del transporte; la convierte en
 *    `fallido` con `MOTIVO_TRANSPORTE_FALLO` y la deja registrada.
 * 2. **El canal de la constancia in-app lo declara el llamador (S2).** `canal`
 *    es un campo OBLIGATORIO del aviso: el puente no lo escribe por su cuenta
 *    ni deja actuar al `@default("email_simulado")` de Prisma. El canal de la
 *    ENTREGA es otro dato: va en `canales` (`visor` | `email`, el catálogo de
 *    `lib/schemas.ts`). Confundirlos escribiría «email» en la bandeja in-app.
 * 3. **Cada intento deja UNA fila (S3).** Por cada canal declarado se llama a
 *    `planDeCanal` —la puerta única de la política canal→estado— y se persiste
 *    una `EntregaNotificacion` con canal, estado, motivo, intentos y fecha. El
 *    correo sale por `planDeCanal` (y por lo tanto por `enviarCorreoComunidad`),
 *    NUNCA por `enviarCorreoSMTP` directo: acá no se resuelven credenciales ni
 *    se habla el protocolo.
 * 4. **La dirección se resuelve con la definición única.** `correosDePersonas`
 *    (`lib/personas-contacto.ts`) devuelve el correo recortado y `""` cuando no
 *    hay: sin dirección la entrega queda `fallido` con
 *    `MOTIVO_SIN_DESTINATARIO` y no se abre ninguna conexión.
 * 5. **El cliente es del llamador.** La `Notificacion` entra en la transacción
 *    que el llamador abre (`Prisma.TransactionClient`), así un aviso y su
 *    constancia se confirman o se revierten juntos. Ojo: el envío SMTP ocurre
 *    DENTRO de esa llamada, así que un llamador que declara `email` dentro de
 *    una transacción la mantiene abierta durante el diálogo SMTP; quien no
 *    quiera eso pasa `prisma` para el intento de correo y usa la transacción
 *    sólo para el aviso (eso lo decide el llamador, no este módulo).
 *
 * ── Reintentos y multicanal ────────────────────────────────────────────────
 *
 * `canales` acepta más de un canal: es UN aviso con dos entregas y, por lo
 * tanto, dos filas. Y `notificacionId` permite colgar un intento posterior (un
 * reenvío, un correo que quedó `pendiente` y se vuelve a intentar) del MISMO
 * aviso in-app: el puente reutiliza la notificación de la comunidad y NUNCA la
 * reescribe —el mensaje es el original, no una copia del estado actual—. Cada
 * intento agrega su fila con `intentos: 1`; el contador de un intento anterior
 * no se pisa ni se reinicia.
 */
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { generarId } from "@/lib/id-utils"
import { logger } from "@/lib/logger"
import { correosDePersonas } from "@/lib/personas-contacto"
import {
  planDeCanal,
  type PlanEntregaCanal,
} from "@/lib/entrega-aviso"
import type { CanalEntregaAviso } from "@/lib/schemas"

/**
 * Motivo del intento que no llegó a tener desenlace: el transporte lanzó una
 * excepción (socket cortado, error inesperado del emisor). No se propaga porque
 * S6 exige que el aviso in-app quede escrito; se registra como `fallido`.
 *
 * El motivo es una constante a propósito: el texto de una excepción puede traer
 * datos del diálogo SMTP (direcciones, respuestas del servidor) y el registro de
 * entrega no es un log.
 */
export const MOTIVO_TRANSPORTE_FALLO =
  "Falló el transporte de correo con un error inesperado: el intento no se completó y el aviso queda en la bandeja."

/** Lo que el llamador declara para escribir UN aviso y sus entregas. */
export interface AvisoPorNotificar {
  readonly comunidadId: string
  readonly destinatarioRol: string
  readonly destinatarioPersonaId?: string | null
  readonly unidadId?: string | null
  readonly asunto: string
  readonly cuerpo: string
  /**
   * Canal de la constancia in-app. OBLIGATORIO (S2): el valor de hoy es
   * `CANAL_NOTIFICACION_EMAIL_SIMULADO`, pero el puente no lo asume.
   */
  readonly canal: string
  readonly moduloOrigen: string
  readonly fecha: string
  readonly leida?: boolean
  /** Canales de entrega declarados. Cada uno deja su fila (S3). */
  readonly canales: readonly CanalEntregaAviso[]
  /**
   * Persona a la que se dirige el correo. Por defecto, la persona destinataria
   * del aviso; un aviso al rol (administración, comité) no tiene dirección y
   * eso se declara, no se inventa (S5).
   */
  readonly personaDelCorreo?: string | null
  /**
   * Aviso in-app ya escrito al que se cuelga este intento (reenvío o segundo
   * canal). Si se omite, el puente genera el id y escribe la notificación.
   */
  readonly notificacionId?: string
}

/** La entrega persistida: el plan del canal más los datos de su fila. */
export interface EntregaPersistida extends PlanEntregaCanal {
  readonly id: string
  readonly intentos: number
  /** Cuándo salió el correo; `null` en todo lo que no fue `enviado`. */
  readonly enviadoEn: Date | null
}

/** Lo que devuelve el puente: el aviso escrito y el plan de cada intento. */
export interface ResultadoNotificar {
  readonly notificacionId: string
  readonly entregas: EntregaPersistida[]
}

/** Datos de la `Notificacion` que el puente escribe o reutiliza. */
function datosDeLaNotificacion(
  id: string,
  aviso: AvisoPorNotificar
): Prisma.NotificacionUncheckedCreateInput {
  return {
    id,
    comunidadId: aviso.comunidadId,
    destinatarioRol: aviso.destinatarioRol,
    destinatarioPersonaId: aviso.destinatarioPersonaId ?? null,
    unidadId: aviso.unidadId ?? null,
    asunto: aviso.asunto,
    cuerpo: aviso.cuerpo,
    // S2: el canal viaja explícito desde el llamador, nunca desde el default.
    canal: aviso.canal,
    moduloOrigen: aviso.moduloOrigen,
    fecha: aviso.fecha,
    leida: aviso.leida ?? false,
  }
}

/**
 * Escribe (o reutiliza) el aviso in-app y devuelve su id.
 *
 * Con `notificacionId` el intento se cuelga del aviso ya escrito: se reutiliza
 * sólo si es de la MISMA comunidad y no se toca su contenido. Un id de otra
 * comunidad no se reutiliza: el `create` choca contra la clave primaria y el
 * llamador ve el error en vez de que el puente cruce el tenant en silencio.
 */
async function asegurarNotificacion(
  cliente: Prisma.TransactionClient,
  aviso: AvisoPorNotificar
): Promise<string> {
  const id = aviso.notificacionId ?? generarId("not")
  if (aviso.notificacionId !== undefined) {
    const existente = await cliente.notificacion.findFirst({
      where: { id, comunidadId: aviso.comunidadId },
      select: { id: true },
    })
    if (existente) return existente.id
  }
  await cliente.notificacion.create({ data: datosDeLaNotificacion(id, aviso) })
  return id
}

/**
 * El plan del canal, sin dejar que el transporte rompa el puente (S6).
 *
 * `planDeCanal` ya traduce `no_configurado` a `pendiente` y la falta de
 * dirección a `fallido` con su motivo. Lo único que puede escaparse es una
 * excepción del transporte; se convierte en `fallido` con un motivo acotado y se
 * deja el detalle en el log (sin direcciones: el logger lo permite, pero el
 * motivo persistido no las lleva).
 */
async function planSinRomperElAviso(
  canal: CanalEntregaAviso,
  contexto: {
    comunidadId: string
    correo: string
    asunto: string
    cuerpo: string
  }
): Promise<PlanEntregaCanal> {
  try {
    return await planDeCanal(canal, {
      email: {
        comunidadId: contexto.comunidadId,
        destinatario: contexto.correo,
        asunto: contexto.asunto,
        cuerpo: contexto.cuerpo,
      },
    })
  } catch (error) {
    logger.error(
      { err: error, comunidadId: contexto.comunidadId, canal },
      "[entrega] el transporte de correo lanzó una excepción: la entrega queda fallida y el aviso in-app se conserva"
    )
    return { canal, estado: "fallido", motivo: MOTIVO_TRANSPORTE_FALLO }
  }
}

/**
 * Escribe el aviso in-app y persiste el desenlace de cada canal declarado.
 *
 * Devuelve el id del aviso (nuevo o reutilizado) y el plan de cada intento, ya
 * con el id, los intentos y la fecha de su fila. Un canal `email` sin persona o
 * sin correo queda `fallido` con `MOTIVO_SIN_DESTINATARIO`; sin emisor SMTP,
 * `pendiente` con `MOTIVO_SIN_SMTP`; con el servidor aceptando, `enviado` y
 * `enviadoEn` con la fecha del intento. En ningún caso se lanza por el
 * transporte (S6).
 */
export async function notificar(
  cliente: Prisma.TransactionClient,
  aviso: AvisoPorNotificar
): Promise<ResultadoNotificar> {
  const notificacionId = await asegurarNotificacion(cliente, aviso)

  const canales = [...new Set(aviso.canales)]
  const personaDelCorreo =
    aviso.personaDelCorreo ?? aviso.destinatarioPersonaId ?? null

  // Una sola resolución para todos los canales de la llamada (sin N+1). Sin
  // persona no hay consulta: no hay a quién resolverle el correo.
  let correo = ""
  if (personaDelCorreo !== null && canales.includes("email")) {
    const correos = await correosDePersonas(
      aviso.comunidadId,
      [personaDelCorreo],
      cliente
    )
    correo = correos.get(personaDelCorreo) ?? ""
  }

  const entregas: EntregaPersistida[] = []
  for (const canal of canales) {
    const plan = await planSinRomperElAviso(canal, {
      comunidadId: aviso.comunidadId,
      correo,
      asunto: aviso.asunto,
      cuerpo: aviso.cuerpo,
    })

    const id = generarId("ent")
    // `enviadoEn` sólo cuando el servidor aceptó: no se fecha como enviado lo
    // que no salió. La fecha del visor es `creadoEn`, no una salida por correo.
    const enviadoEn = plan.estado === "enviado" ? new Date() : null
    const intentos = 1

    await cliente.entregaNotificacion.create({
      data: {
        id,
        comunidadId: aviso.comunidadId,
        notificacionId,
        canal: plan.canal,
        estado: plan.estado,
        motivo: plan.motivo,
        intentos,
        enviadoEn,
      },
    })

    entregas.push({ ...plan, id, intentos, enviadoEn })
  }

  return { notificacionId, entregas }
}
