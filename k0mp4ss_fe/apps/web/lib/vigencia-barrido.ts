/**
 * lib/vigencia-barrido.ts — el barrido de avisos de vigencia del Registro de
 * Copropietarios, en UN solo lugar (S3 y S4 del plan
 * `odd/tasks/saldar-v2-pantallas-y-barrido.md`).
 *
 * Por qué existe: hasta acá el barrido vivía dentro de
 * `POST /api/vigencia-registro/avisos`, atado a la sesión y a UNA comunidad, así
 * que no había forma de correrlo solo. Copiarlo a un `GET` habría creado dos
 * barridos que se separan a la primera corrección —y el aviso que llega dejaría
 * de ser el mismo que ve el botón—. Este módulo es esa única implementación: el
 * botón manual y el cron la llaman con la comunidad que ya resolvió cada uno.
 *
 * ── Las reglas que están codificadas acá (no reinterpretar) ──────────────────
 *
 * 1. **Un solo barrido.** `barrerAvisosDeVigencia()` recibe el `comunidadId`
 *    explícito y hace exactamente lo que hacía el `POST`: lee los hechos de la
 *    base, deriva el veredicto con `estadoDelCaso`, decide con `avisosDelCaso`,
 *    escribe el aviso in-app con el puente (`notificar`) y su constancia en
 *    `avisos_vigencia` —las dos en la MISMA transacción, que es pura: el visor no
 *    abre ninguna conexión— y deja UN evento `AD_VIGENCIA_AVISOS` por corrida.
 *    El scope de la sesión NO se resuelve acá: la ruta lo hace
 *    (`withComunidadScope`) y el cron lo saca de la lista de comunidades con
 *    caso de vigencia. Este módulo no conoce sesiones ni secretos HTTP.
 * 2. **El correo sale por la puerta única.** La credencial de la comunidad
 *    (`CredencialCorreoComunidad`) la resuelve el emisor dentro de
 *    `planDeCanal`/`enviarCorreoComunidad`: el barrido ya NO descifra el secreto
 *    ni lo pasa por su cuenta, y no llama a `enviarCorreoSMTP` directo (S4). El
 *    correo sale por el puente, con el cliente PLANO: el diálogo SMTP nunca
 *    corre dentro de una transacción.
 * 3. **Sin emisor no se finge un envío (S4).** El aviso se escribe igual —la
 *    bandeja es el canal real— y la entrega del correo queda `pendiente` con
 *    `MOTIVO_SIN_SMTP` (sin credencial, sin CF o con la credencial ilegible: en
 *    los tres casos no se abre ninguna conexión).
 * 4. **`enviado` sólo cuando el servidor aceptó.** El desenlace sale del código
 *    final del DATA (`lib/smtp.ts`), nunca de que la conexión se haya abierto.
 *    Los estados no se mezclan:
 *      - `enviado`     el servidor aceptó el mensaje (queda el id del mensaje).
 *      - `fallido`     se intentó y rebotó; el motivo es el del emisor, redactado.
 *      - `sin_emisor`  no se intentó: no hay credencial, no se puede abrir, o CF
 *                      no tiene remitente. El aviso queda en la bandeja.
 *      - `en_bandeja`  el aviso no tiene correo a dónde ir: es para un rol de la
 *                      comunidad (`administrador`, `comite`) o la persona
 *                      destinataria no tiene dirección registrada.
 *    `enviados + fallidos + sinEmisor + enBandeja === emitidos` es la invariante
 *    que hace que el resumen no pueda mentir por omisión.
 * 5. **Idempotencia sin acordarse de nada.** La clave es
 *    `(comunidad, unidad, tipo, destinatario, hito)` en `avisos_vigencia`: volver
 *    a barrer con los mismos hechos choca contra el índice único, la transacción
 *    se revierte entera y el aviso se cuenta como `omitido`. Un aviso omitido
 *    tampoco se reenvía: el correo se intenta UNA vez, cuando el aviso se escribe.
 *
 * **La constancia por aviso ya existe (S3)**: cada aviso escrito deja su fila en
 * `entregas_notificacion` —el visor `entregado`, el correo con el desenlace real
 * del emisor— colgada de su notificación. Antes el barrido DESCARTABA el
 * desenlace por aviso: sólo quedaban las cifras del resumen y el evento. El
 * resumen y la bitácora se conservan con los mismos contadores.
 */
