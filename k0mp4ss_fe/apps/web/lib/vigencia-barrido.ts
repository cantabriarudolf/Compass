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
 *    escribe la `Notificacion` y su constancia en `avisos_vigencia` —las dos en
 *    la misma transacción— y deja UN evento `AD_VIGENCIA_AVISOS` por corrida.
 *    El scope de la sesión NO se resuelve acá: la ruta lo hace
 *    (`withComunidadScope`) y el cron lo saca de la lista de comunidades con
 *    caso de vigencia. Este módulo no conoce sesiones ni secretos HTTP.
 * 2. **El correo sale con la credencial cifrada de la comunidad (F33).** Si la
 *    comunidad tiene `CredencialCorreoComunidad`, el secreto se descifra EN
 *    MEMORIA con la clave maestra del entorno y se pasa al emisor de
 *    `lib/smtp.ts`; acá no se persiste, no se devuelve y no se registra. La fila
 *    de CF aporta remitente y seguridad, el resto lo aporta la credencial.
 * 3. **Sin credencial no se finge un envío (S4).** El aviso se escribe igual —la
 *    bandeja es el canal real— y el desenlace se declara `sin_emisor` con el
 *    motivo. Lo mismo si el secreto no se puede descifrar (clave maestra
 *    ausente, rotación, dato alterado) o si CF no tiene remitente: en esos casos
 *    NO se abre ninguna conexión.
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
 * **Lo que este módulo NO persiste por aviso**: el desenlace del correo. No hay
 * columna ni tabla donde guardarlo sin cambiar el modelo (`AvisoVigencia` y
 * `Notificacion` tienen contrato congelado), así que la constancia es la del
 * barrido: el resumen que devuelve esta función y el evento `AD_VIGENCIA_AVISOS`,
 * que ahora lleva los envíos y los motivos. Persistir un desenlace por aviso es
 * una decisión aparte y exige migración.
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
import { descifrarSecreto } from "@/lib/cifrado-secretos"
import {
  enviarCorreoSMTP,
  leerConfiguracionSMTP,
  motivoSMTP,
  type CredencialSMTP,
  type FilaConfiguracionSMTP,
} from "@/lib/smtp"

/** Desenlace del correo de un aviso. Cuatro estados que no se confunden. */
export type EstadoEntregaAviso =
  | "enviado"
  | "fallido"
  | "sin_emisor"
  | "en_bandeja"

