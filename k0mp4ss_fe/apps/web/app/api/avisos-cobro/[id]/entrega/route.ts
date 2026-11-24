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
 *   el folio y el período del aviso, y el registro apunta a ella. El aviso y su
 *   fila de entrega compartida (`entregas_notificacion`) los escribe el PUENTE
 *   (`lib/entrega/notificar.ts`) en la MISMA llamada; el estado se escribe en la
 *   constancia del aviso dentro de una transacción corta, sin diálogo SMTP
 *   adentro: no hay entrega declarada sin la fila que la prueba.
 * - **Email** (emisión real): sale por la puerta única (`planDeCanal`) a través
 *   del puente, con el cliente PLANO, y el registro dice la verdad del intento:
 *   `enviado` SOLO si el servidor aceptó el mensaje (el motivo guarda el id que
 *   devolvió), `fallido` con el motivo redactado si se intentó y rebotó, y
 *   `pendiente` con `MOTIVO_SIN_SMTP` si la comunidad no tiene emisor
 *   configurado. Nunca `entregado`: el correo no crea notificación que lo pruebe.
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
import { notificar } from "@/lib/entrega/notificar"
import {
  CANALES_ENTREGA_AVISO,
  type CanalEntregaAviso,
  type EstadoEntregaCorreo,
} from "@/lib/schemas"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import {
  asuntoNotificacionAviso,
  cuerpoNotificacionAviso,
  claveEntregaAviso,
  propietarioVigenteDeUnidad,
  referenciaDeUnidad,
} from "@/lib/entrega-aviso"
import { registrarEventoCobranza } from "@/app/api/cobros-fi/_cobranza"
import { CANAL_NOTIFICACION_EMAIL_SIMULADO } from "@/lib/schemas"

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
  estado: EstadoEntregaCorreo | "duplicado"
  motivo?: string
  envioId?: string
  notificacionId?: string
  fecha?: string
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

    // El correo del aviso va al destinatario de registro. La dirección la
    // resuelve el puente con la definición única (`correosDePersonas`): sin
    // correo cargado la entrega del email queda `fallido` con su motivo, nunca
    // inventada como enviada.

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
      select: {
        id: true,
        canal: true,
        fecha: true,
        estado: true,
        notificacionId: true,
      },
    })

    const fecha = hoyISO()
    const reenvioEn = reenviar ? Date.now() : undefined
    const resultadoPorCanal = new Map<CanalEntregaAviso, ResultadoCanalEntrega>()
    // Canales que ESTA corrida escribe (los ya registrados quedaron `duplicado`).
    const pendientes: Array<{ canal: CanalEntregaAviso; claveEnvio: string }> = []

    for (const canal of CANALES_ENTREGA_AVISO) {
      const previo = existentes.find((e) => e.canal === canal)
      if (previo && !reenviar) {
        resultadoPorCanal.set(canal, {
          canal,
          estado: "duplicado",
          envioId: previo.id,
          fecha: previo.fecha,
          motivo: `Ya existe una entrega registrada el ${previo.fecha} (estado ${previo.estado}); pedí un reenvío explícito para volver a entregar.`,
        })
        continue
      }
      pendientes.push({
        canal,
        claveEnvio: claveEntregaAviso({
          avisoId: aviso.id,
          personaId,
          canal,
          reenvioEn,
        }),
      })
    }

    // La entrega es UNA sola llamada: el puente escribe el aviso in-app, deja
    // UNA fila por canal en `entregas_notificacion` (S3) y manda el correo por
    // `planDeCanal`. El cliente es el PLANO: el diálogo SMTP NO corre dentro de
    // ninguna transacción; la constancia del aviso se escribe después, en una
    // transacción corta.
    let notificacionId: string | null = null
    const planes = new Map<CanalEntregaAviso, { estado: EstadoEntregaCorreo; motivo: string | null }>()
    if (pendientes.length > 0) {
      const canalesAEscribir = pendientes.map((pendiente) => pendiente.canal)
      const visorEscrito = canalesAEscribir.includes("visor")
      // Si el visor de esta corrida ya estaba registrado, el intento del correo
      // se cuelga del aviso que ya está en la bandeja: no se escribe uno nuevo.
      const notificacionPrevia =
        existentes.find((existente) => existente.canal === "visor")?.notificacionId ?? null
      const { notificacionId: avisoEscrito, entregas } = await notificar(prisma, {
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
        canal: CANAL_NOTIFICACION_EMAIL_SIMULADO,
        moduloOrigen: "FI",
        fecha,
        canales: canalesAEscribir,
        notificacionId: visorEscrito ? undefined : notificacionPrevia ?? undefined,
      })
      // La respuesta sólo declara la notificación cuando esta corrida entregó
      // por el visor: el correo no crea notificación que lo pruebe.
      if (visorEscrito) notificacionId = avisoEscrito
      for (const entrega of entregas) {
        planes.set(entrega.canal, { estado: entrega.estado, motivo: entrega.motivo })
      }
    }

    for (const pendiente of pendientes) {
      const plan = planes.get(pendiente.canal)
      if (!plan) continue
      resultadoPorCanal.set(pendiente.canal, {
        canal: pendiente.canal,
        estado: plan.estado,
        motivo: plan.motivo ?? undefined,
        fecha,
      })
    }

    // Orden del contrato: un resultado por canal, en el orden del catálogo.
    const resultados = CANALES_ENTREGA_AVISO.map((canal) => resultadoPorCanal.get(canal)).filter(
      (resultado): resultado is ResultadoCanalEntrega => resultado !== undefined
    )

    if (pendientes.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const pendiente of pendientes) {
          const envioId = generarId("env-avi")
          const plan = planes.get(pendiente.canal)
          if (!plan) continue
          // El visor se materializa en la notificación del residente: es la
          // entrega, no un aviso de que hubo entrega. Ya la escribió el puente
          // con su fila compartida; acá se registra la constancia del aviso.
          const notificacionDelCanal =
            pendiente.canal === "visor" ? notificacionId : null

          await tx.envioAvisoCobro.create({
            data: {
              id: envioId,
              comunidadId: scope.comunidadId,
              avisoId: aviso.id,
              personaId,
              canal: pendiente.canal,
              estado: plan.estado,
              fecha,
              motivo: plan.motivo,
              notificacionId: notificacionDelCanal,
              claveEnvio: pendiente.claveEnvio,
              reenvio: reenviar,
            },
          })

          const resultado = resultadoPorCanal.get(pendiente.canal)
          if (resultado) {
            resultado.envioId = envioId
            if (notificacionDelCanal) resultado.notificacionId = notificacionDelCanal
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
