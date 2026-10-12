/**
 * /api/in/infracciones/[id]/aplicar — aplica la multa y materializa el cobro FI.
 *
 * POST custom (solo administración): paridad server-side con
 * `aplicarInfraccionIN` legacy. Resuelve el monto desde el cobro directo por
 * daños o el catálogo de tipos; las multas Grave/Gravísima exigen respaldo de
 * directiva y las sanciones % GC se calculan sobre el último cobro GC emitido a
 * la unidad (leído de BD). Crea el `cobroFI` con `concepto: "multa_in"` de forma
 * transaccional e idempotente (exactly-once sobre re-aplicar y sobre una
 * infracción recreada con el mismo id) y emite UN evento `IN_APPLY_FINE`.
 */
import { hoyISO } from "@/lib/date-utils"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { vencimientoDesdeDiaCorte } from "@/lib/finanzas-utils"
import { CobroFISchema } from "@/lib/schemas"
import { jsonError } from "@/lib/api/with-comunidad-scope"
import {
  cargarInfraccion,
  contextoAccionIN,
  registrarEventoIN,
} from "../../_acciones"

type Ctx = { params: Promise<{ id: string }> }

const money = (n: number): string => `$${n.toLocaleString("es-CL")}`

/** POST aplica la sanción y carga la multa al Gasto Común de la unidad. */
export async function POST(_req: Request, ctx: Ctx): Promise<Response> {
  const contexto = await contextoAccionIN()
  if (!contexto.ok) return contexto.response
  const { scope } = contexto
  const { id } = await ctx.params

  try {
    const infraccion = await cargarInfraccion(id, scope)
    if (!infraccion) return jsonError(404, "Registro no encontrado.")
    if (!["en_revision", "apelada"].includes(infraccion.estado)) {
      return jsonError(
        400,
        "Solo una infracción En Revisión o Apelada puede aplicarse."
      )
    }

    // SAFETY: danoDirecto es Json con shape DanoDirectoIN validado por InfraccionINSchema.
    const danoDirecto = infraccion.danoDirecto as unknown as {
      descripcionDaño: string
      costoReparacion: number
    } | null
    // SAFETY: respaldosDirectiva es Json con shape string[] validado por InfraccionINSchema.
    const respaldos = (infraccion.respaldosDirectiva ?? []) as unknown as string[]

    let montoAplicado: number
    let descripcionSancion: string
    if (danoDirecto) {
      montoAplicado = danoDirecto.costoReparacion
      descripcionSancion = `Cobro directo ${money(montoAplicado)}`
    } else {
      const tipo = infraccion.tipoInfraccionId
        ? await prisma.tipoInfraccionIN.findUnique({
            where: { id: infraccion.tipoInfraccionId },
          })
        : null
      if (!tipo || tipo.comunidadId !== scope.comunidadId) {
        return jsonError(
          400,
          "No se puede aplicar: el tipo de infracción ya no existe en el catálogo."
        )
      }
      montoAplicado = tipo.valor
      descripcionSancion =
        tipo.tipoSancion === "porcentaje_gc"
          ? `${tipo.valor}% del Gasto Común`
          : `${money(tipo.valor)} monto fijo`

      // Multas grave/gravísima exigen respaldo previo de la directiva.
      if (
        ["grave", "gravisima"].includes(tipo.categoria) &&
        respaldos.length === 0
      ) {
        return jsonError(
          400,
          "Las multas Grave/Gravísima requieren el respaldo de la directiva antes de cargarse al Gasto Común."
        )
      }

      // FI: la sanción % GC se resuelve contra el último cobro GC emitido a la
      // unidad; sin historial previo se usa el valor nominal del catálogo.
      if (tipo.tipoSancion === "porcentaje_gc") {
        const ultimoGC = await prisma.cobroFI.findFirst({
          where: {
            comunidadId: scope.comunidadId,
            concepto: "gasto_comun",
            unidadId: infraccion.unidadId,
          },
          orderBy: { periodo: "desc" },
        })
        if (ultimoGC) {
          montoAplicado = Math.round((tipo.valor / 100) * ultimoGC.montoBase)
          descripcionSancion = `${tipo.valor}% del Gasto Común (${money(montoAplicado)})`
        }
      }
    }

    const hoyStr = hoyISO()
    const periodo = hoyStr.slice(0, 7)
    const fondoGC = await prisma.fondoFI.findFirst({
      where: {
        comunidadId: scope.comunidadId,
        tipo: "gasto_comun",
        activo: true,
      },
      orderBy: { id: "asc" },
    })
    const configuracion = await prisma.configuracionGlobal.findUnique({
      where: { comunidadId: scope.comunidadId },
    })

    let cobroId: string | undefined
    let cobroData: Record<string, unknown> | undefined
    // Idempotencia por `origenRef`: si la infracción fue recreada (el POST
    // upsert la devuelve a `en_revision` con el mismo id), el guard por estado
    // no alcanza y se materializaría un segundo cobro para el mismo origen.
    // Un cobro vivo previo se reutiliza: nunca se crea otro.
    const cobroExistente = await prisma.cobroFI.findFirst({
      where: {
        comunidadId: scope.comunidadId,
        origenModulo: "IN",
        origenRef: infraccion.id,
        concepto: "multa_in",
      },
      orderBy: { id: "asc" },
    })
    if (cobroExistente) {
      cobroId = cobroExistente.id
    } else if (fondoGC && montoAplicado > 0) {
      const candidato = {
        id: generarId("cob"),
        unidadId: infraccion.unidadId,
        periodo,
        concepto: "multa_in",
        origenModulo: "IN",
        origenRef: infraccion.id,
        fondoId: fondoGC.id,
        descripcion: `Multa ${infraccion.folio}: ${descripcionSancion}`,
        montoBase: montoAplicado,
        fechaCargo: hoyStr,
        fechaVencimiento: vencimientoDesdeDiaCorte(
          periodo,
          configuracion?.diaCortePago ?? 5
        ),
        moras: [],
        pagos: [],
        diferencias: [],
      }
      const validacion = CobroFISchema.safeParse(candidato)
      if (!validacion.success) {
        return jsonError(400, "Datos inválidos.", {
          detalles: validacion.error.flatten(),
        })
      }
      // SAFETY: validacion.data ya pasó CobroFISchema.safeParse; el cast solo
      // borra la forma nominal del schema para reusar el objeto como data Prisma.
      cobroData = validacion.data as unknown as Record<string, unknown>
      cobroId = validacion.data.id
    }

    let referenciaCobro: string
    if (cobroExistente) {
      referenciaCobro = `; cobro FI existente reutilizado (${cobroId})`
    } else if (cobroId) {
      referenciaCobro = `; cobro FI materializado (${cobroId})`
    } else {
      referenciaCobro = "; sin fondo disponible para imputar el cargo"
    }
    const descripcionEvento = `Multa ${infraccion.folio} APLICADA (${descripcionSancion}) para unidad ${infraccion.unidadId}${referenciaCobro}.`

    const aplicada = await prisma.$transaction(async (tx) => {
      // Update condicional por estado: garantiza exactly-once del cobro incluso
      // ante dos aplicar concurrentes sobre la misma infracción.
      const update = await tx.infraccionIN.updateMany({
        where: {
          id,
          comunidadId: scope.comunidadId,
          estado: { in: ["en_revision", "apelada"] },
        },
        data: {
          estado: "aplicada",
          montoAplicado,
          cargoFIReferencia: cobroId ?? "pendiente",
        },
      })
      if (update.count === 0) return false
      if (cobroData) {
        await tx.cobroFI.create({
          // SAFETY: cobroData pasó CobroFISchema.safeParse arriba.
          data: { ...cobroData, comunidadId: scope.comunidadId } as never,
        })
      }
      await registrarEventoIN(scope, "IN_APPLY_FINE", id, descripcionEvento, tx)
      return true
    })

    if (!aplicada) {
      return jsonError(
        400,
        "Solo una infracción En Revisión o Apelada puede aplicarse."
      )
    }

    return Response.json({ ok: true })
  } catch (e) {
    logger.error({ err: e }, "[api/in/infracciones/aplicar] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}