import { prisma } from "@/lib/prisma"
import { generarId } from "@/lib/id-utils"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import { estadoDelCaso } from "@/lib/vigencia-registro"
import {
  avisosDelCaso,
  type AvisoVigenciaDecidido,
  type DestinatarioAvisoVigencia,
} from "@/lib/vigencia-avisos"
import { notificar } from "@/lib/entrega/notificar"
import {
  MOTIVO_SIN_DESTINATARIO,
  MOTIVO_SIN_SMTP,
} from "@/lib/entrega-aviso"
import { CANAL_NOTIFICACION_EMAIL_SIMULADO } from "@/lib/schemas"

/**
 * Desenlace del correo de vigencia para UN destinatario en UNA corrida. NO es el
 * vocabulario persistido de una entrega (`EstadoEntregaCorreo`, en
 * `lib/schemas.ts`): incluye condiciones del barrido (`sin_emisor`, `en_bandeja`)
 * que no son estados de ninguna columna. Los nombres distintos son a propósito: el
 * homónimo anterior compilaba al importarse desde el archivo equivocado (hallazgo 21).
 */
export type EstadoBarridoVigencia =
  | "enviado"
  | "fallido"
  | "sin_emisor"
  | "en_bandeja"

/** Un desenlace con su motivo: el texto que el resumen y la bitácora citan. */
export interface EntregaAviso {
  readonly estado: EstadoBarridoVigencia
  readonly motivo: string
}

/** Lo que devuelve una corrida del barrido para UNA comunidad. */
export interface ResumenBarridoComunidad {
  readonly comunidadId: string
  /** Avisos escritos en esta corrida (notificación + constancia nuevas). */
  readonly emitidos: number
  /** Avisos que ya existían: el índice único rechazó la transacción. */
  readonly omitidos: number
  readonly enviados: number
  readonly fallidos: number
  /** Avisos escritos que quedaron en la bandeja porque no hay con qué enviar. */
  readonly sinEmisor: number
  /** Avisos escritos que no tienen correo de destino (rol o persona sin email). */
  readonly enBandeja: number
  /** Motivos únicos de los avisos que no salieron, en orden de aparición. */
  readonly motivos: readonly string[]
}

/** Pedido de una corrida. La comunidad la decide quien llama, nunca el cliente. */
export interface PedidoBarrido {
  readonly comunidadId: string
  /** Quién corre el barrido: el usuario de la sesión o `USUARIO_CRON`. */
  readonly usuario: string
  /** Reloj inyectable (los tests fijan la fecha). Default: ahora. */
  readonly ahora?: Date
}

/**
 * Autor de la bitácora cuando el barrido lo corre el cron: no hay sesión, y
 * escribir el id de un usuario inventaría una persona. `cron` es un hecho.
 */
export const USUARIO_CRON = "cron"

/** Tipo de acción de la bitácora: uno por corrida, no uno por aviso. */
export const TIPO_ACCION_BARRIDO = "AD_VIGENCIA_AVISOS"

/** El aviso queda en la bandeja: es para un rol, no para una persona. */
export function motivoBandejaDeRol(destinatario: DestinatarioAvisoVigencia): string {
  return `El aviso es para la bandeja del rol «${destinatario}» de la comunidad: no es una persona con correo electrónico, así que no hay a quién enviarlo y el aviso queda en la bandeja.`
}

/** El aviso queda en la bandeja: la persona destinataria no tiene dirección. */
export const MOTIVO_SIN_CORREO_DE_LA_PERSONA =
  "La persona destinataria no tiene correo electrónico registrado: el aviso queda en la bandeja y no se envió ningún correo."

