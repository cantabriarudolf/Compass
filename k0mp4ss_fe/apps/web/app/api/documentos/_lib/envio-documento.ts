/**
 * envio-documento — la entrega de un documento LEGAL y su constancia por
 * destinatario (F35 serie A, A3 · S7/S8).
 *
 * Por qué existe: el archivo prueba que el documento existe; esta pieza prueba
 * que llegó a una persona. Lo legal conserva la constancia por destinatario
 * (S7); lo comunitario NO se entrega persona por persona: se publica al visor de
 * toda la comunidad y su constancia es "publicado" (S8), así que la ruta lo
 * rechaza (409) en vez de fabricar una entrega que nadie pidió.
 *
 * ── Las reglas que están codificadas acá (no reinterpretar) ──────────────────
 *
 * 1. **El visor es el canal real.** Entregar por el visor = crear la
 *    `Notificacion` que la persona ve en su bandeja, con la glosa del documento,
 *    su tipo y su versión. El estado `entregado` sólo se registra porque esa
 *    fila se creó en la MISMA transacción: no hay entrega declarada sin la fila
 *    que la prueba.
 * 2. **El correo se intenta y se reporta como pasó.** El canal email sale por el
 *    emisor SMTP real que ya usa el aviso de cobro (`lib/smtp.ts` vía
 *    `planDeCanal` de `lib/entrega-aviso.ts`): queda `entregado` SOLO cuando el
 *    servidor aceptó el mensaje, `pendiente` con el motivo del outbox cuando la
 *    comunidad no tiene emisor configurado —condición de configuración, no
 *    envío— y `fallido` con el motivo redactado cuando se intentó y rebotó.
 *    Nunca se inventa un transporte: el correo del documento y el del aviso
 *    salen por el mismo emisor.
 * 3. **La única diferencia de vocabulario con el aviso es el nombre del estado.**
 *    El aviso llama `enviado` a la aceptación del servidor; el documento la llama
 *    `entregado`, porque acá el correo es el único canal de constancia y el
 *    contrato de la entidad (`entregado | pendiente | fallido`) no tiene un
 *    cuarto estado. `pendiente` y `fallido` viajan tal cual.
 *
 * ── Idempotencia ────────────────────────────────────────────────────────────
 *
 * La clave es `documento:persona:canal` (misma forma que `claveEntregaAviso`,
 * con el documento en lugar del aviso). Entregar el mismo documento a la misma
 * persona por el mismo canal choca contra el índice único
 * `(comunidadId, claveEnvio)`; el reenvío explícito agrega `:reenvio:<epoch>` y
 * queda como fila nueva marcada `reenvio: true`. "En paralelo" (S7) significa
 * varios destinatarios en UNA corrida, nunca el mismo envío repetido.
 */
import { ETIQUETAS_TIPO_DOCUMENTAL, type TipoDocumental } from "@/lib/documento-archivo"
import { planDeCanal } from "@/lib/entrega-aviso"

/** Canales de entrega del documento: el visor de la comunidad y el correo. */
export const CANALES_ENVIO_DOCUMENTO = ["visor", "email"] as const

export type CanalEnvioDocumento = (typeof CANALES_ENVIO_DOCUMENTO)[number]

/** Estados que se persisten en `envios_documento`. */
export const ESTADOS_ENVIO_DOCUMENTO = ["entregado", "pendiente", "fallido"] as const

export type EstadoEnvioDocumento = (typeof ESTADOS_ENVIO_DOCUMENTO)[number]

/**
 * S8 · Mensaje único del rechazo: lo usan la ruta (409) y el test de contrato.
 *
 * Un documento comunitario no se entrega persona por persona: se publica al
 * visor de toda la comunidad y su constancia es "publicado". Escribir una fila
 * de entrega sería declarar un hecho que el sistema no registra.
 */
export const MENSAJE_COMUNITARIO_PUBLICADO =
  'Un documento comunitario se publica a toda la comunidad y no se entrega por persona: su constancia es "publicado", no una entrega por destinatario (S8).'

/**
 * Motivo del correo cuando el destinatario no tiene dirección cargada.
 *
 * Es un dato que falta, no una falta de emisor: se declara `fallido` (mismo
 * criterio que la cobranza FI), nunca `pendiente` —que significa "sin emisor
 * configurado"— ni `entregado`.
 */
export const MOTIVO_SIN_CORREO_DOCUMENTO =
  "Falló el envío por SMTP: el destinatario no tiene correo electrónico registrado."

/**
 * Clave de idempotencia de una entrega: documento + destinatario + canal.
 *
 * Entregar el mismo documento NO duplica el registro; el reenvío explícito
 * agrega `:reenvio:<epoch>` y queda marcado con `reenvio: true`.
 */
