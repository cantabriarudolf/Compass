/**
 * /api/cobros-fi/[id]/cobranza — gestión de cobranza multicanal de una unidad
 * (SERIE-FASE2 §V5).
 *
 * POST (`fi:cobranza` ejecutar = SOLO administrador): paridad server-side con
 * `enviarCobranzaFI(unidadId)` del store legacy, con las decisiones del plan:
 *
 * - **Dos canales, dos interruptores**: el envío sale por el **visor interno**
 *   (crea la notificación de la app) y/o por **email** (cola de salida) solo si
 *   el interruptor GLOBAL de la comunidad y la preferencia del RESIDENTE están
 *   encendidos. Un canal apagado no se usa y queda registrado el motivo.
 * - **Nunca se reporta un email como enviado**: el correo sale por la puerta
 *   única del sistema (`planDeCanal` de `lib/entrega-aviso.ts`, que habla con
 *   `lib/smtp.ts`) a través del PUENTE de entrega
 *   (`lib/entrega/notificar.ts`, S1/S3). El registro dice `enviado` solo cuando
 *   el servidor aceptó el mensaje; `fallido` con el motivo cuando rebotó (auth
 *   rechazada, conexión rechazada, timeout); y `pendiente` con `MOTIVO_SIN_SMTP`
 *   cuando no hay emisor configurado (falta la CF o `SMTP_PASSWORD`), que es una
 *   condición de configuración y no un envío fallido.
 * - **Cada envío queda registrado dos veces, a propósito**: en la constancia
 *   propia de la cobranza (`envios_cobranza_fi`: canal, fecha, destinatario,
 *   estado y motivo) y en la entrega compartida (`entregas_notificacion`), que
 *   cuelga del aviso in-app y es la que hace comparable el desenlace entre los
 *   once módulos. Con el visor encendido, las dos las escribe la misma llamada
 *   al puente; el diálogo SMTP corre con el cliente PLANO, nunca dentro de una
 *   transacción.
 * - **Idempotencia**: reenviar la misma gestión (misma unidad, mismo
 *   destinatario, mismo canal) no duplica el envío; el body acepta
 *   `{ reenviar: true }` para un reenvío explícito, que se guarda como una fila
 *   nueva marcada `reenvio: true`.
 *
 * El `[id]` de la ruta es el cobro que ANCLA la gestión; la deuda que se cobra
 * es la de su unidad, porque la acción legacy enviaba por unidad ("la unidad no
 * registra deuda vencida"). Así el historial puede leerse por cobro y por unidad.
 *
 * GET (`fi:cobranza` ver = administrador y comité): historial de envíos de la
 * unidad del cobro, más reciente primero.
 */
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { hoyISO } from "@/lib/date-utils"
import { generarId } from "@/lib/id-utils"
import { estadoDeCobro, estaAnulado, saldoPendiente } from "@/lib/finanzas-utils"
import { notificar } from "@/lib/entrega/notificar"
import { planDeCanal, type PlanEntregaCanal } from "@/lib/entrega-aviso"
import {
  CANALES_COBRANZA_FI,
  type CanalCobranzaFI,
  type EstadoCanalCobranzaFI,
  type EstadoEnvioCobranzaFI,
} from "@/lib/schemas"
import { jsonError } from "@/lib/api/with-comunidad-scope"
import {
  clp,
  claveEnvioCobranza,
  contextoCobranza,
  leerInterruptorGlobal,
  leerPreferenciaCanal,
  registrarEventoCobranza,
  resolverCanalesCobranza,
} from "../../_cobranza"
import { CANAL_NOTIFICACION_EMAIL_SIMULADO } from "@/lib/schemas"

type Ctx = { params: Promise<{ id: string }> }

/** Entrada: el único parámetro es el reenvío explícito de una gestión previa. */
const EntradaCobranzaSchema = z.object({
  reenviar: z.boolean().optional(),
})

