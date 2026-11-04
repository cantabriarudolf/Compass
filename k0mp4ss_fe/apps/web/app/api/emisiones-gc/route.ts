/**
 * /api/emisiones-gc — emisiones de Gasto Común FI (BD-FUENTE-VERDAD Fase 3).
 *
 * GET paginado vía factory. POST = `emitirGastoComun` del store, ahora en
 * servidor: valida período/fondo/unidades con responsable, calcula montos
 * (modo fijo por tarifa de tipo de unidad, variable por prorrateo) y crea la
 * emisión + sus cobros en una transacción. Solo administrador (crear "fi").
 */
import { z } from "zod"
import {
  CobroFISchema,
  EmisionGCSchema,
  type LineaCobroFI,
} from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { hoyISO } from "@/lib/date-utils"
import {
  autorizaEmision,
  parametrosDeVersion,
  versionReglamentoVigenteDeComunidad,
} from "@/lib/reglamento"
import { createCrudHandlers, type CrudDelegate } from "@/lib/api/crud-factory"
import {
  jsonError,
  withComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { errorGenerico } from "@/app/api/personas/route"

// Adaptador de delegate Prisma a la factory (mismo patrón que maestros/[tipo]).
function delegado(modelo: unknown): CrudDelegate {
  return modelo as CrudDelegate
}

export const emisionesHandlers = createCrudHandlers({
  model: delegado(prisma.emisionGC),
  schema: EmisionGCSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "fi"),
})

export const GET = emisionesHandlers.GET

const EmitirGCInputSchema = z.object({
  periodo: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "El periodo debe tener formato AAAA-MM."),
  modo: z.enum(["fijo", "variable"]),
  gastoTotal: z.number().positive().optional(),
  fechaVencimiento: z.string().min(1).optional(),
  unidadIds: z.array(z.string().min(1)).optional(),
})

/** Vencimiento por defecto: los días de pago que declara la versión vigente. */
function vencimientoPorDefecto(fechaCargo: string, diasPagoGc: number): string {
  const base = new Date(`${fechaCargo}T00:00:00`)
  base.setDate(base.getDate() + diasPagoGc)
  return base.toISOString().slice(0, 10)
}

/** Reparto del monto de una unidad entre gasto común y recargo de reserva. */
interface DesgloseCobro {
  /** Lo que paga la unidad: la suma exacta de las líneas. */
  montoBase: number
  /** Recargo al fondo de reserva (0 si la versión no declara reserva). */
  reserva: number
  lineas: LineaCobroFI[]
}

/**
 * Convierte el monto que asigna la fórmula vigente (`tarifa del tipo` en fijo,
 * `gastoTotal · prorrateo` en variable, redondeado como hoy) en el desglose del
 * cobro (S5): la reserva es un cargo REAL a la unidad, no un asiento interno,
 * y su fondo de imputación vive en la propia línea.
 *
 * - `incluidaEnPresupuesto = false` (lectura normativa por defecto): el
 *   recargo va encima del gasto común — `reserva = round(m · P / 100)`.
 * - `incluidaEnPresupuesto = true` (la asamblea aprobó un presupuesto que ya lo
 *   contiene): la unidad paga exactamente lo mismo que hoy y el recargo se
 *   desagrega — `reserva = round(m · P / (100 + P))`, el resto es gasto común.
 *
 * En ambos casos las líneas suman exactamente `montoBase`. Una línea de monto
 * cero no se emite: el esquema exige líneas positivas y el total no cambia.
 */
function desgloseCobro(
  montoAsignado: number,
  porcentajeReserva: number,
  incluidaEnPresupuesto: boolean,
  fondoGcId: string,
  fondoReservaId: string | null
): DesgloseCobro {
  let gastoComun = montoAsignado
  let reserva = 0
  if (porcentajeReserva > 0) {
    reserva = incluidaEnPresupuesto
      ? Math.round(
          (montoAsignado * porcentajeReserva) / (100 + porcentajeReserva)
        )
      : Math.round((montoAsignado * porcentajeReserva) / 100)
    if (incluidaEnPresupuesto) gastoComun = montoAsignado - reserva
  }
  // El concepto de la línea es el mismo que ya existe (`gasto_comun`): el
  // esquema no tiene un miembro que nombre el aporte al fondo de reserva y no
  // se inventa uno en este corte. Lo que distingue la línea es su `fondoId`.
  const lineas: LineaCobroFI[] = []
  if (gastoComun > 0) {
    lineas.push({ concepto: "gasto_comun", monto: gastoComun, fondoId: fondoGcId })
  }
  if (reserva > 0 && fondoReservaId) {
    lineas.push({
      concepto: "gasto_comun",
      monto: reserva,
      fondoId: fondoReservaId,
    })
  }
  return { montoBase: gastoComun + reserva, reserva, lineas }
}

/** Motivos por los que la compuerta bloquea la emisión antes de escribir (S1/S2/S5). */
type MotivoBloqueoEmision =
  | "sin_version"
  | "fuente_sin_respaldo"
  | "parametros_invalidos"
  | "reserva_sin_fondo"

