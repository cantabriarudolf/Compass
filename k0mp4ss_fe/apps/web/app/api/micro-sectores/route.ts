/**
 * /api/micro-sectores — colección de micro sectores EF (BD-FUENTE-VERDAD Fase 3).
 *
 * GET vía factory. POST/PUT con regla espejo de saveMicroSector: el
 * macroSectorId debe existir en la comunidad. Baja bloqueada con unidades.
 */
import { MicroSectorSchema } from "@/lib/schemas"
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

export const microHandlers = createCrudHandlers({
  model: delegado(prisma.microSector),
  schema: MicroSectorSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "mp"),
  beforeDelete: async (record, scope) => {
    const asociadas = await prisma.unidad.count({
      where: {
        comunidadId: scope.comunidadId,
        microSectorId: (record as { id: string }).id,
      },
    })
    if (asociadas > 0) {
      return jsonError(
        409,
        `No se puede eliminar el sub-sector: ${asociadas} unidad(es) asociada(s).`
      )
    }
    return null
  },
})

export const GET = microHandlers.GET

const CAMPOS_MICRO = ["macroSectorId", "nombre", "etiqueta"] as const

/** El macro de pertenencia debe existir en la comunidad (400 si no). */
export async function verificarMacroExiste(
  comunidadId: string,
  macroSectorId: string
): Promise<Response | null> {
  const macro = await prisma.macroSector.findFirst({
    where: { comunidadId, id: macroSectorId },
  })
  if (!macro) {
    return jsonError(
      400,
      "No se puede guardar el sub-sector: el macro sector indicado no existe."
    )
  }
  return null
}

function limpiarMicro(datos: Record<string, unknown>): Record<string, unknown> {
  const salida: Record<string, unknown> = {}
  for (const campo of CAMPOS_MICRO) {
    if (campo in datos) salida[campo] = datos[campo]
  }
  return salida
}

/** POST upsert idempotente por id. */
export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")
  const parsed = MicroSectorSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const id = parsed.data.id

  try {
    const existente = await prisma.microSector.findUnique({ where: { id } })
    if (existente && existente.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    if (!puede(scope.rol, existente ? "editar" : "crear", "mp")) {
      return jsonError(403, "Permiso denegado.")
    }
    const corto = await verificarMacroExiste(
      scope.comunidadId,
      parsed.data.macroSectorId
    )
    if (corto) return corto

    // SAFETY: parsed.data ya pasó MicroSectorSchema.safeParse; solo lista blanca.
    const limpio = limpiarMicro(parsed.data as unknown as Record<string, unknown>)
    const record = await prisma.microSector.upsert({
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
    logger.error({ err: e }, "[api/micro-sectores] error inesperado")
    return errorGenerico(e)
  }
}
