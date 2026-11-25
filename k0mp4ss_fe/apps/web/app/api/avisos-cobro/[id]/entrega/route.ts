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
 *   el folio y el período del aviso, y el registro apunta a ella. El aviso, su
 *   fila de entrega compartida (`entregas_notificacion`) y la constancia del
 *   visor entran en UNA transacción (`avisar` + `envioAvisoCobro.create`): un
 *   fallo de la constancia no deja el aviso confirmado (S3b). No hay entrega
 *   declarada sin la fila que la prueba, ni diálogo SMTP adentro de la
 *   transacción.
 * - **Email** (emisión real): sale por la puerta única (`planDeCanal`) a través
 *   de `entregarPorCorreo`, con el cliente PLANO y fuera de toda transacción, y
 *   deja su propia fila en `entregas_notificacion`. El registro dice la verdad
 *   del intento: `enviado` SOLO si el servidor aceptó el mensaje (el motivo
 *   guarda el id que devolvió), `fallido` con el motivo redactado si se intentó
 *   y rebotó, y `pendiente` con `MOTIVO_SIN_SMTP` si la comunidad no tiene
 *   emisor configurado. Nunca `entregado`: el correo no crea notificación que lo
 *   pruebe.
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
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { hoyISO } from "@/lib/date-utils"
import { generarId } from "@/lib/id-utils"
import { puede } from "@/lib/authz"
import { avisar, entregarPorCorreo } from "@/lib/entrega/notificar"
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

    // La entrega se compone de dos piezas (S3b): el aviso in-app y su fila de
    // visor entran en la MISMA transacción que la constancia del visor, y el
    // correo sale después por `entregarPorCorreo`, con el cliente PLANO y fuera
    // de toda transacción. Si el visor de esta corrida ya estaba registrado, el
    // correo se cuelga del aviso que ya está en la bandeja.
    const visorPendiente = pendientes.find((pendiente) => pendiente.canal === "visor")
    const correoPendiente = pendientes.find((pendiente) => pendiente.canal === "email")
    let notificacionId: string | null = null

    const resumenDeCanales = () =>
      CANALES_ENTREGA_AVISO.map((canal) => resultadoPorCanal.get(canal))
        .filter((resultado): resultado is ResultadoCanalEntrega => resultado !== undefined)
        .map((r) =>
          r.motivo ? `${r.canal}: ${r.estado} (${r.motivo})` : `${r.canal}: ${r.estado}`
        )
        .join("; ")

    const descripcionDeLaEntrega = () =>
      `${reenviar ? "Reenvío explícito de la entrega del" : "Entrega del"} aviso ${aviso.folio} del período ${aviso.periodo} a ${referenciaUnidad} (${personaId}). Canales → ${resumenDeCanales()}.`

    const escribirConstancia = async (
      tx: Prisma.TransactionClient,
      pendiente: { canal: CanalEntregaAviso; claveEnvio: string },
      estado: EstadoEntregaCorreo,
      motivo: string | null,
      notificacionDelCanal: string | null
    ) => {
      const envioId = generarId("env-avi")
      await tx.envioAvisoCobro.create({
        data: {
          id: envioId,
          comunidadId: scope.comunidadId,
          avisoId: aviso.id,
          personaId,
          canal: pendiente.canal,
          estado,
          fecha,
          motivo,
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

    // 1. El aviso in-app, su fila de visor y la constancia del visor, juntos: si
    //    la constancia falla, el aviso no queda confirmado (S3b).
    if (visorPendiente) {
      await prisma.$transaction(async (tx) => {
        const avisoEscrito = await avisar(tx, {
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
        })
        // La respuesta sólo declara la notificación cuando esta corrida
        // entregó por el visor: el correo no crea notificación que lo pruebe.
        notificacionId = avisoEscrito.notificacionId
        resultadoPorCanal.set("visor", {
          canal: "visor",
          estado: avisoEscrito.entrega.estado,
          motivo: avisoEscrito.entrega.motivo ?? undefined,
          fecha,
        })
        await escribirConstancia(
          tx,
          visorPendiente,
          avisoEscrito.entrega.estado,
          avisoEscrito.entrega.motivo,
          avisoEscrito.notificacionId
        )
        // Sin correo que intentar, el evento cierra la corrida acá: el aviso y
        // su constancia no se separan.
        if (!correoPendiente) {
          await registrarEventoCobranza(
            scope,
            reenviar ? "FI_AVISO_ENTREGA_RESENT" : "FI_AVISO_ENTREGADO",
            aviso.id,
            descripcionDeLaEntrega(),
            tx
          )
        }
      })
    }

    // 2. El correo sale FUERA de toda transacción. Si esta corrida no escribió
    //    el visor, se cuelga del aviso que ya estaba en la bandeja (o de ninguno,
    //    si sólo se entrega por correo: `notificacionId: null`, S3b).
    if (correoPendiente) {
      const notificacionPrevia =
        existentes.find((existente) => existente.canal === "visor")?.notificacionId ?? null
      const entrega = await entregarPorCorreo(prisma, {
        comunidadId: scope.comunidadId,
        asunto: asuntoNotificacionAviso({
          folio: aviso.folio,
          periodo: aviso.periodo,
        }),
        cuerpo: cuerpoNotificacionAviso({
          folio: aviso.folio,
          periodo: aviso.periodo,
          referenciaUnidad,
        }),
        destinatarioPersonaId: personaId,
        notificacionId: visorPendiente ? notificacionId : notificacionPrevia,
      })
      resultadoPorCanal.set("email", {
        canal: "email",
        estado: entrega.estado,
        motivo: entrega.motivo ?? undefined,
        fecha,
      })

      // 3. La constancia del correo con su desenlace real y el evento, en una
      //    transacción corta. El correo nunca crea notificación que lo pruebe.
      await prisma.$transaction(async (tx) => {
        await escribirConstancia(
          tx,
          correoPendiente,
          entrega.estado,
          entrega.motivo,
          null
        )
        await registrarEventoCobranza(
          scope,
          reenviar ? "FI_AVISO_ENTREGA_RESENT" : "FI_AVISO_ENTREGADO",
          aviso.id,
          descripcionDeLaEntrega(),
          tx
        )
      })
    }

    // Orden del contrato: un resultado por canal, en el orden del catálogo.
    const resultados = CANALES_ENTREGA_AVISO.map((canal) => resultadoPorCanal.get(canal)).filter(
      (resultado): resultado is ResultadoCanalEntrega => resultado !== undefined
    )

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
