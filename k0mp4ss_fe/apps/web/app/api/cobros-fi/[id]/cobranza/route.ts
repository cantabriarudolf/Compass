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
 * - **Nunca se reporta un email como enviado**: la plataforma no tiene emisor
 *   SMTP implementado, así que el correo se registra como `pendiente` en
 *   `envios_cobranza_fi` y la respuesta lo dice con ese estado.
 * - **Cada envío queda registrado**: canal, fecha, destinatario, estado
 *   (`pendiente|enviado|fallido`) y motivo.
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
import { estadoDeCobro, saldoPendiente } from "@/lib/finanzas-utils"
import { CANALES_COBRANZA_FI, type CanalCobranzaFI } from "@/lib/schemas"
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

type Ctx = { params: Promise<{ id: string }> }

/** Entrada: el único parámetro es el reenvío explícito de una gestión previa. */
const EntradaCobranzaSchema = z.object({
  reenviar: z.boolean().optional(),
})

/** Estado de UN canal en la respuesta: enviado, en cola, omitido o ya existente. */
export type ResultadoCanalCobranza = {
  canal: CanalCobranzaFI
  estado: "enviado" | "pendiente" | "omitido" | "duplicado"
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
      },
      orderBy: [{ periodo: "desc" }, { id: "desc" }],
    })
    const hoy = hoyISO()
    const vencidos = (cobrosUnidad as CobroParaSaldo[]).filter(
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

    const [global, preferencia, unidad] = await Promise.all([
      leerInterruptorGlobal(scope.comunidadId),
      leerPreferenciaCanal(scope.comunidadId, personaId),
      prisma.unidad.findUnique({
        where: { id: ancla.unidadId },
        select: { etiqueta: true, numero: true },
      }),
    ])
    const refUnidad = unidad ? `${unidad.etiqueta} ${unidad.numero}` : ancla.unidadId

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
    const fecha = hoy
    const reenvioEn = reenviar ? Date.now() : undefined

    const resultados: ResultadoCanalCobranza[] = []
    const aEscribir: Array<{
      canal: CanalCobranzaFI
      estado: "pendiente" | "enviado" | "fallido"
      claveEnvio: string
      motivo?: string
      envioId: string
    }> = []

    for (const canal of CANALES_COBRANZA_FI) {
      const resolucion = canales[canal]
      if (!resolucion.activo) {
        resultados.push({ canal, estado: "omitido", motivo: resolucion.motivo })
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
        resultados.push({
          canal,
          estado: "duplicado",
          envioId: existente.id,
          fecha: existente.fecha,
          motivo: `Ya existe un envío registrado el ${existente.fecha} (estado ${existente.estado}); pedí un reenvío explícito para volver a enviarlo.`,
        })
        continue
      }

      // Visor interno: el envío se materializa en la notificación de la app
      // (estado `enviado`). Email: queda en la cola de salida (`pendiente`),
      // porque la plataforma no tiene emisor SMTP implementado.
      const esEmail = canal === "email"
      const envioId = generarId("env-cob")
      aEscribir.push({
        canal,
        estado: esEmail ? "pendiente" : "enviado",
        claveEnvio: claveEnvioCobranza({
          unidadId: ancla.unidadId,
          personaId,
          canal,
          reenvioEn,
        }),
        motivo: esEmail
          ? "Sin emisor SMTP configurado: el correo queda en la cola de salida (outbox) y no se reporta como enviado."
          : undefined,
        envioId,
      })
      resultados.push({
        canal,
        estado: esEmail ? "pendiente" : "enviado",
        envioId,
        fecha,
      })
    }

    const envioVisor = resultados.find((r) => r.canal === "visor")
    let notificacionId: string | null = null

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

        // El canal visor es la notificación interna real: una por gestión.
        if (envioVisor && envioVisor.estado === "enviado") {
          notificacionId = generarId("not")
          await tx.notificacion.create({
            data: {
              id: notificacionId,
              comunidadId: scope.comunidadId,
              destinatarioRol: "propietario",
              destinatarioPersonaId: personaId,
              asunto: `Recordatorio de deuda vencida (${refUnidad})`,
              cuerpo: `Su unidad registra ${clp(montoTotal)} en ${vencidos.length} cobro(s) vencido(s): ${detalle}. Regularice su situación para evitar corte de servicios.`,
              canal: "email_simulado",
              moduloOrigen: "FI",
              fecha,
              leida: false,
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
    }

    const creados = resultados.filter(
      (r) => r.estado === "enviado" || r.estado === "pendiente"
    )
    const idempotente = creados.length === 0
    const mensaje = idempotente
      ? "La gestión ya estaba registrada: no se creó ningún envío nuevo."
      : `Gestión de cobranza procesada para ${refUnidad}: ${creados
          .map((r) => `${r.canal} ${r.estado}`)
          .join(", ")}.`

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
