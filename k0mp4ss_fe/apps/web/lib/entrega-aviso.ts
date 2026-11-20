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
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import {
  descargarArchivoPrivado,
  ErrorDelDeposito,
} from "@/lib/almacen-documentos"
import {
  CANAL_DE_LA_CONSTANCIA_DEL_CONVENIO,
  MIME_DEL_CONVENIO,
  MOTIVO_CONSTANCIA_PENDIENTE,
  esRutaDelConvenioFirmado,
  nombreDelConvenioFirmado,
} from "@/lib/convenio-documento"
import { enviarCorreoComunidad, estadoRegistroSMTP, motivoSMTP } from "@/lib/smtp"
import type {
  CanalEntregaAviso,
  EstadoEntregaCorreo,
  EstadoEnvioDocumento,
} from "@/lib/schemas"

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
  estado: EstadoEntregaCorreo
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

// ── F29 · T2 — la constancia de entrega del convenio firmado (S2) ───────────
//
// El papel firmado del convenio de pago se archiva con una constancia de
// entrega al deudor que nace `pendiente`; esta sección es la que CURSA el envío
// real después del commit del archivo. Reusa el emisor de la comunidad (la
// misma credencial cifrada del aviso de cobro) con el PDF ADJUNTO, leído del
// depósito privado, y la regla del contrato de los envíos: `entregado` (la
// aceptación del servidor, que el aviso llama `enviado`) sólo si el SMTP
// aceptó, `fallido` con el error verbatim si rebotó, y `pendiente` —con el
// motivo con el que la constancia nació— cuando no hay con qué cursar (sin
// emisor configurado o sin correo del deudor). Sin credencial no se finge el
// envío.

/** Asunto del correo del papel firmado del convenio. */
export function asuntoConstanciaConvenio(input: {
  referenciaUnidad: string
}): string {
  return `Convenio de pago firmado — unidad ${input.referenciaUnidad}`
}

/** Cuerpo del correo: presenta el adjunto y deja dicho que el mensaje es la constancia. */
export function cuerpoConstanciaConvenio(input: {
  referenciaUnidad: string
  deudorNombre: string
  fechaSuscripcion: string
}): string {
  return `Se adjunta el convenio de pago firmado de la unidad ${input.referenciaUnidad} con ${input.deudorNombre}, suscrito el ${input.fechaSuscripcion}. Este mensaje deja constancia de su entrega; el papel también queda disponible en el archivo de documentos de la comunidad.`
}

/**
 * El estado final de la constancia después de un intento de cursada. Es el
 * subconjunto del documento (`EstadoEnvioDocumento`): la constancia ES la fila de
 * `envios_documento` que se actualiza, así que no declara un vocabulario propio.
 */
export interface ConstanciaConvenioCursada {
  estado: EstadoEnvioDocumento
  motivo: string
}

/**
 * Cursa el envío real del papel firmado del convenio y actualiza SU constancia.
 *
 * Corre SIEMPRE fuera de cualquier transacción (el diálogo SMTP no retiene el
 * lock de la base). El destinatario es el DEUDOR del convenio —la persona que
 * firmó el papel— y el PDF sale adjunto con los bytes leídos del depósito
 * privado. Actualiza la fila de `EnvioDocumento` en el lugar y suma UN evento
 * por intento (`FI_CONVENIO_DOCUMENTO_ENVIADO` en la cursada del archivo,
 * `FI_CONVENIO_DOCUMENTO_REENVIO` en el reenvío manual); nunca crea filas
 * nuevas: el reenvío es el MISMO registro contado de nuevo, no una segunda
 * constancia.
 */
