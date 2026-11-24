/**
 * entrega/notificar — el puente único entre un aviso in-app y su entrega (T1 y
 * T1b de `odd/tasks/un-camino-de-entrega.md`, specs S1, S2, S3, S3b y S6).
 *
 * Por qué existe: hasta T1 la constancia in-app y el correo eran dos
 * preocupaciones sin puente. Once módulos escribían su `Notificacion` inline —y
 * cinco de ellos nunca mandaban nada—, el correo salía por caminos distintos y el
 * desenlace de la entrega sólo vivía en la respuesta HTTP de cada módulo. Este
 * módulo junta las tres cosas en DOS piezas componibles, para que los once avisos
 * tengan el mismo camino y cada intento deje su fila.
 *
 * ── Las dos piezas (y por qué son dos, S3b) ─────────────────────────────────
 *
 * `avisar(cliente, aviso)` — el aviso in-app y su fila de `visor`. NO hay red de
 * por medio: el llamador pasa el cliente de SU transacción, así el aviso y la
 * constancia que lo acompaña se confirman o se revierten juntos. Un fallo al
 * escribir la constancia del módulo revierte el aviso: nunca queda un aviso
 * confirmado sin la constancia de lo que anunció.
 *
 * `entregarPorCorreo(cliente, correo)` — el intento de correo por `planDeCanal`
 * y su fila con el desenlace REAL. Se llama SIEMPRE con el cliente plano
 * (`prisma`), NUNCA dentro de una transacción: el diálogo SMTP no puede retener
 * el lock de la base. Deja su fila después del aviso —con el `notificacionId` del
 * aviso cuando existe y `null` cuando el módulo entrega sólo por correo— y nunca
 * lanza.
 *
 * La composición de las dos es el camino completo: `avisar(tx)` dentro de la
 * transacción del llamador, y `entregarPorCorreo(prisma, { notificacionId })`
 * después del commit. Un solo `notificar()` que hiciera las dos cosas a la vez
 * obligaría a elegir entre meter la red en la transacción o confirmar el aviso
 * antes de su constancia: los dos defectos que S3b prohíbe.
 *
 * ── Las reglas que están codificadas acá (no reinterpretar) ─────────────────
 *
 * 1. **El aviso in-app no se pierde (S6).** `avisar` escribe la notificación
 *    antes de cualquier intento de correo, y `entregarPorCorreo` convierte una
 *    excepción del transporte en `fallido` con `MOTIVO_TRANSPORTE_FALLO`: la
 *    entrega falla, el aviso no. El correo NUNCA propaga una excepción.
 * 2. **El canal de la constancia in-app lo declara el llamador (S2).** `canal`
 *    es un campo OBLIGATORIO del aviso: el puente no lo escribe por su cuenta
 *    ni deja actuar al `@default("email_simulado")` de Prisma. El canal de la
 *    ENTREGA es otro dato: `avisar` escribe el visor y `entregarPorCorreo` el
 *    correo, cada uno con su fila. Confundirlos escribiría «email» en la
 *    bandeja in-app.
 * 3. **Cada intento deja UNA fila (S3).** Por cada canal se llama a
 *    `planDeCanal` —la puerta única de la política canal→estado— y se persiste
 *    una `EntregaNotificacion` con canal, estado, motivo, intentos y fecha. El
 *    correo sale por `planDeCanal` (y por lo tanto por `enviarCorreoComunidad`),
 *    NUNCA por `enviarCorreoSMTP` directo: acá no se resuelven credenciales ni
 *    se habla el protocolo.
 * 4. **La dirección se resuelve con la definición única.** `correosDePersonas`
 *    (`lib/personas-contacto.ts`) devuelve el correo recortado y `""` cuando no
 *    hay: sin dirección la entrega queda `fallido` con
 *    `MOTIVO_SIN_DESTINATARIO` —o con el motivo que el módulo declare— y no se
 *    abre ninguna conexión.
 * 5. **El destino del correo es explícito.** `entregarPorCorreo` exige
 *    `notificacionId: string | null`: `null` es la entrega SÓLO por correo (un
 *    módulo con el visor apagado, un documento con `canal: email`), no un
 *    olvido. Ese caso deja su fila y NO crea ninguna `Notificacion`.
 *
 * ── Reintentos ─────────────────────────────────────────────────────────────
 *
 * `notificacionId` permite colgar un intento posterior (un reenvío, un correo
 * que quedó `pendiente` y se vuelve a intentar) del MISMO aviso in-app: el
 * puente reutiliza la notificación de la comunidad y NUNCA la reescribe —el
 * mensaje es el original, no una copia del estado actual—. Cada intento agrega
 * su fila con `intentos: 1`; el contador de un intento anterior no se pisa ni
 * se reinicia.
 */
