/**
 * entrega-aviso — la entrega del aviso de cobro y su registro (S3).
 *
 * Por qué existe: un aviso que no se entrega no arranca el plazo de pago
 * (Ley 21.442 art. 31), así que la entrega no es un detalle de UX — es el hecho
 * que hay que poder probar. Este módulo concentra las decisiones de esa
 * entrega; `app/api/avisos-cobro/[id]/entrega` sólo la ejecuta.
 *
 * ── Las tres reglas que están codificadas acá (no reinterpretar) ─────────────
 *
 * 1. **El visor es el canal real.** Entregar = crear la `Notificacion` que el
 *    residente ve en su bandeja, con el folio y el período del aviso. El estado
 *    `entregado` del canal visor sólo se registra porque esa fila se creó en la
 *    misma transacción: no hay entrega declarada sin notificación que la pruebe.
 * 2. **El correo se intenta y se reporta como pasó.** El canal email sale por
 *    el emisor SMTP real (`lib/smtp.ts`, F4): queda `enviado` SOLO cuando el
 *    servidor aceptó el mensaje (con el id que devolvió), `fallido` con el
 *    motivo redactado cuando se intentó y rebotó, y `pendiente` con
 *    `MOTIVO_SIN_SMTP` cuando la comunidad no tiene emisor configurado —que es
 *    una condición de configuración, no un envío fallido—. Nunca `entregado`:
 *    el correo no crea ninguna notificación que lo pruebe.
 * 3. **El destinatario es el dueño de registro.** El propietario VIGENTE de la
 *    unidad (`rol: "propietario"`, `fechaFin: null`), con el mismo criterio que
 *    la cobranza FI. Sin propietario vigente no hay entrega: la ruta la rechaza
 *    nombrando la unidad en vez de escribir una entrega al vacío.
 *
 * ── Idempotencia ────────────────────────────────────────────────────────────
 *
 * La clave es `aviso:persona:canal` (misma forma que `claveEnvioCobranza` de
 * `app/api/cobros-fi/_cobranza.ts`, con el aviso en lugar de la unidad porque
 * una unidad tiene un aviso por período). Re-entregar el mismo aviso a la misma
 * persona por el mismo canal choca contra el índice único
 * `(comunidadId, claveEnvio)`; el reenvío explícito agrega `:reenvio:<epoch>` y
 * queda como fila nueva marcada `reenvio: true`, igual que la cobranza.
 */
import { prisma } from "@/lib/prisma"
import { enviarCorreoComunidad, estadoRegistroSMTP, motivoSMTP } from "@/lib/smtp"
import type { CanalEntregaAviso, EstadoEntregaAviso } from "@/lib/schemas"

/**
 * Motivo del correo en cola. Es el mismo hecho que declara
 * `app/api/cobros-fi/[id]/cobranza/route.ts` para su outbox: sin emisor
 * configurado no hay envío, y decirlo es más honesto que un estado optimista.
 * Desde F4 este motivo es CONDICIONAL: sólo se escribe cuando el emisor no está
 * configurado (falta la fila de CF o `SMTP_PASSWORD`), no siempre.
 */
export const MOTIVO_SIN_SMTP =
  "Sin emisor SMTP configurado (F4): el correo del aviso queda en la cola de salida (outbox) y no se reporta como enviado."

/**
 * Motivo del correo cuando el aviso no tiene a quién ir. Es un dato que falta,
 * no una falta de emisor: se declara como envío fallido (mismo criterio que la
 * cobranza FI), nunca como `pendiente` ni como `enviado`.
 */
export const MOTIVO_SIN_DESTINATARIO =
  "Falló el envío por SMTP: el propietario vigente de la unidad no tiene correo electrónico registrado."

/** Lo mínimo de la unidad para nombrarla en textos y mensajes de error. */
export interface UnidadDelDestinatario {
  etiqueta: string
  numero: string
}

/**
 * Referencia legible de la unidad (`Depto 101`). Si la fila de la unidad ya no
 * existe se cae al id: un mensaje que nombra la unidad no puede depender de que
 * la unidad exista.
 */
export function referenciaDeUnidad(
  unidad: UnidadDelDestinatario | null,
  unidadId: string
): string {
  return unidad ? `${unidad.etiqueta} ${unidad.numero}` : unidadId
}

/**
 * Propietario VIGENTE de la unidad: `rol: "propietario"` con `fechaFin` null,
 * el más reciente. Mismo criterio (y mismo `orderBy`) que la cobranza FI, que es
 * quien decide hoy a quién se le cobra la unidad.
 */
