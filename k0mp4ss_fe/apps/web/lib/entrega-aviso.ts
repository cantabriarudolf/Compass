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
 * 2. **El correo queda en cola.** La plataforma no tiene emisor SMTP (F4,
 *    bloqueado por credenciales del owner), así que el canal email se registra
 *    `pendiente` con su motivo y NUNCA `entregado` ni `enviado`. El vocabulario
 *    de estados (lib/schemas.ts) no tiene `enviado` a propósito.
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
import type { CanalEntregaAviso, EstadoEntregaAviso } from "@/lib/schemas"

/**
 * Motivo del correo en cola. Es el mismo hecho que declara
 * `app/api/cobros-fi/[id]/cobranza/route.ts` para su outbox: sin SMTP no hay
 * envío, y decirlo es más honesto que un estado optimista.
 */
export const MOTIVO_SIN_SMTP =
  "Sin emisor SMTP configurado (F4): el correo del aviso queda en la cola de salida (outbox) y no se reporta como enviado."

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
 * Estado con el que se registra cada canal. El visor es `entregado` porque la
 * ruta crea su `Notificacion` en la misma transacción; el correo es `pendiente`
 * con el motivo del outbox.
 */
export function planDeCanal(canal: CanalEntregaAviso): PlanEntregaCanal {
  return canal === "email"
    ? { canal, estado: "pendiente", motivo: MOTIVO_SIN_SMTP }
    : { canal, estado: "entregado", motivo: null }
}

/** Asunto de la notificación del visor: nombra el folio y el período. */
export function asuntoNotificacionAviso(input: {
  folio: string
  periodo: string
}): string {
  return `Aviso de cobro ${input.folio} — período ${input.periodo}`
}

/** Cuerpo de la notificación del visor: referencia el aviso que se entrega. */
export function cuerpoNotificacionAviso(input: {
  folio: string
  periodo: string
  referenciaUnidad: string
}): string {
  return `Su aviso de cobro ${input.folio} del período ${input.periodo} para la unidad ${input.referenciaUnidad} está disponible en el visor. Conserve el folio ${input.folio}: identifica el documento emitido con el que se cobra el período.`
}
