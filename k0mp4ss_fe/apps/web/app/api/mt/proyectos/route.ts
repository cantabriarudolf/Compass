/**
 * /api/mt/proyectos — proyectos de mantenimiento MT (Fase 4).
 *
 * GET paginado vía factory. POST upsert idempotente por id con paridad
 * server-side con `saveProyectoMT` legacy (Fase 1.5): cuando el proyecto
 * declara `fondoFinanciamientoId`, exige que el fondo exista y esté activo en
 * la comunidad y que su saldo alcance el presupuesto estimado; el saldo se
 * calcula con la MISMA fórmula del store (`saldoFondo` sobre cobros, egresos y
 * emisiones de BD, sin `saldoInicial`) y el rechazo es 409 "Saldo insuficiente".
 * Authz sobre "mt".
 */
import { ProyectoMTSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { errorGenerico } from "@/app/api/personas/route"
import { saldoFondoProyectoMT } from "../_acciones"

const modelo = delegado(prisma.proyectoMT)

const handlers = createCrudHandlers({
  model: modelo,
  schema: ProyectoMTSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "mt"),
})

export const GET = handlers.GET

export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")

  const parsed = ProyectoMTSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", { detalles: parsed.error.flatten() })
  }
  const datos = parsed.data

  try {
    const existente = await prisma.proyectoMT.findUnique({ where: { id: datos.id } })
    if (existente && existente.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    const accion = existente ? "editar" : "crear"
    if (!puede(scope.rol, accion, "mt")) return jsonError(403, "Permiso denegado.")

    // Guard de saldo (espejo `saveProyectoMT`): solo si hay fondo declarado.
    if (datos.fondoFinanciamientoId) {
      const fondo = await prisma.fondoFI.findUnique({
        where: { id: datos.fondoFinanciamientoId },
      })
      if (!fondo || fondo.comunidadId !== scope.comunidadId) {
        return jsonError(
          400,
          "No se puede guardar el proyecto: el fondo de financiamiento indicado no existe en Finanzas."
        )
      }
      if (!fondo.activo) {
        return jsonError(
          400,
          `No se puede guardar el proyecto: el fondo "${fondo.nombre}" está inactivo.`
        )
      }
      const saldo = await saldoFondoProyectoMT(fondo.id, scope.comunidadId)
      if (saldo < datos.presupuestoEstimado) {
        return jsonError(
          409,
          `Saldo insuficiente en "${fondo.nombre}": disponible $${saldo.toLocaleString("es-CL")} para financiar un presupuesto de $${datos.presupuestoEstimado.toLocaleString("es-CL")}.`
        )
      }
    }

    const record = await modelo.upsert({
      where: { id: datos.id },
      create: { ...datos, comunidadId: scope.comunidadId },
      update: { ...datos },
    })
    return Response.json(record, { status: existente ? 200 : 201 })
  } catch (e) {
    logger.error({ err: e }, "[api/mt/proyectos] error inesperado")
    return errorGenerico(e)
  }
}