export async function propietarioVigenteDeUnidad(
  comunidadId: string,
  unidadId: string
): Promise<string | null> {
  const vinculo = await prisma.vinculoUnidad.findFirst({
    where: { comunidadId, unidadId, rol: "propietario", fechaFin: null },
    orderBy: { fechaInicio: "desc" },
    select: { personaId: true },
  })
  return vinculo?.personaId ?? null
}

/**
 * Clave de idempotencia de una entrega: aviso + destinatario + canal.
 *
 * Reentregar el mismo aviso NO duplica el registro; el reenvío explícito agrega
 * `:reenvio:<epoch>` y queda marcado con `reenvio: true`.
 */
export function claveEntregaAviso(input: {
  avisoId: string
  personaId: string
  canal: CanalEntregaAviso
  reenvioEn?: number
}): string {
  const base = `${input.avisoId}:${input.personaId}:${input.canal}`
  return input.reenvioEn === undefined ? base : `${base}:reenvio:${input.reenvioEn}`
}

/** Lo que se va a registrar en UN canal (antes de escribirlo). */
export interface PlanEntregaCanal {
  canal: CanalEntregaAviso
  estado: EstadoEntregaAviso
  motivo: string | null
}

/**
 * Lo que el canal email necesita para intentar el envío: la comunidad que
 * aporta la configuración SMTP (CF), a quién va y qué dice el mensaje.
 */
export interface MensajeEmailAviso {
  comunidadId: string
  /** Correo del propietario vigente; vacío o `null` = no hay destinatario. */
  destinatario: string | null
  asunto: string
  cuerpo: string
}

/** Contexto de la entrega completo: hoy el visor no necesita nada más. */
export interface ContextoEntregaAviso {
  email: MensajeEmailAviso
}

/**
 * Estado con el que se registra cada canal.
 *
 * - **visor** → `entregado`: la ruta crea su `Notificacion` en la misma
 *   transacción y el registro guarda el id. Ese estado NO depende del correo.
 * - **email** → el desenlace REAL del emisor (`lib/smtp.ts`):
 *   - `no_configurado` → `pendiente` con `MOTIVO_SIN_SMTP` (condición de
 *     configuración; no se abre ninguna conexión);
 *   - `enviado` → `enviado`, con el id del mensaje que devolvió el servidor
 *     dentro del motivo (la aceptación del servidor es la prueba);
 *   - `fallido` → `fallido` con el motivo redactado (nunca la contraseña).
 *
 * El correo NUNCA se registra `entregado`: no crea ninguna notificación que lo
 * pruebe. El visor NUNCA se registra `enviado`: su hecho es la notificación.
 */
export async function planDeCanal(
  canal: CanalEntregaAviso,
  contexto: ContextoEntregaAviso
): Promise<PlanEntregaCanal> {
  if (canal === "visor") return { canal, estado: "entregado", motivo: null }

  const destinatario = contexto.email.destinatario?.trim() ?? ""
  if (destinatario === "") {
    return { canal, estado: "fallido", motivo: MOTIVO_SIN_DESTINATARIO }
  }

  const resultado = await enviarCorreoComunidad(contexto.email.comunidadId, {
    to: destinatario,
    subject: contexto.email.asunto,
    text: contexto.email.cuerpo,
  })

  // `no_configurado` es estado de configuración, no envío fallido: queda en la
  // cola de salida con el motivo del outbox.
  if (resultado.estado === "no_configurado") {
    return { canal, estado: "pendiente", motivo: MOTIVO_SIN_SMTP }
  }

  // `enviado` exige la aceptación del servidor (250 final del DATA). El motivo
  // guarda el id del mensaje que devolvió el servidor cuando lo trae.
  return {
    canal,
    estado: estadoRegistroSMTP(resultado),
    motivo: motivoSMTP(resultado),
  }
}

/** Asunto del aviso: nombra el folio y el período (visor y correo dicen lo mismo). */
export function asuntoNotificacionAviso(input: {
  folio: string
  periodo: string
}): string {
  return `Aviso de cobro ${input.folio} — período ${input.periodo}`
}

/** Cuerpo del aviso: referencia el documento que se entrega (visor y correo). */
export function cuerpoNotificacionAviso(input: {
  folio: string
  periodo: string
  referenciaUnidad: string
}): string {
  return `Su aviso de cobro ${input.folio} del período ${input.periodo} para la unidad ${input.referenciaUnidad} está disponible en el visor. Conserve el folio ${input.folio}: identifica el documento emitido con el que se cobra el período.`
}
