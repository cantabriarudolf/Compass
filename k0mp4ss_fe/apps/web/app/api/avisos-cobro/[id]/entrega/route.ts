/**
 * /api/avisos-cobro/[id]/entrega — entrega del aviso y registro con prueba (S3).
 *
 * POST (`fi:gasto_comun` crear = administración, igual que la emisión): entrega
 * el aviso a quien corresponde y registra el hecho.
 *
 * - **Destinatario**: el propietario VIGENTE de la unidad del aviso. Si la
 *   unidad no tiene uno, la entrega se RECHAZA nombrando la unidad y no se
 *   escribe nada: un aviso entregado al vacío arrancaría un plazo de pago que
 *   nadie recibió.
 * - **Visor** (`entregado`): se crea la `Notificacion` que el residente ve, con
 *   el folio y el período del aviso, y el registro apunta a ella. El estado se
 *   escribe en la MISMA transacción que la notificación: no hay entrega
 *   declarada sin la fila que la prueba.
 * - **Email** (emisión real): sale por el emisor SMTP (`lib/smtp.ts`, F4) y el
 *   registro dice la verdad del intento: `enviado` SOLO si el servidor aceptó
 *   el mensaje (el motivo guarda el id que devolvió), `fallido` con el motivo
 *   redactado si se intentó y rebotó, y `pendiente` con su motivo si la
 *   comunidad no tiene emisor configurado. Nunca `entregado`: el correo no crea
 *   notificación que lo pruebe.
 * - **Idempotencia**: reentregar el mismo aviso a la misma persona por el mismo
 *   canal devuelve `duplicado` y no escribe nada; el body acepta
 *   `{ reenviar: true }` para un reenvío explícito, que agrega una fila nueva
 *   marcada `reenvio: true` y deja su evento de auditoría.
 *
 * GET (`fi:gasto_comun` ver = administración y comité): historial de entregas
 * del aviso, más reciente primero. Es la prueba que el comité audita.
 *
 * Por qué es una ACCIÓN EXPLÍCITA y no un efecto de la emisión: emitir congela
 * el documento una sola vez (T4/S7) y entregar es un hecho posterior y
 * repetible (reenvío) que puede fallar por datos —una unidad sin dueño— sin
 * impedir que el papel se emita. Atarlas obligaría a decidir si una emisión
 * falla porque hoy no hay a quién entregar; separadas, la emisión nunca miente
 * y la entrega nunca se declara sola.
 */
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { hoyISO } from "@/lib/date-utils"
import { generarId } from "@/lib/id-utils"
import { puede } from "@/lib/authz"
import {
  CANALES_ENTREGA_AVISO,
  type CanalEntregaAviso,
  type EstadoEntregaAviso,
} from "@/lib/schemas"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import {
  asuntoNotificacionAviso,
  cuerpoNotificacionAviso,
  claveEntregaAviso,
  planDeCanal,
  propietarioVigenteDeUnidad,
  referenciaDeUnidad,
} from "@/lib/entrega-aviso"
import { registrarEventoCobranza } from "@/app/api/cobros-fi/_cobranza"

type Ctx = { params: Promise<{ id: string }> }

/** El aviso es parte del gasto común: emitirlo y entregarlo es del administrador. */
const RECURSO_AVISO = "fi:gasto_comun"

/** Entrada: el único parámetro es el reenvío explícito de una entrega previa. */
const EntradaEntregaSchema = z.object({
  reenviar: z.boolean().optional(),
})

/**
 * Estado de UN canal en la respuesta: entregado (visor), enviado (correo
 * aceptado por el servidor), en cola, fallido o ya existente.
 */
export type ResultadoCanalEntrega = {
  canal: CanalEntregaAviso
  estado: EstadoEntregaAviso | "duplicado"
  motivo?: string
  envioId?: string
  notificacionId?: string
  fecha?: string
}

/** Fila que se va a escribir y el resultado de la respuesta que completa sus ids. */
interface EntregaPendiente {
  resultado: ResultadoCanalEntrega
  estado: EstadoEntregaAviso
  motivo: string | null
  claveEnvio: string
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const scopeResult = await withComunidadScope()
  if (!scopeResult.ok) return scopeResult.response
  const scope = scopeResult.scope
  if (!puede(scope.rol, "crear", RECURSO_AVISO)) {
    return jsonError(403, "Permiso denegado.")
  }
  const { id } = await ctx.params