/** Datos que algunos motivos necesitan para nombrar lo que falta. */
interface ContextoBloqueo {
  /** Porcentaje de reserva declarado por la versión (`reserva_sin_fondo`). */
  porcentajeReserva?: number
}

/**
 * 400 que nombra el motivo y la comunidad, sin escribir nada. La compuerta
 * corre antes de crear: una comunidad sin declaración no emite.
 */
async function emisionBloqueada(
  comunidadId: string,
  periodo: string,
  motivo: MotivoBloqueoEmision,
  contexto: ContextoBloqueo = {}
): Promise<Response> {
  const comunidad = await prisma.comunidad.findUnique({
    where: { id: comunidadId },
    select: { nombre: true },
  })
  const nombre = comunidad?.nombre ?? comunidadId
  const mensajes: Record<MotivoBloqueoEmision, string> = {
    sin_version: `Emisión bloqueada: la comunidad ${nombre} no declaró una versión del reglamento vigente para el período ${periodo}.`,
    fuente_sin_respaldo: `Emisión bloqueada: la versión vigente de la comunidad ${nombre} es una migración automática; la forma de contribución debe declararse por reglamento de copropiedad o acta de asamblea.`,
    parametros_invalidos: `Emisión bloqueada: los parámetros de la versión vigente de la comunidad ${nombre} no son válidos.`,
    // `reserva_sin_fondo` siempre recibe el porcentaje: es parte del mensaje.
    reserva_sin_fondo: `Emisión bloqueada: la versión vigente de la comunidad ${nombre} declara un ${contexto.porcentajeReserva ?? 0}% de aporte al fondo de reserva y no existe un fondo de reserva activo donde imputarlo.`,
  }
  return jsonError(400, mensajes[motivo])
}