export async function cursarConstanciaDelConvenio(input: {
  comunidadId: string
  convenioId: string
  documentoId: string
  /** La fila de la constancia que nació con el archivo del papel. */
  constanciaId: string
  personaId: string
  usuarioId: string
  reenvio: boolean
}): Promise<ConstanciaConvenioCursada> {
  const [convenio, persona] = await Promise.all([
    prisma.convenioPago.findFirst({
      where: { id: input.convenioId, comunidadId: input.comunidadId },
      select: { unidadId: true, fechaSuscripcion: true },
    }),
    prisma.persona.findFirst({
      where: { id: input.personaId, comunidadId: input.comunidadId },
      select: { email: true, nombreCompleto: true },
    }),
  ])
  const unidad = convenio
    ? await prisma.unidad.findFirst({
        where: { id: convenio.unidadId, comunidadId: input.comunidadId },
        select: { etiqueta: true, numero: true },
      })
    : null
  const referenciaUnidad = referenciaDeUnidad(unidad, input.convenioId)

  let estado: ConstanciaConvenioCursada["estado"] = "pendiente"
  let motivo = MOTIVO_CONSTANCIA_PENDIENTE
  let detalleDelIntento: string

  const destinatario = persona?.email?.trim() ?? ""
  if (destinatario === "") {
    // Sin correo del deudor no se abre ninguna conexión y no se inventa un
    // envío: el intento no puede siquiera empezar.
    detalleDelIntento =
      "el deudor no tiene correo electrónico registrado, así que el envío no se pudo intentar"
  } else if (!convenio) {
    detalleDelIntento =
      "el convenio no se encontró en esta comunidad, así que el envío no se pudo intentar"
  } else {
    const documento = await prisma.documento.findFirst({
      where: { id: input.documentoId, comunidadId: input.comunidadId },
      select: { archivoUrl: true, archivoNombre: true },
    })
    if (!documento || !esRutaDelConvenioFirmado(documento.archivoUrl)) {
      detalleDelIntento =
        "el papel firmado no está servible desde el depósito privado, así que el envío no se pudo intentar"
    } else {
      try {
        const bytes = await descargarArchivoPrivado({ pathname: documento.archivoUrl })
        const resultado = await enviarCorreoComunidad(input.comunidadId, {
          to: destinatario,
          subject: asuntoConstanciaConvenio({ referenciaUnidad }),
          text: cuerpoConstanciaConvenio({
            referenciaUnidad,
            deudorNombre: persona?.nombreCompleto ?? "el deudor",
            fechaSuscripcion: convenio.fechaSuscripcion.toISOString().slice(0, 10),
          }),
          adjuntos: [
            {
              nombre: nombreDelConvenioFirmado(documento.archivoNombre, input.convenioId),
              bytes,
              tipoMime: MIME_DEL_CONVENIO,
            },
          ],
        })

        if (resultado.estado === "no_configurado") {
          // Condición de configuración, no envío fallido: la constancia se queda
          // con el motivo con el que nació; el reenvío manual la recupera cuando
          // la comunidad configure su emisor.
          detalleDelIntento =
            "la comunidad no tiene emisor de correo configurado, así que el envío no se pudo intentar"
        } else {
          estado = resultado.estado === "enviado" ? "entregado" : "fallido"
          motivo = motivoSMTP(resultado)
          detalleDelIntento =
            resultado.estado === "enviado"
              ? `el servidor de correo aceptó el mensaje${resultado.messageId ? ` (id ${resultado.messageId})` : ""}`
              : "el envío por SMTP rebotó y el error del servidor quedó verbatim en el motivo de la constancia"
        }
      } catch (e) {
        if (e instanceof ErrorDelDeposito) {
          logger.error(
            { err: e, convenioId: input.convenioId, documentoId: input.documentoId },
            "[entrega-aviso] el depósito no entregó el papel del convenio para su constancia"
          )
        } else {
          logger.error(
            { err: e, convenioId: input.convenioId, documentoId: input.documentoId },
            "[entrega-aviso] la cursada de la constancia del convenio falló de forma inesperada"
          )
        }
        detalleDelIntento =
          "no se pudo leer el papel desde el depósito privado, así que el envío no se pudo intentar"
      }
    }
  }

  const actualizada = await prisma.envioDocumento.updateMany({
    where: {
      id: input.constanciaId,
      comunidadId: input.comunidadId,
      documentoId: input.documentoId,
    },
    data: { estado, motivo },
  })
  if (actualizada.count === 0) {
    logger.warn(
      { constanciaId: input.constanciaId, convenioId: input.convenioId },
      "[entrega-aviso] la constancia del convenio no se encontró para actualizar"
    )
  }

  await registrarEventoAuditoria({
    id: generarId("ev"),
    comunidadId: input.comunidadId,
    timestamp: new Date().toISOString(),
    usuario: input.usuarioId,
    categoria: "FI",
    tipoAccion: input.reenvio
      ? "FI_CONVENIO_DOCUMENTO_REENVIO"
      : "FI_CONVENIO_DOCUMENTO_ENVIADO",
    referenciaId: input.convenioId,
    descripcion: `${input.reenvio ? "Reenvío manual de la" : "Cursada de la"} constancia de entrega del convenio ${input.convenioId} (${referenciaUnidad}) al deudor ${input.personaId} por el canal ${CANAL_DE_LA_CONSTANCIA_DEL_CONVENIO}: ${detalleDelIntento}. La constancia quedó en estado ${estado}.`,
  })

  return { estado, motivo }
}