/** P2002 = choque contra el índice único de idempotencia del barrido. */
function esDuplicado(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  )
}

/**
 * Comunidades con caso de vigencia: es el universo del barrido automático.
 *
 * Sin caso no hay nada que barrer: los hechos del Registro no existen todavía y
 * el barrido no inventa el registro de una comunidad que no lo cargó. Se ordena
 * para que la corrida sea determinista.
 */
export async function comunidadesConCasoDeVigencia(): Promise<string[]> {
  const filas = await prisma.vigenciaRegistroUnidad.findMany({
    distinct: ["comunidadId"],
    select: { comunidadId: true },
    orderBy: { comunidadId: "asc" },
  })
  return filas.map((fila) => fila.comunidadId)
}

/** El barrido ya no resuelve correos: el puente usa la definición única
 * (`lib/personas-contacto.ts`) y una sola consulta por lote.
 */

interface EmisionAviso {
  comunidadId: string
  unidadId: string
  personaId: string | null
  aviso: AvisoVigenciaDecidido
  fecha: string
}

/**
 * Escribe UNA notificación con su constancia, o no escribe nada.
 *
 * La transacción es la que impide el medio aviso: si la constancia choca contra
 * el índice único, la notificación de esa misma transacción se revierte y el
 * aviso queda como `omitido` —el mismo aviso ya estaba emitido—. El puente
 * escribe la notificación y su fila de entrega del visor EN la transacción, y
 * acá no hay red: `planDeCanal("visor")` no abre ninguna conexión.
 *
 * Devuelve el id del aviso in-app escrito, o `null` si el aviso ya existía.
 */
async function emitirAviso({
  comunidadId,
  unidadId,
  personaId,
  aviso,
  fecha,
}: EmisionAviso): Promise<string | null> {
  try {
    return await prisma.$transaction(async (tx) => {
      const { notificacionId } = await notificar(tx, {
        comunidadId,
        destinatarioRol: aviso.destinatario,
        // Sólo el propietario es una persona concreta; el administrador y el
        // Comité son roles y su bandeja se acota por `unidadId` (F5).
        destinatarioPersonaId:
          aviso.destinatario === "propietario" ? personaId : null,
        unidadId,
        asunto: aviso.asunto,
        cuerpo: aviso.cuerpo,
        canal: CANAL_NOTIFICACION_EMAIL_SIMULADO,
        moduloOrigen: "AD_VIGENCIA",
        fecha,
        leida: false,
        canales: ["visor"],
      })
      await tx.avisoVigencia.create({
        data: {
          comunidadId,
          unidadId,
          tipo: aviso.tipo,
          destinatario: aviso.destinatario,
          hito: aviso.hito,
          notificacionId,
        },
      })
      return notificacionId
    })
  } catch (error) {
    if (esDuplicado(error)) return null
    throw error
  }
}

interface PedidoEntrega {
  comunidadId: string
  unidadId: string
  notificacionId: string
  personaId: string | null
  aviso: AvisoVigenciaDecidido
  fecha: string
}

/**
 * El desenlace del CORREO de UN aviso, persistido (S3) y sin perder el resumen.
 *
 * El destinatario del correo es el propietario vigente de la unidad. Un aviso
 * para un rol (administración, comité) no tiene dirección y no se le inventa un
 * buzón (S5): se declara `en_bandeja` sin abrir ninguna conexión.
 *
 * Para el propietario, el intento va por el puente, que resuelve el correo con
 * la definición única y persiste su fila en `entregas_notificacion` colgada del
 * aviso ya escrito (`notificacionId`). El cliente es el PLANO: el diálogo SMTP
 * corre fuera de toda transacción. El estado del puente se traduce al
 * vocabulario del resumen (que no cambió):
 *   - `enviado`   → `enviado`
 *   - `fallido` por falta de dirección → `en_bandeja` (la persona no tiene buzón)
 *   - `fallido`   → `fallido`, con el motivo del emisor
 *   - `pendiente` → `sin_emisor`, con `MOTIVO_SIN_SMTP` (condición de configuración)
 */
