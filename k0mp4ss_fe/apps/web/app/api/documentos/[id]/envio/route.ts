/**
 * /api/documentos/[id]/envio — entrega de un documento LEGAL y su constancia por
 * destinatario (F35 serie A, A3 · S7/S8).
 *
 * POST (`doc` crear = administración y comité, la misma acción con la que se
 * sube un documento): entrega el documento a N destinatarios en UNA corrida.
 *
 * - **Una corrida, N destinatarios** (S7): el body trae `personasIds` y un
 *   `canal`. Cada destinatario produce SU fila de `envios_documento`; "en
 *   paralelo" es esto, nunca el mismo envío repetido por accidente.
 * - **Idempotencia** (S7): la clave es `documento:persona:canal` y el índice
 *   único `(comunidadId, claveEnvio)` la vuelve una garantía. Una corrida
 *   repetida devuelve `duplicado` por destinatario y NO escribe nada; el reenvío
 *   explícito (`{ reenviar: true }`) agrega `:reenvio:<epoch>` y deja una fila
 *   nueva marcada `reenvio: true`, igual que el aviso de cobro.
 * - **Visor**: `entregado` sólo porque se crea la `Notificacion` de cada
 *   destinatario en la MISMA transacción; el registro apunta a ella
 *   (`notificacionId`) y no hay entrega declarada sin la fila que la prueba.
 * - **Email**: sale por el emisor SMTP real que ya usa el aviso (`lib/smtp.ts`
 *   vía `planDeCanal`), sin inventar transporte. Queda `entregado` SOLO si el
 *   servidor aceptó el mensaje, `pendiente` con el motivo del outbox cuando la
 *   comunidad no tiene emisor configurado y `fallido` con el motivo redactado
 *   cuando se intentó y rebotó.
 * - **Lo comunitario no se entrega** (S8): se publica al visor de toda la
 *   comunidad y su constancia es "publicado", no una entrega por persona, así
 *   que la ruta responde 409 en vez de fabricar una constancia que nadie pidió.
 *
 * GET (`doc` crear = administración y comité): la constancia de entregas del
 * documento, más reciente primero, con el nombre del destinatario. Es la vista
 * de AUDITORÍA y por eso pide la misma acción que enviar: la nómina de
 * destinatarios es dato personal de terceros (mismo criterio que el desglose de
 * lecturas de CO y que el historial del aviso, que sólo lee quien audita). La
 * persona destinataria ve su entrega en su bandeja: la `Notificacion` ES la
 * entrega por el visor, no un resumen de la tabla.
 */
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { hoyISO } from "@/lib/date-utils"
import { generarId } from "@/lib/id-utils"
import { puede } from "@/lib/authz"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import { IdEntidadSchema } from "@/lib/schemas"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import {
  CANALES_ENVIO_DOCUMENTO,
  MENSAJE_COMUNITARIO_PUBLICADO,
  asuntoNotificacionDocumento,
  claveEnvioDocumento,
  cuerpoNotificacionDocumento,
  planDeEnvioDocumento,
  rolBandejaDe,
  type CanalEnvioDocumento,
  type EstadoEnvioDocumento,
} from "../../_lib/envio-documento"

type Ctx = { params: Promise<{ id: string }> }

/** El archivo se gobierna con la clave `doc` (matriz RP, F35-A). */
const RECURSO_DOCUMENTO = "doc"

/** Tope de la constancia que devuelve el GET (una corrida puede reenviarse). */
const MAXIMO_ENVIOS_LEIDOS = 500

/**
 * Entrada de la corrida: los destinatarios ya resueltos (el cliente expande los
 * grupos propietarios/arrendatarios/comité a personas) y el canal.
 */
const EntradaEnvioSchema = z.object({
  personasIds: z.array(IdEntidadSchema).min(1, "El envío necesita al menos un destinatario."),
  canal: z.enum(CANALES_ENVIO_DOCUMENTO, {
    errorMap: () => ({ message: "El canal debe ser visor o email." }),
  }),
  reenviar: z.boolean().optional(),
})

/** Estado de UN destinatario en la respuesta: el registrado, o `duplicado`. */
export type ResultadoEnvioDocumento = {
  personaId: string
  canal: CanalEnvioDocumento
  estado: EstadoEnvioDocumento | "duplicado"
  motivo?: string
  envioId?: string
  notificacionId?: string
  fecha?: string
}

/** Fila que se va a escribir, con el resultado de la respuesta que completa sus ids. */
interface EntregaPendiente {
  resultado: ResultadoEnvioDocumento
  personaId: string
  estado: EstadoEnvioDocumento
  motivo: string | null
  claveEnvio: string
  rolBandeja: string
}