import type { Prisma, PrismaClient } from "@prisma/client"
import { generarId } from "@/lib/id-utils"
import { logger } from "@/lib/logger"
import { correosDePersonas } from "@/lib/personas-contacto"
import {
  MOTIVO_SIN_DESTINATARIO,
  planDeCanal,
  type PlanEntregaCanal,
} from "@/lib/entrega-aviso"

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

/** Lo que el llamador declara para escribir UN aviso in-app y su entrega al visor. */
export interface AvisoInApp {
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
  /**
   * Aviso in-app ya escrito al que se cuelga esta entrega (un reenvío del
   * visor). Si se omite, el puente genera el id y escribe la notificación.
   */
  readonly notificacionId?: string
}

/** Lo que el llamador declara para intentar el correo de UN aviso. */
export interface CorreoPorEntregar {
  readonly comunidadId: string
  readonly asunto: string
  readonly cuerpo: string
  /** Persona a la que se le resuelve la dirección (una sola por intento). */
  readonly destinatarioPersonaId?: string | null
  /** Destinatario de la dirección cuando no es el del aviso (`S5`). */
  readonly personaDelCorreo?: string | null
  /**
   * El aviso del que cuelga el intento. `null` = el módulo entrega SÓLO por
   * correo: la fila queda sin aviso y no se crea ninguna `Notificacion` (S3b).
   */
  readonly notificacionId: string | null
  /**
   * Motivo con el que se declara el intento cuando la persona no tiene
   * dirección. Por defecto, el del catálogo; un módulo cuyo destinatario no es
   * «el propietario vigente de la unidad» conserva su propia redacción.
   */
  readonly motivoSinDestinatario?: string
}

/** La entrega persistida: el plan del canal más los datos de su fila. */
export interface EntregaPersistida extends PlanEntregaCanal {
  readonly id: string
  readonly intentos: number
  /** Cuándo salió el correo; `null` en todo lo que no fue `enviado`. */
  readonly enviadoEn: Date | null
}

/** Lo que devuelve `avisar`: el aviso escrito y su fila de visor. */
export interface ResultadoAvisar {
  readonly notificacionId: string
  readonly entrega: EntregaPersistida
}