  const crudo = await req.json().catch(() => null)
  const parsed = EntradaEntregaSchema.safeParse(crudo ?? {})
  if (!parsed.success) {
    return jsonError(400, "Datos de la entrega inválidos.")
  }
  const reenviar = parsed.data.reenviar === true

  try {
    const aviso = await prisma.avisoCobro.findUnique({
      where: { id },
      select: {
        id: true,
        comunidadId: true,
        unidadId: true,
        periodo: true,
        folio: true,
      },
    })
    if (!aviso || aviso.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }

    const [personaId, unidad] = await Promise.all([
      propietarioVigenteDeUnidad(scope.comunidadId, aviso.unidadId),
      prisma.unidad.findUnique({
        where: { id: aviso.unidadId },
        select: { etiqueta: true, numero: true },
      }),
    ])
    const referenciaUnidad = referenciaDeUnidad(unidad, aviso.unidadId)
    if (!personaId) {
      return jsonError(
        400,
        `La unidad ${referenciaUnidad} no tiene propietario vigente: el aviso ${aviso.folio} del período ${aviso.periodo} no se puede entregar sin destinatario y no se registra una entrega en el vacío.`
      )
    }

    // El correo del aviso va al destinatario de registro; sin correo cargado el
    // canal email no se puede inventar como enviado (`planDeCanal` lo declara
    // fallido). Se lee sólo cuando ya hay a quién entregar.
    const persona = await prisma.persona.findUnique({
      where: { id: personaId },
      select: { email: true },
    })

    // Una entrega previa por canal: la clave base es la que decide si esto es
    // una reentrega (no escribe) o un reenvío explícito (escribe una fila más).
    const clavesBase = new Map<CanalEntregaAviso, string>(
      CANALES_ENTREGA_AVISO.map((canal) => [
        canal,
        claveEntregaAviso({ avisoId: aviso.id, personaId, canal }),
      ])
    )
    const existentes = await prisma.envioAvisoCobro.findMany({
      where: {
        comunidadId: scope.comunidadId,
        claveEnvio: { in: [...clavesBase.values()] },
      },
      select: { id: true, canal: true, fecha: true, estado: true },
    })

    const fecha = hoyISO()
    const reenvioEn = reenviar ? Date.now() : undefined
    const resultados: ResultadoCanalEntrega[] = []
    const aEscribir: EntregaPendiente[] = []

    for (const canal of CANALES_ENTREGA_AVISO) {
      const previo = existentes.find((e) => e.canal === canal)
      if (previo && !reenviar) {
        resultados.push({
          canal,
          estado: "duplicado",
          envioId: previo.id,
          fecha: previo.fecha,
          motivo: `Ya existe una entrega registrada el ${previo.fecha} (estado ${previo.estado}); pedí un reenvío explícito para volver a entregar.`,
        })
        continue
      }
      // El contexto del correo es el mismo texto del aviso: no hay una segunda
      // redacción que se desincronice del visor ni del papel.
      const plan = await planDeCanal(canal, {
        email: {
          comunidadId: scope.comunidadId,
          destinatario: persona?.email ?? null,
          asunto: asuntoNotificacionAviso({
            folio: aviso.folio,
            periodo: aviso.periodo,
          }),
          cuerpo: cuerpoNotificacionAviso({
            folio: aviso.folio,
            periodo: aviso.periodo,
            referenciaUnidad,
          }),
        },
      })
      const resultado: ResultadoCanalEntrega = {
        canal,
        estado: plan.estado,
        motivo: plan.motivo ?? undefined,
        fecha,
      }
      resultados.push(resultado)
      aEscribir.push({
        resultado,
        estado: plan.estado,
        motivo: plan.motivo,
        claveEnvio: claveEntregaAviso({
          avisoId: aviso.id,
          personaId,
          canal,
          reenvioEn,
        }),
      })
    }

    let notificacionId: string | null = null

    if (aEscribir.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const entrega of aEscribir) {
          const envioId = generarId("env-avi")
          let notificacionDelCanal: string | null = null
          // El visor se materializa en la notificación del residente: es la
          // entrega, no un aviso de que hubo entrega.
          if (entrega.resultado.canal === "visor") {
            notificacionDelCanal = generarId("not")
            await tx.notificacion.create({
              data: {
                id: notificacionDelCanal,
                comunidadId: scope.comunidadId,
                destinatarioRol: "propietario",
                destinatarioPersonaId: personaId,
                unidadId: aviso.unidadId,
                asunto: asuntoNotificacionAviso({
                  folio: aviso.folio,
                  periodo: aviso.periodo,
                }),
                cuerpo: cuerpoNotificacionAviso({
                  folio: aviso.folio,
                  periodo: aviso.periodo,
                  referenciaUnidad,
                }),
                canal: "email_simulado",
                moduloOrigen: "FI",
                fecha,
                leida: false,
              },
            })
            notificacionId = notificacionDelCanal
          }

          await tx.envioAvisoCobro.create({
            data: {
              id: envioId,
              comunidadId: scope.comunidadId,
              avisoId: aviso.id,
              personaId,
              canal: entrega.resultado.canal,
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

        const resumenCanales = resultados
          .map((r) =>
            r.motivo ? `${r.canal}: ${r.estado} (${r.motivo})` : `${r.canal}: ${r.estado}`
          )
          .join("; ")
        await registrarEventoCobranza(
          scope,
          reenviar ? "FI_AVISO_ENTREGA_RESENT" : "FI_AVISO_ENTREGADO",
          aviso.id,
          `${reenviar ? "Reenvío explícito de la entrega del" : "Entrega del"} aviso ${aviso.folio} del período ${aviso.periodo} a ${referenciaUnidad} (${personaId}). Canales → ${resumenCanales}.`,
          tx
        )
      })
    }

    // `idempotente` describe lo único que importa para no duplicar: la entrega
    // ya estaba registrada y no se creó ninguna fila nueva.
    const todosDuplicados =
      resultados.length > 0 && resultados.every((r) => r.estado === "duplicado")
    const nuevos = resultados.filter((r) => r.estado !== "duplicado")
    const mensaje = todosDuplicados
      ? `La entrega del aviso ${aviso.folio} ya estaba registrada: no se creó ningún registro nuevo.`
      : `Aviso ${aviso.folio} del período ${aviso.periodo} entregado a ${referenciaUnidad}: ${nuevos
          .map((r) => `${r.canal} ${r.estado}`)
          .join(", ")}.`

    return Response.json({
      ok: true,
      avisoId: aviso.id,
      folio: aviso.folio,
      periodo: aviso.periodo,
      unidadId: aviso.unidadId,
      unidadRef: referenciaUnidad,
      destinatarioPersonaId: personaId,
      notificacionId,
      reenvio: reenviar,
      idempotente: todosDuplicados,
      canales: {
        visor: resultados.find((r) => r.canal === "visor"),
        email: resultados.find((r) => r.canal === "email"),
      },
      resultados,
      mensaje,
    })
  } catch (e) {
    logger.error({ err: e }, "[api/avisos-cobro/entrega] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}

/** GET: historial de entregas del aviso (más reciente primero). */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const scopeResult = await withComunidadScope()
  if (!scopeResult.ok) return scopeResult.response
  const scope = scopeResult.scope
  if (!puede(scope.rol, "ver", RECURSO_AVISO)) {
    return jsonError(403, "Permiso denegado.")
  }
  const { id } = await ctx.params

  try {
    const aviso = await prisma.avisoCobro.findUnique({
      where: { id },
      select: {
        id: true,
        comunidadId: true,
        unidadId: true,
        periodo: true,
        folio: true,
      },
    })
    if (!aviso || aviso.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }

    const envios = await prisma.envioAvisoCobro.findMany({
      where: { comunidadId: scope.comunidadId, avisoId: aviso.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    })

    return Response.json({
      avisoId: aviso.id,
      folio: aviso.folio,
      periodo: aviso.periodo,
      unidadId: aviso.unidadId,
      envios,
    })
  } catch (e) {
    logger.error({ err: e }, "[api/avisos-cobro/entrega] error GET")
    return jsonError(500, "Error interno del servidor.")
  }
}