/** Resumen `estado n, estado m` de la corrida, para el mensaje y la bitácora. */
function resumenDeEstados(resultados: ResultadoEnvioDocumento[]): string {
  const conteo = new Map<string, number>()
  for (const resultado of resultados) {
    conteo.set(resultado.estado, (conteo.get(resultado.estado) ?? 0) + 1)
  }
  return [...conteo.entries()].map(([estado, n]) => `${estado} ${n}`).join(", ")
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const scopeResult = await withComunidadScope()
  if (!scopeResult.ok) return scopeResult.response
  const scope = scopeResult.scope
  if (!puede(scope.rol, "crear", RECURSO_DOCUMENTO)) {
    return jsonError(403, "Permiso denegado.")
  }
  const { id } = await ctx.params

  const crudo = await req.json().catch(() => null)
  const parsed = EntradaEnvioSchema.safeParse(crudo ?? {})
  if (!parsed.success) {
    return jsonError(400, "Datos del envío inválidos.")
  }
  const canal = parsed.data.canal
  const reenviar = parsed.data.reenviar === true
  // Una corrida con el mismo destinatario repetido no es "en paralelo": se
  // deduplica ANTES de mirar la base, para que la clave no choque consigo misma.
  const personasIds = [
    ...new Set(parsed.data.personasIds.map((personaId) => personaId.trim())),
  ].filter(Boolean)
  if (personasIds.length === 0) {
    return jsonError(400, "Datos del envío inválidos.")
  }

  try {
    const documento = await prisma.documento.findUnique({
      where: { id },
      select: {
        id: true,
        comunidadId: true,
        naturaleza: true,
        glosa: true,
        tipoDocumental: true,
        version: true,
      },
    })
    if (!documento || documento.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }

    // S8 · lo comunitario se publica, no se entrega por persona. Se corta antes
    // de tocar cualquier fila: no hay constancia que inventar.
    if (documento.naturaleza !== "legal") {
      return jsonError(409, MENSAJE_COMUNITARIO_PUBLICADO)
    }

    // El destinatario de registro tiene que existir EN ESTA comunidad: una
    // persona de otra comunidad nunca recibe un documento ajeno.
    const personas = await prisma.persona.findMany({
      where: { id: { in: personasIds }, comunidadId: scope.comunidadId },
      select: {
        id: true,
        email: true,
        roles: true,
        datosGobernanza: true,
      },
    })
    const encontradas = new Set(personas.map((persona) => persona.id))
    const faltantes = personasIds.filter((personaId) => !encontradas.has(personaId))
    if (faltantes.length > 0) {
      return jsonError(
        400,
        `El documento no se puede entregar a personas que no pertenecen a esta comunidad: ${faltantes.join(", ")}.`
      )
    }
    const porId = new Map(personas.map((persona) => [persona.id, persona]))

    // El mismo texto para el visor y el correo: no hay una segunda redacción que
    // se desincronice de lo que la persona ve en su bandeja.
    const asunto = asuntoNotificacionDocumento({ glosa: documento.glosa })
    const cuerpo = cuerpoNotificacionDocumento({
      glosa: documento.glosa,
      tipoDocumental: documento.tipoDocumental,
      version: documento.version,
    })

    // Entregas previas por (documento, persona, canal): la clave base decide si
    // esto es una reentrega (no escribe) o un reenvío explícito (escribe una
    // fila más con el sufijo).
    const clavesBase = personasIds.map((personaId) =>
      claveEnvioDocumento({ documentoId: documento.id, personaId, canal })
    )
    const existentes = await prisma.envioDocumento.findMany({
      where: {
        comunidadId: scope.comunidadId,
        claveEnvio: { in: clavesBase },
      },
      select: { id: true, estado: true, fecha: true, claveEnvio: true },
    })
    const previoPorClave = new Map(existentes.map((fila) => [fila.claveEnvio, fila]))

    const fecha = hoyISO()
    // Un epoch para TODA la corrida: los reenvíos de la misma corrida comparten
    // sufijo y no se pisan entre sí (la clave sigue siendo por persona).
    const reenvioEn = reenviar ? Date.now() : undefined
    const resultados: ResultadoEnvioDocumento[] = []
    const aEscribir: EntregaPendiente[] = []

    for (const personaId of personasIds) {
      const previo = previoPorClave.get(
        claveEnvioDocumento({ documentoId: documento.id, personaId, canal })
      )
      if (previo && !reenviar) {
        resultados.push({
          personaId,
          canal,
          estado: "duplicado",
          envioId: previo.id,
          fecha: previo.fecha,
          motivo: `Ya existe una entrega registrada el ${previo.fecha} (estado ${previo.estado}); pedí un reenvío explícito para volver a entregar.`,
        })
        continue
      }

      const persona = porId.get(personaId)
      const plan = await planDeEnvioDocumento(canal, {
        comunidadId: scope.comunidadId,
        destinatario: persona?.email ?? null,
        asunto,
        cuerpo,
      })
      const resultado: ResultadoEnvioDocumento = {
        personaId,
        canal,
        estado: plan.estado,
        motivo: plan.motivo ?? undefined,
        fecha,
      }
      resultados.push(resultado)
      aEscribir.push({
        resultado,
        personaId,
        estado: plan.estado,
        motivo: plan.motivo,
        claveEnvio: claveEnvioDocumento({
          documentoId: documento.id,
          personaId,
          canal,
          reenvioEn,
        }),
        rolBandeja: rolBandejaDe(persona ?? { roles: [], datosGobernanza: null }),
      })
    }

    if (aEscribir.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const entrega of aEscribir) {
          const envioId = generarId("env-doc")
          let notificacionDelCanal: string | null = null
          // El visor se materializa en la notificación de la persona: es la
          // entrega, no un aviso de que hubo entrega.
          if (canal === "visor") {
            notificacionDelCanal = generarId("not")
            await tx.notificacion.create({
              data: {
                id: notificacionDelCanal,
                comunidadId: scope.comunidadId,
                destinatarioRol: entrega.rolBandeja,
                destinatarioPersonaId: entrega.personaId,
                asunto,
                cuerpo,
                canal: "email_simulado",
                moduloOrigen: "AD",
                fecha,
                leida: false,
              },
            })
          }

          await tx.envioDocumento.create({
            data: {
              id: envioId,
              comunidadId: scope.comunidadId,
              documentoId: documento.id,
              personaId: entrega.personaId,
              canal,
              estado: entrega.estado,
              fecha,
              motivo: entrega.motivo,
              notificacionId: notificacionDelCanal,
              claveEnvio: entrega.claveEnvio,
              reenvio: reenviar,
            },
          })

          entrega.resultado.envioId = envioId
          if (notificacionDelCanal) {
            entrega.resultado.notificacionId = notificacionDelCanal
          }
        }

        await registrarEventoAuditoria(
          {
            id: generarId("ev"),
            comunidadId: scope.comunidadId,
            timestamp: new Date().toISOString(),
            usuario: scope.usuarioId,
            categoria: "AD",
            tipoAccion: reenviar ? "AD_DOC_ENVIO_RESENT" : "AD_DOC_ENVIO",
            referenciaId: documento.id,
            descripcion: `${reenviar ? "Reenvío explícito de la entrega del" : "Entrega del"} documento legal "${documento.glosa}" (v${documento.version}) a ${personasIds.length} destinatario(s) por el canal ${canal}. Estados → ${resumenDeEstados(resultados)}.`,
          },
          tx
        )
      })
    }

    // `idempotente` describe lo único que importa para no duplicar: la entrega
    // ya estaba registrada para todos los destinatarios pedidos.
    const todosDuplicados =
      resultados.length > 0 && resultados.every((resultado) => resultado.estado === "duplicado")
    const mensaje = todosDuplicados
      ? `La entrega del documento "${documento.glosa}" ya estaba registrada para los destinatarios pedidos: no se creó ningún registro nuevo.`
      : `Documento "${documento.glosa}" procesado para ${personasIds.length} destinatario(s) por el canal ${canal}: ${resumenDeEstados(resultados)}.`

    return Response.json({
      ok: true,
      documentoId: documento.id,
      glosa: documento.glosa,
      canal,
      reenvio: reenviar,
      idempotente: todosDuplicados,
      resultados,
      mensaje,
    })
  } catch (e) {
    logger.error({ err: e }, "[api/documentos/envio] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}

/** GET: constancia de entregas del documento (más reciente primero). */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const scopeResult = await withComunidadScope()
  if (!scopeResult.ok) return scopeResult.response
  const scope = scopeResult.scope
  // La nómina de destinatarios es dato personal de terceros: la lee quien audita
  // (la misma acción con la que se envía), no cualquiera que pueda ver el archivo.
  if (!puede(scope.rol, "crear", RECURSO_DOCUMENTO)) {
    return jsonError(403, "Permiso denegado.")
  }
  const { id } = await ctx.params

  try {
    const documento = await prisma.documento.findUnique({
      where: { id },
      select: { id: true, comunidadId: true, glosa: true, naturaleza: true },
    })
    if (!documento || documento.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }

    const envios = await prisma.envioDocumento.findMany({
      where: { comunidadId: scope.comunidadId, documentoId: documento.id },
      orderBy: { createdAt: "desc" },
      take: MAXIMO_ENVIOS_LEIDOS,
    })
    // El total viaja aunque la lista venga topeada: una constancia truncada en
    // silencio se lee como si no hubiera más entregas.
    const total = await prisma.envioDocumento.count({
      where: { comunidadId: scope.comunidadId, documentoId: documento.id },
    })
    const personas = await prisma.persona.findMany({
      where: {
        comunidadId: scope.comunidadId,
        id: { in: [...new Set(envios.map((envio) => envio.personaId))] },
      },
      select: { id: true, nombreCompleto: true },
    })
    const nombres = new Map(personas.map((persona) => [persona.id, persona.nombreCompleto]))

    return Response.json({
      documentoId: documento.id,
      glosa: documento.glosa,
      naturaleza: documento.naturaleza,
      total,
      envios: envios.map((envio) => ({
        ...envio,
        personaNombre: nombres.get(envio.personaId) ?? null,
      })),
    })
  } catch (e) {
    logger.error({ err: e }, "[api/documentos/envio] error GET")
    return jsonError(500, "Error interno del servidor.")
  }
}