async function entregarElCorreo({
  comunidadId,
  unidadId,
  notificacionId,
  personaId,
  aviso,
  fecha,
}: PedidoEntrega): Promise<EntregaAviso> {
  if (aviso.destinatario !== "propietario") {
    return {
      estado: "en_bandeja",
      motivo: motivoBandejaDeRol(aviso.destinatario),
    }
  }

  const { entregas } = await notificar(prisma, {
    comunidadId,
    destinatarioRol: aviso.destinatario,
    destinatarioPersonaId: personaId,
    unidadId,
    asunto: aviso.asunto,
    cuerpo: aviso.cuerpo,
    canal: CANAL_NOTIFICACION_EMAIL_SIMULADO,
    moduloOrigen: "AD_VIGENCIA",
    fecha,
    notificacionId,
    canales: ["email"],
  })
  const plan = entregas.find((entrega) => entrega.canal === "email")
  const motivo = plan?.motivo ?? MOTIVO_SIN_SMTP

  if (plan?.estado === "enviado") return { estado: "enviado", motivo }
  if (plan?.estado === "pendiente") return { estado: "sin_emisor", motivo }
  if (motivo === MOTIVO_SIN_DESTINATARIO) {
    return { estado: "en_bandeja", motivo: MOTIVO_SIN_CORREO_DE_LA_PERSONA }
  }
  return { estado: "fallido", motivo }
}

/** Motivos únicos, en orden de aparición: el resumen no repite el mismo texto. */
function motivosUnicos(entregas: readonly EntregaAviso[]): string[] {
  const vistos = new Set<string>()
  const motivos: string[] = []
  for (const entrega of entregas) {
    if (entrega.estado === "enviado" || vistos.has(entrega.motivo)) continue
    vistos.add(entrega.motivo)
    motivos.push(entrega.motivo)
  }
  return motivos
}

/**
 * Corre el barrido para UNA comunidad y devuelve su resumen.
 *
 * No resuelve la sesión y no decide permisos: eso es de la ruta. Tampoco atrapa
 * sus propias fallas: si la base no responde, el llamador decide qué hacer (500
 * en el botón, error de esa comunidad en el cron).
 */