/** POST emite el Gasto Común del período y genera sus cobros. */
export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  if (!puede(scope.rol, "crear", "fi")) {
    return jsonError(403, "Permiso denegado.")
  }

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")
  const parsed = EmitirGCInputSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const { periodo, modo } = parsed.data

  try {
    // Compuerta S1: sin versión vigente que funde la forma de contribución no
    // se emite nada. Se resuelve antes de cualquier lectura de montos.
    const versionVigente = await versionReglamentoVigenteDeComunidad(
      scope.comunidadId,
      periodo
    )
    if (!versionVigente) {
      return emisionBloqueada(scope.comunidadId, periodo, "sin_version")
    }
    if (!autorizaEmision(versionVigente)) {
      return emisionBloqueada(scope.comunidadId, periodo, "fuente_sin_respaldo")
    }
    const parametros = parametrosDeVersion(versionVigente)
    if (!parametros) {
      return emisionBloqueada(scope.comunidadId, periodo, "parametros_invalidos")
    }

    const duplicada = await prisma.emisionGC.findFirst({
      where: { comunidadId: scope.comunidadId, periodo },
    })
    if (duplicada) {
      return jsonError(
        409,
        `El periodo ${periodo} ya fue procesado previamente.`
      )
    }
    const fondoGC = await prisma.fondoFI.findFirst({
      where: { comunidadId: scope.comunidadId, tipo: "gasto_comun", activo: true },
    })
    if (!fondoGC) {
      return jsonError(
        400,
        "No existe un Fondo de Gasto Común activo para imputar la emisión."
      )
    }

    const todas = await prisma.unidad.findMany({
      where: { comunidadId: scope.comunidadId },
      orderBy: [{ numero: "asc" }, { id: "asc" }],
    })
    const elegibles = todas.filter(
      (u) =>
        !u.id.startsWith("u-E-") &&
        (!parsed.data.unidadIds ||
          parsed.data.unidadIds.length === 0 ||
          parsed.data.unidadIds.includes(u.id))
    )
    if (elegibles.length === 0) {
      return jsonError(400, "No hay unidades elegibles para la emisión.")
    }
    const vinculos = await prisma.vinculoUnidad.findMany({
      where: {
        comunidadId: scope.comunidadId,
        unidadId: { in: elegibles.map((u) => u.id) },
        rol: "propietario",
        fechaFin: null,
      },
    })
    const responsablePorUnidad = new Map(
      vinculos.map((v) => [v.unidadId, v.personaId])
    )
    const sinResponsable = elegibles.filter(
      (u) => !responsablePorUnidad.has(u.id)
    )
    if (sinResponsable.length > 0) {
      return jsonError(
        400,
        `Emisión bloqueada: ${sinResponsable.length} unidad(es) sin responsable de cobro asignado.`
      )
    }
    // Compuerta S2/S5: si la versión declara aporte al fondo de reserva, ese
    // fondo tiene que existir y estar activo. Sin él el aporte se calculaba en
    // 0 y un número declarado se perdía en silencio; ahora no se emite nada.
    const fondoReserva = await prisma.fondoFI.findFirst({
      where: { comunidadId: scope.comunidadId, tipo: "reserva", activo: true },
    })
    if (parametros.porcentajeReserva > 0 && !fondoReserva) {
      return emisionBloqueada(scope.comunidadId, periodo, "reserva_sin_fondo", {
        porcentajeReserva: parametros.porcentajeReserva,
      })
    }
    if (modo === "variable" && (!parsed.data.gastoTotal || parsed.data.gastoTotal <= 0)) {
      return jsonError(
        400,
        "La modalidad prorrateo exige definir el gasto total a recaudar."
      )
    }

    const tipos = await prisma.tipoUnidad.findMany({
      where: { comunidadId: scope.comunidadId },
    })
    const tarifaPorTipo = new Map(tipos.map((t) => [t.id, t.montoBaseGc]))

    const hoy = hoyISO()
    const vencimiento =
      parsed.data.fechaVencimiento ??
      vencimientoPorDefecto(hoy, parametros.diasPagoGc)
    const emisionId = generarId("egc")
    const lineas: { unidadId: string; responsablePersonaId: string; monto: number; cobroId: string }[] = []
    const cobros: Record<string, unknown>[] = []
    // Presupuesto emitido (Σ monto asignado, sin el recargo) y aporte declarado
    // al fondo de reserva (Σ líneas de reserva).
    let presupuestoTotal = 0
    let reservaTotal = 0
    elegibles.forEach((u, idx) => {
      const montoAsignado =
        modo === "fijo"
          ? Math.round(tarifaPorTipo.get(u.tipoUnidadId) ?? 0)
          : Math.round((parsed.data.gastoTotal ?? 0) * u.prorrateo)
      const desglose = desgloseCobro(
        montoAsignado,
        parametros.porcentajeReserva,
        parametros.reservaIncluidaEnPresupuesto,
        fondoGC.id,
        fondoReserva?.id ?? null
      )
      presupuestoTotal += montoAsignado
      reservaTotal += desglose.reserva
      const cobroId = generarId("cob", idx)
      lineas.push({
        unidadId: u.id,
        // SAFETY: la unidad pasó el filtro sinResponsable; el vínculo existe.
        responsablePersonaId: responsablePorUnidad.get(u.id) as string,
        // Presupuesto de la unidad (Σ líneas = `gastoTotal`): el cargo con su
        // recargo de reserva es el `montoBase` del cobro, no esta línea.
        monto: montoAsignado,
        cobroId,
      })
      cobros.push({
        id: cobroId,
        unidadId: u.id,
        periodo,
        concepto: "gasto_comun",
        origenModulo: "FI",
        origenRef: emisionId,
        fondoId: fondoGC.id,
        descripcion: `Gasto Común ${periodo}`,
        montoBase: desglose.montoBase,
        // S5: el cobro nace con su desglose y su recargo de reserva imputado al
        // fondo de reserva. La suma de las líneas es `montoBase`.
        lineas: desglose.lineas,
        fechaCargo: hoy,
        fechaVencimiento: vencimiento,
        moras: [],
        pagos: [],
        diferencias: [],
      })
    })

    // El fondo se resolvió en la compuerta; el aporte sale del porcentaje que
    // declara la versión (S2), nunca del `porcentajeAporte` del fondo, y es
    // exactamente la suma de las líneas de reserva de los cobros.
    const emision = {
      id: emisionId,
      periodo,
      modo,
      gastoTotal:
        modo === "variable"
          ? (parsed.data.gastoTotal ?? presupuestoTotal)
          : presupuestoTotal,
      lineas,
      fondoReservaAporte:
        reservaTotal > 0 && fondoReserva
          ? { fondoId: fondoReserva.id, monto: reservaTotal }
          : undefined,
      fechaEmision: hoy,
    }
    const validaEmision = EmisionGCSchema.safeParse(emision)
    if (!validaEmision.success) {
      return jsonError(400, "Datos inválidos.", {
        detalles: validaEmision.error.flatten(),
      })
    }
    for (const cobro of cobros) {
      const valido = CobroFISchema.safeParse(cobro)
      if (!valido.success) {
        return jsonError(400, "Datos inválidos.", {
          detalles: valido.error.flatten(),
        })
      }
    }

    const [creada] = await prisma.$transaction([
      prisma.emisionGC.create({
        // SAFETY: emision pasó EmisionGCSchema.safeParse arriba.
        data: { ...validaEmision.data, comunidadId: scope.comunidadId } as never,
      }),
      ...cobros.map((c) =>
        prisma.cobroFI.create({
          // SAFETY: cada cobro pasó CobroFISchema.safeParse arriba.
          data: { ...c, comunidadId: scope.comunidadId } as never,
        })
      ),
    ])
    void creada
    const guardadas = await prisma.cobroFI.findMany({
      where: { comunidadId: scope.comunidadId, origenRef: emisionId },
    })
    const emisionGuardada = await prisma.emisionGC.findUnique({
      where: { id: emisionId },
    })
    return Response.json(
      { emision: emisionGuardada, cobros: guardadas },
      { status: 201 }
    )
  } catch (e) {
    logger.error({ err: e }, "[api/emisiones-gc] error inesperado")
    return errorGenerico(e)
  }
}