export function claveEnvioDocumento(input: {
  documentoId: string
  personaId: string
  canal: CanalEnvioDocumento
  reenvioEn?: number
}): string {
  const base = `${input.documentoId}:${input.personaId}:${input.canal}`
  return input.reenvioEn === undefined ? base : `${base}:reenvio:${input.reenvioEn}`
}

/** Lo que se va a registrar en UN destinatario (antes de escribirlo). */
export interface PlanEnvioDocumento {
  canal: CanalEnvioDocumento
  estado: EstadoEnvioDocumento
  motivo: string | null
}

/** Contexto del intento: quién recibe y qué dice el mensaje. */
export interface ContextoEnvioDocumento {
  /** Comunidad que aporta la configuración SMTP (CF). */
  comunidadId: string
  /** Correo del destinatario; vacío o `null` = no hay a dónde enviar. */
  destinatario: string | null
  asunto: string
  cuerpo: string
}

/**
 * Estado con el que se registra el envío a UN destinatario por UN canal.
 *
 * - **visor** → `entregado`: la ruta crea su `Notificacion` en la misma
 *   transacción y el registro guarda el id. Ese estado NO depende del correo.
 * - **email** → el desenlace REAL del emisor (mismo `planDeCanal` del aviso):
 *   sin emisor configurado → `pendiente`; aceptado → `entregado` (el aviso lo
 *   llama `enviado`); rechazado → `fallido` con el motivo redactado.
 *
 * El visor NUNCA se registra con el vocabulario del correo: su hecho es la
 * notificación.
 */
export async function planDeEnvioDocumento(
  canal: CanalEnvioDocumento,
  contexto: ContextoEnvioDocumento
): Promise<PlanEnvioDocumento> {
  if (canal === "visor") return { canal, estado: "entregado", motivo: null }

  // Sin dirección no se abre ninguna conexión y no se inventa un envío. El
  // motivo es el del documento (no el del aviso: acá el destinatario puede ser
  // el comité o un arrendatario, no "el propietario vigente de la unidad").
  const destinatario = contexto.destinatario?.trim() ?? ""
  if (destinatario === "") {
    return { canal, estado: "fallido", motivo: MOTIVO_SIN_CORREO_DOCUMENTO }
  }

  const plan = await planDeCanal("email", {
    email: {
      comunidadId: contexto.comunidadId,
      destinatario,
      asunto: contexto.asunto,
      cuerpo: contexto.cuerpo,
    },
  })

  // `enviado` (aviso) = aceptación del servidor = `entregado` (documento). Los
  // otros dos estados significan lo mismo en las dos entidades.
  const estado: EstadoEnvioDocumento = plan.estado === "enviado" ? "entregado" : plan.estado
  return { canal, estado, motivo: plan.motivo }
}

/** Asunto del documento: nombra la glosa (visor y correo dicen lo mismo). */
export function asuntoNotificacionDocumento(input: { glosa: string }): string {
  return `Documento legal de la comunidad: ${input.glosa}`
}

/**
 * Cuerpo del documento: la glosa, su tipo de la lista cerrada y la versión que
 * asignó el servidor. El mismo texto va al visor y al correo — no hay una
 * segunda redacción que se desincronice.
 */
export function cuerpoNotificacionDocumento(input: {
  glosa: string
  tipoDocumental: string
  version: number
}): string {
  const tipo =
    ETIQUETAS_TIPO_DOCUMENTAL[input.tipoDocumental as TipoDocumental] ?? input.tipoDocumental
  return `La comunidad puso a su disposición el documento legal "${input.glosa}" (${tipo}, versión ${input.version}). Está disponible en el visor del archivo de la comunidad y esta entrega queda registrada a su nombre.`
}

/**
 * Rol de bandeja del destinatario puntual (`destinatarioRol` de `Notificacion`).
 *
 * Misma derivación que `app/api/reportes-re/[id]/distribuir/route.ts`: la
 * notificación va dirigida a una persona (`destinatarioPersonaId`), así que el
 * rol es sólo la etiqueta de su bandeja. Se deriva de la ficha de la persona y
 * nunca del rol de la sesión que dispara el envío.
 */
export function rolBandejaDe(persona: {
  roles: unknown
  datosGobernanza: unknown
}): string {
  const roles = Array.isArray(persona.roles) ? (persona.roles as string[]) : []
  if (roles.includes("personal")) return "personal"
  if (
    roles.includes("directiva") ||
    (persona.datosGobernanza !== null && persona.datosGobernanza !== undefined)
  ) {
    return "directiva"
  }
  return "residente"
}
