/**
 * /api/fondos-fi — colección de fondos FI (BD-FUENTE-VERDAD Fase 3).
 *
 * GET paginado vía factory. POST upsert idempotente con reglas espejo de
 * saveFondoFI (lib/store.ts): nombre único por comunidad (409, insensible a
 * mayúsculas) y authz sobre el recurso "fi" (solo administrador escribe;
 * comité lee; residente sin acceso).
 */
import { FondoFISchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
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

export const fondosHandlers = createCrudHandlers({
  model: delegado(prisma.fondoFI),
  schema: FondoFISchema,
  authzCheck: (rol, accion) => puede(rol, accion, "fi"),
  beforeDelete: async (record, scope) => {
    const id = (record as { id: string }).id
    const [egresos, ingresos, cobros] = await Promise.all([
      prisma.egresoFI.count({
        where: { comunidadId: scope.comunidadId, fondoId: id },
      }),
      prisma.ingresoFI.count({
        where: { comunidadId: scope.comunidadId, fondoId: id },
      }),
      prisma.cobroFI.count({
        where: { comunidadId: scope.comunidadId, fondoId: id },
      }),
    ])
    // fondoReservaAporte es Json: se filtra en JS (pocas emisiones por comunidad).
    const emisiones = await prisma.emisionGC.findMany({
      where: { comunidadId: scope.comunidadId },
      select: { fondoReservaAporte: true },
    })
    const aportes = emisiones.filter(
      (e) =>
        (e.fondoReservaAporte as { fondoId?: string } | null)?.fondoId ===
        id
    ).length
    const total = egresos + ingresos + cobros + aportes
    if (total > 0) {
      return jsonError(
        409,
        `No se puede eliminar el fondo: ${total} movimiento(s) financiero(s) lo imputan.`
      )
    }
    return null
  },
})

export const GET = fondosHandlers.GET

const CAMPOS_FONDO = [
  "nombre",
  "tipo",
  "descripcion",
  "porcentajeAporte",
  "activo",
  "saldoInicial",
] as const

/** POST upsert idempotente por id, con unicidad de nombre por comunidad. */
export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")

  const parsed = FondoFISchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const id = parsed.data.id

  try {
    const existente = await prisma.fondoFI.findUnique({ where: { id } })
    // Upsert sobre un registro de OTRA comunidad → 404 (sin filtrar existencia)
    if (existente && existente.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    if (!puede(scope.rol, existente ? "editar" : "crear", "fi")) {
      return jsonError(403, "Permiso denegado.")
    }

    const nombre = parsed.data.nombre.trim()
    const mismos = await prisma.fondoFI.findMany({
      where: { comunidadId: scope.comunidadId },
      select: { id: true, nombre: true },
    })
    if (
      mismos.some(
        (f) => f.id !== id && f.nombre.toLowerCase() === nombre.toLowerCase()
      )
    ) {
      return jsonError(409, `Ya existe un fondo con el nombre "${nombre}".`)
    }

    // SAFETY: parsed.data ya pasó FondoFISchema.safeParse; el cast solo habilita la lista blanca de campos persistibles.
    const datos = parsed.data as unknown as Record<string, unknown>
    const limpio: Record<string, unknown> = { nombre }
    for (const campo of CAMPOS_FONDO) {
      if (campo !== "nombre" && campo in datos) limpio[campo] = datos[campo]
    }
    const record = await prisma.fondoFI.upsert({
      where: { id },
      create: { ...limpio, id, comunidadId: scope.comunidadId } as never,
      update: limpio as never,
    })
    return Response.json(record, { status: existente ? 200 : 201 })
  } catch (e) {
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return jsonError(409, "Conflicto: registro duplicado.")
    }
    logger.error({ err: e }, "[api/fondos-fi] error inesperado")
    return errorGenerico(e)
  }
}
