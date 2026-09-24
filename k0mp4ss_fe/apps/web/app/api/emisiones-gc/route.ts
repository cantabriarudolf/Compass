/**
 * /api/emisiones-gc — emisiones de Gasto Común FI (BD-FUENTE-VERDAD Fase 3).
 *
 * GET paginado vía factory. POST = `emitirGastoComun` del store, ahora en
 * servidor: valida período/fondo/unidades con responsable, calcula montos
 * (modo fijo por tarifa de tipo de unidad, variable por prorrateo) y crea la
 * emisión + sus cobros en una transacción. Solo administrador (crear "fi").
 */
import { z } from "zod"
import { CobroFISchema, EmisionGCSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { hoyISO } from "@/lib/date-utils"
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

/** Vencimiento por defecto: 30 días corridos desde el cargo. */
function vencimientoPorDefecto(fechaCargo: string): string {
  const base = new Date(`${fechaCargo}T00:00:00`)
  base.setDate(base.getDate() + 30)
  return base.toISOString().slice(0, 10)
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
    const vencimiento = parsed.data.fechaVencimiento ?? vencimientoPorDefecto(hoy)
    const emisionId = generarId("egc")
    const lineas: { unidadId: string; responsablePersonaId: string; monto: number; cobroId: string }[] = []
    const cobros: Record<string, unknown>[] = []
    elegibles.forEach((u, idx) => {
      const monto =
        modo === "fijo"
          ? Math.round(tarifaPorTipo.get(u.tipoUnidadId) ?? 0)
          : Math.round((parsed.data.gastoTotal ?? 0) * u.prorrateo)
      const cobroId = generarId("cob", idx)
      lineas.push({
        unidadId: u.id,
        // SAFETY: la unidad pasó el filtro sinResponsable; el vínculo existe.
        responsablePersonaId: responsablePorUnidad.get(u.id) as string,
        monto,
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
        montoBase: monto,
        fechaCargo: hoy,
        fechaVencimiento: vencimiento,
        moras: [],
        pagos: [],
        diferencias: [],
      })
    })

    const totalEmitido = lineas.reduce((acc, l) => acc + l.monto, 0)
    const fondoReserva = await prisma.fondoFI.findFirst({
      where: { comunidadId: scope.comunidadId, tipo: "reserva", activo: true },
    })
    const aporteMonto = fondoReserva
      ? Math.round((totalEmitido * (fondoReserva.porcentajeAporte ?? 0)) / 100)
      : 0

    const emision = {
      id: emisionId,
      periodo,
      modo,
      gastoTotal: modo === "variable" ? (parsed.data.gastoTotal ?? totalEmitido) : totalEmitido,
      lineas,
      fondoReservaAporte:
        aporteMonto > 0 && fondoReserva
          ? { fondoId: fondoReserva.id, monto: aporteMonto }
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