/** Un desenlace con su motivo: el texto que el resumen y la bitácora citan. */
export interface EntregaAviso {
  readonly estado: EstadoEntregaAviso
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

/** El aviso queda en la bandeja: la comunidad no tiene credencial de correo. */
export const MOTIVO_SIN_CREDENCIAL =
  "La comunidad no tiene credencial de correo guardada: el aviso queda en la bandeja y no se envió ningún correo."

/** El aviso queda en la bandeja: la credencial guardada no se puede abrir. */
export const MOTIVO_CREDENCIAL_ILEGIBLE =
  "No se pudo descifrar la credencial de correo de la comunidad con la clave maestra del servidor: el aviso queda en la bandeja y no se envió ningún correo."

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

/** Correos de las personas destinatarias, en UNA consulta (sin N+1). */
async function correosDePersonas(
  comunidadId: string,
  personaIds: readonly string[]
): Promise<Map<string, string>> {
  const ids = [...new Set(personaIds)]
  if (ids.length === 0) return new Map()
  const personas = await prisma.persona.findMany({
    where: { comunidadId, id: { in: ids } },
    select: { id: true, email: true },
  })
  return new Map(personas.map((persona) => [persona.id, persona.email]))
}

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
 * aviso queda como `omitido` —el mismo aviso ya estaba emitido—.
 */
async function emitirAviso({
  comunidadId,
  unidadId,
  personaId,
  aviso,
  fecha,
}: EmisionAviso): Promise<boolean> {
  try {
    await prisma.$transaction(async (tx) => {
      const notificacionId = generarId("not")
      await tx.notificacion.create({
        data: {
          id: notificacionId,
          comunidadId,
          destinatarioRol: aviso.destinatario,
          // Sólo el propietario es una persona concreta; el administrador y el
          // Comité son roles y su bandeja se acota por `unidadId` (F5).
          destinatarioPersonaId:
            aviso.destinatario === "propietario" ? personaId : null,
          unidadId,
          asunto: aviso.asunto,
          cuerpo: aviso.cuerpo,
          canal: "email_simulado",
          moduloOrigen: "AD_VIGENCIA",
          fecha,
          leida: false,
        },
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
    })
    return true
  } catch (error) {
    if (esDuplicado(error)) return false
    throw error
  }
}

interface PedidoEntrega {
  aviso: AvisoVigenciaDecidido
  personaId: string | null
  correos: Map<string, string>
}

/**
 * El emisor de UNA corrida para UNA comunidad. Resuelve la credencial y la fila
 * de CF una sola vez (lazy: sólo si hay algún aviso con correo a dónde ir) y
 * nunca guarda el secreto fuera de memoria.
 */
function crearEmisor(comunidadId: string) {
  let credencial: CredencialSMTP | null | undefined
  // `undefined` = todavía no se leyó; `null` = la comunidad no tiene fila de CF.
  let filaCF: FilaConfiguracionSMTP | null | undefined
  let motivoSinEmisor: string | null = null

  async function resolver(): Promise<{
    credencial: CredencialSMTP
    filaCF: FilaConfiguracionSMTP | null
  } | null> {
    if (motivoSinEmisor !== null) return null
    if (credencial === undefined) {
      const fila = await prisma.credencialCorreoComunidad.findUnique({
        where: { comunidadId },
      })
      if (!fila) {
        credencial = null
        motivoSinEmisor = MOTIVO_SIN_CREDENCIAL
        return null
      }
      try {
        credencial = {
          host: fila.host,
          puerto: fila.puerto,
          usuario: fila.usuario,
          // El secreto se descifra en memoria y muere con la corrida: no se
          // guarda, no se loguea y no vuelve en ninguna respuesta.
          secreto: descifrarSecreto({
            secretoCifrado: fila.secretoCifrado,
            iv: fila.iv,
            authTag: fila.authTag,
          }),
        }
      } catch {
        credencial = null
        motivoSinEmisor = MOTIVO_CREDENCIAL_ILEGIBLE
        return null
      }
    }
    if (credencial === null) return null
    if (filaCF === undefined) filaCF = await leerConfiguracionSMTP(comunidadId)
    return { credencial, filaCF: filaCF ?? null }
  }

  return async function entregar({ aviso, personaId, correos }: PedidoEntrega) {
    if (aviso.destinatario !== "propietario") {
      return {
        estado: "en_bandeja" as const,
        motivo: motivoBandejaDeRol(aviso.destinatario),
      }
    }
    const correo = (personaId ? correos.get(personaId) ?? "" : "").trim()
    if (correo === "") {
      return { estado: "en_bandeja" as const, motivo: MOTIVO_SIN_CORREO_DE_LA_PERSONA }
    }

    const resuelto = await resolver()
    if (resuelto === null) {
      return {
        estado: "sin_emisor" as const,
        motivo: motivoSinEmisor ?? MOTIVO_SIN_CREDENCIAL,
      }
    }

    const resultado = await enviarCorreoSMTP(
      resuelto.filaCF,
      { to: correo, subject: aviso.asunto, text: aviso.cuerpo },
      { credencial: resuelto.credencial }
    )

    if (resultado.estado === "enviado") {
      return { estado: "enviado" as const, motivo: motivoSMTP(resultado) }
    }
    if (resultado.estado === "fallido") {
      return { estado: "fallido" as const, motivo: motivoSMTP(resultado) }
    }
    // `no_configurado`: falta CF o algún campo obligatorio del remitente. No se
    // abrió ninguna conexión, así que el aviso queda en la bandeja con el motivo.
    return {
      estado: "sin_emisor" as const,
      motivo: `${resultado.motivo} El aviso queda en la bandeja y no se reporta como enviado.`,
    }
  }
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
  const correos = await correosDePersonas(comunidadId, [
    ...propietarioPorUnidad.values(),
  ])
  const entregar = crearEmisor(comunidadId)

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
      const emitido = await emitirAviso({
        comunidadId,
        unidadId: unidad.id,
        personaId,
        aviso,
        fecha,
      })
      if (!emitido) {
        omitidos += 1
        // Un aviso ya emitido no se reenvía: el correo se intenta cuando nace.
        continue
      }
      emitidos += 1
      entregas.push(await entregar({ aviso, personaId, correos }))
    }
  }

  const contar = (estado: EstadoEntregaAviso) =>
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