/** Datos de la `Notificacion` que `avisar` escribe o reutiliza. */
function datosDeLaNotificacion(
  id: string,
  aviso: AvisoInApp
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
  aviso: AvisoInApp
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
 * Persiste UNA fila de `entregas_notificacion` con el desenlace del canal.
 *
 * `enviadoEn` sólo se fecha cuando el servidor aceptó (`enviado`): no se fecha
 * como enviado lo que no salió. La fecha del visor es `creadoEn`, no una salida
 * por correo. Cada intento nace con `intentos: 1`.
 */
async function registrarEntrega(
  cliente: Prisma.TransactionClient,
  input: {
    comunidadId: string
    notificacionId: string | null
    plan: PlanEntregaCanal
  }
): Promise<EntregaPersistida> {
  const id = generarId("ent")
  const intentos = 1
  const enviadoEn = input.plan.estado === "enviado" ? new Date() : null

  await cliente.entregaNotificacion.create({
    data: {
      id,
      comunidadId: input.comunidadId,
      notificacionId: input.notificacionId,
      canal: input.plan.canal,
      estado: input.plan.estado,
      motivo: input.plan.motivo,
      intentos,
      enviadoEn,
    },
  })

  return { ...input.plan, id, intentos, enviadoEn }
}

/**
 * Escribe el aviso in-app y su fila de `visor` en la transacción del llamador.
 *
 * No hay red de por medio: `planDeCanal("visor")` es puro (el visor se prueba
 * con la notificación, no con un envío), así que el llamador puede pasar su
 * `tx` sin retener ningún lock durante un diálogo SMTP. El aviso y la
 * constancia del módulo que lo acompaña se confirman o se revierten juntos
 * (S3b), y el correo —si lo hay— se intenta DESPUÉS, con `entregarPorCorreo` y
 * el cliente plano.
 */
export async function avisar(
  cliente: Prisma.TransactionClient,
  aviso: AvisoInApp
): Promise<ResultadoAvisar> {
  const notificacionId = await asegurarNotificacion(cliente, aviso)
  const plan = await planDeCanal("visor", {
    email: {
      comunidadId: aviso.comunidadId,
      destinatario: null,
      asunto: aviso.asunto,
      cuerpo: aviso.cuerpo,
    },
  })
  const entrega = await registrarEntrega(cliente, {
    comunidadId: aviso.comunidadId,
    notificacionId,
    plan,
  })
  return { notificacionId, entrega }
}

/**
 * El plan del correo, sin dejar que el transporte rompa la entrega (S6).
 *
 * `planDeCanal` ya traduce `no_configurado` a `pendiente` y la falta de
 * dirección a `fallido` con su motivo. Lo único que puede escaparse es una
 * excepción del transporte; se convierte en `fallido` con un motivo acotado y se
 * deja el detalle en el log (sin direcciones: el logger lo permite, pero el
 * motivo persistido no las lleva).
 */
async function planDelCorreoSinRomperLaEntrega(contexto: {
  comunidadId: string
  destinatario: string
  asunto: string
  cuerpo: string
}): Promise<PlanEntregaCanal> {
  try {
    return await planDeCanal("email", {
      email: {
        comunidadId: contexto.comunidadId,
        destinatario: contexto.destinatario,
        asunto: contexto.asunto,
        cuerpo: contexto.cuerpo,
      },
    })
  } catch (error) {
    logger.error(
      { err: error, comunidadId: contexto.comunidadId, canal: "email" },
      "[entrega] el transporte de correo lanzó una excepción: la entrega queda fallida y el aviso in-app se conserva"
    )
    return { canal: "email", estado: "fallido", motivo: MOTIVO_TRANSPORTE_FALLO }
  }
}

/**
 * Intenta el correo de UN aviso y persiste su desenlace (S3 y S3b).
 *
 * Se llama SIEMPRE con el cliente plano, NUNCA dentro de una transacción: el
 * diálogo SMTP no retiene el lock de la base, y la fila se escribe después del
 * aviso. `notificacionId` cuelga el intento del aviso que lo anuncia; `null`
 * declara una entrega SÓLO por correo y no crea ninguna notificación.
 *
 * Sin persona o sin dirección queda `fallido` con el motivo del catálogo (o el
 * que el módulo declare) y no abre ninguna conexión; sin emisor SMTP queda
 * `pendiente` con `MOTIVO_SIN_SMTP`; con el servidor aceptando, `enviado` y
 * `enviadoEn` con la fecha del intento. En ningún caso se lanza por el
 * transporte (S6).
 */
export async function entregarPorCorreo(
  cliente: PrismaClient,
  correo: CorreoPorEntregar
): Promise<EntregaPersistida> {
  const personaDelCorreo =
    correo.personaDelCorreo ?? correo.destinatarioPersonaId ?? null

  // Sin persona no hay consulta: no hay a quién resolverle el correo.
  let destinatario = ""
  if (personaDelCorreo !== null) {
    const correos = await correosDePersonas(
      correo.comunidadId,
      [personaDelCorreo],
      cliente
    )
    destinatario = correos.get(personaDelCorreo) ?? ""
  }

  const plan =
    destinatario === ""
      ? {
          canal: "email" as const,
          estado: "fallido" as const,
          motivo: correo.motivoSinDestinatario ?? MOTIVO_SIN_DESTINATARIO,
        }
      : await planDelCorreoSinRomperLaEntrega({
          comunidadId: correo.comunidadId,
          destinatario,
          asunto: correo.asunto,
          cuerpo: correo.cuerpo,
        })

  return registrarEntrega(cliente, {
    comunidadId: correo.comunidadId,
    notificacionId: correo.notificacionId,
    plan,
  })
}