/** Estado de UN canal en la respuesta: enviado, en cola, fallido, omitido o ya existente. */
export type ResultadoCanalCobranza = {
  canal: CanalCobranzaFI
  estado: EstadoCanalCobranzaFI
  motivo?: string
  envioId?: string
  fecha?: string
}

/** Cobro mínimo para calcular el saldo exigible de la gestión. */
type CobroParaSaldo = {
  id: string
  descripcion: string
  montoBase: number
  moras: unknown
  pagos: unknown
  fechaVencimiento: string | null
  /** La marca de la anulación del convenio, si la fila la trae (F29). */
  anuladoEn?: Date | string | null
}

/**
 * El estado con el que la cobranza registra UN canal escrito.
 *
 * El puente entrega `entregado` para el visor (su hecho es la notificación
 * escrita en la misma llamada); la constancia de la cobranza no tiene ese
 * estado: el visor se registra `enviado` desde siempre (su prueba es la
 * `Notificacion`, no el correo). Los estados del correo viajan tal cual.
 */
function estadoCobranzaDeLaEntrega(estado: PlanEntregaCanal["estado"]): EstadoEnvioCobranzaFI {
  return estado === "entregado" ? "enviado" : estado
}

/**
 * El desenlace de los canales que se van a escribir y la constancia compartida.
 *
 * Con el visor entre los canales, la entrega pasa por el puente (`notificar`):
 * escribe el aviso in-app, deja UNA fila de `entregas_notificacion` por canal
 * (S1/S3) y habla con el transporte por `planDeCanal`. El cliente es el PLANO
 * (`prisma`), así que el diálogo SMTP NO corre dentro de ninguna transacción: la
 * constancia propia de la cobranza se escribe después, en una transacción corta.
 *
 * Con el interruptor del visor apagado no hay aviso in-app que escribir —crearlo
 * le mostraría al residente un canal que apagó—, así que el correo sale igual
 * por la puerta única (`planDeCanal`) y su constancia es la fila propia de
 * `envios_cobranza_fi`.
 */