export async function barrerAvisosDeVigencia(
  pedido: PedidoBarrido
): Promise<ResumenBarridoComunidad> {
  const { comunidadId, usuario } = pedido
  const ahora = pedido.ahora ?? new Date()
  const fecha = ahora.toISOString()

  const [unidades, casos, vinculos] = await Promise.all([
    prisma.unidad.findMany({
      where: { comunidadId },
      select: { id: true, numero: true },
      orderBy: { numero: "asc" },
    }),
    prisma.vigenciaRegistroUnidad.findMany({
      where: { comunidadId },
      select: { unidadId: true, ultimaActualizacion: true, requerimientoEn: true },
    }),
    // Mismo criterio que `propietarioVigenteDeUnidad()`: rol propietario,
    // vínculo abierto (`fechaFin: null`) y el más reciente primero. Una sola
    // consulta para todas las unidades: el primer vínculo de cada unidad es su
    // propietario vigente, igual que el `findFirst` por unidad.
    prisma.vinculoUnidad.findMany({
      where: { comunidadId, rol: "propietario", fechaFin: null },
      orderBy: { fechaInicio: "desc" },
      select: { unidadId: true, personaId: true },
    }),
  ])

  const casoPorUnidad = new Map(casos.map((caso) => [caso.unidadId, caso]))
  const propietarioPorUnidad = new Map<string, string>()
  for (const vinculo of vinculos) {
    if (!propietarioPorUnidad.has(vinculo.unidadId)) {
      propietarioPorUnidad.set(vinculo.unidadId, vinculo.personaId)
    }
  }

  let emitidos = 0
  let omitidos = 0
  const entregas: EntregaAviso[] = []

  for (const unidad of unidades) {
    const caso = casoPorUnidad.get(unidad.id)
    const personaId = propietarioPorUnidad.get(unidad.id) ?? null
    const veredicto = estadoDelCaso(
      {
        ultimaActualizacion: caso?.ultimaActualizacion ?? null,
        requerimientoEn: caso?.requerimientoEn ?? null,
      },
      ahora
    )

    const avisos = avisosDelCaso({
      veredicto,
      numeroUnidad: unidad.numero,
      hayPropietarioVigente: personaId !== null,
      hayRequerimientoAbierto: caso?.requerimientoEn != null,
    })

    for (const aviso of avisos) {
      // 1. El aviso in-app y su constancia, juntos y en una transacción corta
      //    (el visor no abre ninguna conexión).
      const notificacionId = await emitirAviso({
        comunidadId,
        unidadId: unidad.id,
        personaId,
        aviso,
        fecha,
      })
      if (notificacionId === null) {
        omitidos += 1
        // Un aviso ya emitido no se reenvía: el correo se intenta cuando nace.
        continue
      }
      emitidos += 1
      // 2. El correo, por el puente y con el cliente plano: el diálogo SMTP
      //    nunca corre dentro de una transacción, y su desenlace queda
      //    persistido por aviso (S3) en vez de perderse.
      entregas.push(
        await entregarElCorreo({
          comunidadId,
          unidadId: unidad.id,
          notificacionId,
          personaId,
          aviso,
          fecha,
        })
      )
    }
  }

  const contar = (estado: EstadoBarridoVigencia) =>
    entregas.filter((entrega) => entrega.estado === estado).length
  const enviados = contar("enviado")
  const fallidos = contar("fallido")
  const sinEmisor = contar("sin_emisor")
  const enBandeja = contar("en_bandeja")
  const motivos = motivosUnicos(entregas)

  // Un evento por corrida, no uno por aviso: las notificaciones mismas son la
  // evidencia; este evento deja constancia de que el barrido se corrió, de
  // cuánto emitió, cuánto omitió por idempotencia y qué pasó con los correos.
  await registrarEventoAuditoria({
    id: generarId("ev"),
    comunidadId,
    timestamp: fecha,
    usuario,
    categoria: "AD",
    tipoAccion: TIPO_ACCION_BARRIDO,
    referenciaId: comunidadId,
    descripcion: descripcionDelBarrido({
      emitidos,
      omitidos,
      enviados,
      fallidos,
      sinEmisor,
      enBandeja,
      motivos,
    }),
  })

  return {
    comunidadId,
    emitidos,
    omitidos,
    enviados,
    fallidos,
    sinEmisor,
    enBandeja,
    motivos,
  }
}

/**
 * Texto del evento de bitácora. Conserva la frase histórica («N emitido(s) y M
 * omitido(s) por idempotencia») y le agrega el desenlace del correo con sus
 * motivos, que es la única constancia que el sistema guarda del envío.
 */
function descripcionDelBarrido(cifras: {
  emitidos: number
  omitidos: number
  enviados: number
  fallidos: number
  sinEmisor: number
  enBandeja: number
  motivos: readonly string[]
}): string {
  const correos =
    `Correos: ${cifras.enviados} enviado(s), ${cifras.fallidos} fallido(s), ` +
    `${cifras.sinEmisor} sin emisor de correo y ${cifras.enBandeja} sin correo de destino; ` +
    "los avisos no enviados quedan en la bandeja."
  const motivos =
    cifras.motivos.length === 0 ? "" : ` Motivos: ${cifras.motivos.join(" | ")}`
  return (
    `Avisos de vigencia del Registro de Copropietarios: ${cifras.emitidos} emitido(s) y ` +
    `${cifras.omitidos} omitido(s) por idempotencia. ${correos}${motivos}`
  )
}