async function resolverEntregaDeLaGestion(input: {
  comunidadId: string
  personaId: string
  emailDestino: string
  asunto: string
  cuerpo: string
  fecha: string
  canales: readonly CanalCobranzaFI[]
}): Promise<{
  notificacionId: string | null
  planes: Map<CanalCobranzaFI, PlanEntregaCanal>
}> {
  if (input.canales.length === 0) {
    return { notificacionId: null, planes: new Map() }
  }

  if (input.canales.includes("visor")) {
    const { notificacionId, entregas } = await notificar(prisma, {
      comunidadId: input.comunidadId,
      destinatarioRol: "propietario",
      destinatarioPersonaId: input.personaId,
      asunto: input.asunto,
      cuerpo: input.cuerpo,
      canal: CANAL_NOTIFICACION_EMAIL_SIMULADO,
      moduloOrigen: "FI",
      fecha: input.fecha,
      canales: input.canales,
    })
    return {
      notificacionId,
      planes: new Map(entregas.map((entrega) => [entrega.canal, entrega])),
    }
  }

  const planes = new Map<CanalCobranzaFI, PlanEntregaCanal>()
  for (const canal of input.canales) {
    planes.set(
      canal,
      await planDeCanal(canal, {
        email: {
          comunidadId: input.comunidadId,
          destinatario: input.emailDestino,
          asunto: input.asunto,
          cuerpo: input.cuerpo,
        },
      })
    )
  }
  return { notificacionId: null, planes }
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const contexto = await contextoCobranza("ejecutar")
  if (!contexto.ok) return contexto.response
  const { scope } = contexto
  const { id } = await ctx.params

  const crudo = await req.json().catch(() => null)
  const parsed = EntradaCobranzaSchema.safeParse(crudo ?? {})
  if (!parsed.success) {
    return jsonError(400, "Datos de la cobranza inválidos.")
  }
  const reenviar = parsed.data.reenviar === true

  try {
    const ancla = await prisma.cobroFI.findUnique({ where: { id }, select: { id: true, unidadId: true, comunidadId: true } })
    if (!ancla || ancla.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }

    // Deuda vencida de la unidad (la gestión es por unidad, como el legacy).
    const cobrosUnidad = await prisma.cobroFI.findMany({
      where: { comunidadId: scope.comunidadId, unidadId: ancla.unidadId },
      select: {
        id: true,
        descripcion: true,
        montoBase: true,
        moras: true,
        pagos: true,
        fechaVencimiento: true,
        // F29: la marca de la anulación del convenio, para que el mensaje no
        // le diga «debes» por un cargo que ya no es deuda.
        anuladoEn: true,
      },
      orderBy: [{ periodo: "desc" }, { id: "desc" }],
    })
    const hoy = hoyISO()
    // F29: el cargo anulado se EXCLUYE del cálculo de la gestión, no se oculta
    // del libro —la fila sigue en la base con su anulación y el historial lo
    // conserva—. Sin la marca (una fila que no la trae), el filtro es un no-op
    // y el cobro cuenta igual que siempre.
    const vencidos = (cobrosUnidad as CobroParaSaldo[])
      .filter((c) => !estaAnulado(c))
      .filter(
        (c) =>
          estadoDeCobro(
            {
              montoBase: c.montoBase,
              moras: c.moras as never,
              pagos: c.pagos as never,
              fechaVencimiento: c.fechaVencimiento ?? undefined,
            },
            hoy
          ) === "vencido"
      )
    if (vencidos.length === 0) {
      return jsonError(
        400,
        "La unidad no registra deuda vencida: no hay nada que cobrar."
      )
    }
    const montoTotal = vencidos.reduce(
      (acc, c) =>
        acc +
        saldoPendiente({
          montoBase: c.montoBase,
          moras: c.moras as never,
          pagos: c.pagos as never,
        }),
      0
    )

    // Destinatario: propietario vigente de la unidad (mismo criterio del legacy).
    const vinculo = await prisma.vinculoUnidad.findFirst({
      where: {
        comunidadId: scope.comunidadId,
        unidadId: ancla.unidadId,
        rol: "propietario",
        fechaFin: null,
      },
      orderBy: { fechaInicio: "desc" },
      select: { personaId: true },
    })
    if (!vinculo) {
      return jsonError(400, "La unidad no tiene responsable de cobro asignado.")
    }
    const personaId = vinculo.personaId

    const [global, preferencia, unidad, persona] = await Promise.all([
      leerInterruptorGlobal(scope.comunidadId),
      leerPreferenciaCanal(scope.comunidadId, personaId),
      prisma.unidad.findUnique({
        where: { id: ancla.unidadId },
        select: { etiqueta: true, numero: true },
      }),
      prisma.persona.findUnique({
        where: { id: personaId },
        select: { email: true },
      }),
    ])
    const refUnidad = unidad ? `${unidad.etiqueta} ${unidad.numero}` : ancla.unidadId
    const emailDestino = persona?.email?.trim() ?? ""

    // Resolución de canales: global ∧ preferencia, con motivo por canal.
    const canales = resolverCanalesCobranza(global, preferencia)

    const detalle = vencidos
      .map(
        (c) =>
          `${c.descripcion} (${clp(
            saldoPendiente({
              montoBase: c.montoBase,
              moras: c.moras as never,
              pagos: c.pagos as never,
            })
          )})`
      )
      .join("; ")
    // Un solo texto para los dos canales: el correo dice lo mismo que el aviso
    // del visor (no hay dos redacciones que se desincronicen).
    const asuntoEnvio = `Recordatorio de deuda vencida (${refUnidad})`
    const cuerpoEnvio = `Su unidad registra ${clp(montoTotal)} en ${vencidos.length} cobro(s) vencido(s): ${detalle}. Regularice su situación para evitar corte de servicios.`
    const fecha = hoy
    const reenvioEn = reenviar ? Date.now() : undefined

    // Canales activos que hay que escribir: sus ids y claves se reservan acá y
    // su desenlace lo decide la entrega (puente o `planDeCanal`).
    const pendientes: Array<{
      canal: CanalCobranzaFI
      envioId: string
      claveEnvio: string
    }> = []
    const resultadoPorCanal = new Map<CanalCobranzaFI, ResultadoCanalCobranza>()

    for (const canal of CANALES_COBRANZA_FI) {
      const resolucion = canales[canal]
      if (!resolucion.activo) {
        resultadoPorCanal.set(canal, {
          canal,
          estado: "omitido",
          motivo: resolucion.motivo,
        })
        continue
      }

      const claveBase = claveEnvioCobranza({
        unidadId: ancla.unidadId,
        personaId,
        canal,
      })
      const existente = await prisma.envioCobranzaFI.findUnique({
        where: {
          comunidadId_claveEnvio: {
            comunidadId: scope.comunidadId,
            claveEnvio: claveBase,
          },
        },
        select: { id: true, fecha: true, estado: true },
      })
      if (existente && !reenviar) {
        resultadoPorCanal.set(canal, {
          canal,
          estado: "duplicado",
          envioId: existente.id,
          fecha: existente.fecha,
          motivo: `Ya existe un envío registrado el ${existente.fecha} (estado ${existente.estado}); pedí un reenvío explícito para volver a enviarlo.`,
        })
        continue
      }

      pendientes.push({
        canal,
        envioId: generarId("env-cob"),
        claveEnvio: claveEnvioCobranza({
          unidadId: ancla.unidadId,
          personaId,
          canal,
          reenvioEn,
        }),
      })
    }

    // La entrega es UNA sola llamada: el aviso in-app, las filas compartidas y
    // el correo (por `planDeCanal`, con el cliente plano: ninguna transacción
    // queda abierta durante el diálogo SMTP).
    const { notificacionId, planes } = await resolverEntregaDeLaGestion({
      comunidadId: scope.comunidadId,
      personaId,
      emailDestino,
      asunto: asuntoEnvio,
      cuerpo: cuerpoEnvio,
      fecha,
      canales: pendientes.map((pendiente) => pendiente.canal),
    })

    const aEscribir: Array<{
      canal: CanalCobranzaFI
      estado: EstadoEnvioCobranzaFI
      claveEnvio: string
      motivo?: string
      envioId: string
    }> = []

    for (const pendiente of pendientes) {
      const plan = planes.get(pendiente.canal)
      if (!plan) continue
      const estado = estadoCobranzaDeLaEntrega(plan.estado)
      const motivo = plan.motivo ?? undefined
      resultadoPorCanal.set(pendiente.canal, {
        canal: pendiente.canal,
        estado,
        motivo,
        envioId: pendiente.envioId,
        fecha,
      })
      aEscribir.push({
        canal: pendiente.canal,
        estado,
        claveEnvio: pendiente.claveEnvio,
        motivo,
        envioId: pendiente.envioId,
      })
    }

    // Orden del contrato: un resultado por canal, en el orden del catálogo.
    const resultados = CANALES_COBRANZA_FI.map((canal) => resultadoPorCanal.get(canal)).filter(
      (resultado): resultado is ResultadoCanalCobranza => resultado !== undefined
    )

    if (aEscribir.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const envio of aEscribir) {
          await tx.envioCobranzaFI.create({
            data: {
              id: envio.envioId,
              comunidadId: scope.comunidadId,
              cobroId: ancla.id,
              unidadId: ancla.unidadId,
              personaId,
              canal: envio.canal,
              estado: envio.estado,
              fecha,
              motivo: envio.motivo ?? null,
              montoTotal,
              cobrosIncluidos: vencidos.map((c) => c.id) as never,
              claveEnvio: envio.claveEnvio,
              reenvio: reenviar,
            },
          })
        }

        // El evento deja escrito el porqué de cada canal omitido (interruptor).
        const resumenCanales = resultados
          .map((r) =>
            r.motivo ? `${r.canal}: ${r.estado} (${r.motivo})` : `${r.canal}: ${r.estado}`
          )
          .join("; ")
        await registrarEventoCobranza(
          scope,
          reenviar ? "FI_COBRANZA_RESENT" : "FI_COBRANZA_SENT",
          ancla.id,
          `${reenviar ? "Reenvío explícito de" : "Gestión de"} cobranza a ${refUnidad}: ${clp(montoTotal)} en ${vencidos.length} cobro(s) vencido(s). Canales → ${resumenCanales}.`,
          tx
        )
      })
    } else {
      // Ningún envío escrito: si algún canal quedó fuera por interruptor, el
      // intento igual queda auditado con el motivo (no se envía nada en silencio).
      const canalesFuera = resultados.filter((r) => r.estado === "omitido")
      if (canalesFuera.length > 0) {
        await registrarEventoCobranza(
          scope,
          "FI_COBRANZA_SKIPPED",
          ancla.id,
          `Gestión de cobranza a ${refUnidad} no se envió: ${canalesFuera
            .map((r) => `${r.canal}: ${r.motivo}`)
            .join("; ")}.`
        )
      }
    }

    const creados = resultados.filter(
      (r) => r.estado === "enviado" || r.estado === "pendiente" || r.estado === "fallido"
    )
    const omitidos = resultados.filter((r) => r.estado === "omitido")
    // `idempotente` describe lo único que importa para no duplicar: la gestión
    // ya estaba registrada y no se creó ningún envío nuevo.
    const todosDuplicados =
      resultados.length > 0 && resultados.every((r) => r.estado === "duplicado")
    const idempotente = todosDuplicados
    let mensaje: string
    if (todosDuplicados) {
      mensaje = "La gestión ya estaba registrada: no se creó ningún envío nuevo."
    } else if (creados.length > 0) {
      mensaje = `Gestión de cobranza procesada para ${refUnidad}: ${creados
        .map((r) => `${r.canal} ${r.estado}`)
        .join(", ")}.`
    } else {
      mensaje = `No se envió nada a ${refUnidad}: ${omitidos
        .map((r) => `${r.canal} ${r.motivo ?? "sin motivo"}`)
        .join("; ")}.`
    }

    return Response.json({
      ok: true,
      cobroId: ancla.id,
      unidadId: ancla.unidadId,
      unidadRef: refUnidad,
      destinatarioPersonaId: personaId,
      montoTotal,
      cobrosVencidos: vencidos.map((c) => c.id),
      notificacionId,
      reenvio: reenviar,
      idempotente,
      canales: {
        visor: resultados.find((r) => r.canal === "visor"),
        email: resultados.find((r) => r.canal === "email"),
      },
      resultados,
      mensaje,
    })
  } catch (e) {
    logger.error({ err: e }, "[api/cobros-fi/cobranza] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}

/** GET: historial de envíos de la unidad del cobro (más reciente primero). */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const contexto = await contextoCobranza("ver")
  if (!contexto.ok) return contexto.response
  const { scope } = contexto
  const { id } = await ctx.params

  try {
    const ancla = await prisma.cobroFI.findUnique({
      where: { id },
      select: { id: true, unidadId: true, comunidadId: true },
    })
    if (!ancla || ancla.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }

    const [envios, global] = await Promise.all([
      prisma.envioCobranzaFI.findMany({
        where: { comunidadId: scope.comunidadId, unidadId: ancla.unidadId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      leerInterruptorGlobal(scope.comunidadId),
    ])

    return Response.json({
      cobroId: ancla.id,
      unidadId: ancla.unidadId,
      global,
      envios,
    })
  } catch (e) {
    logger.error({ err: e }, "[api/cobros-fi/cobranza] error GET")
    return jsonError(500, "Error interno del servidor.")
  }
}
