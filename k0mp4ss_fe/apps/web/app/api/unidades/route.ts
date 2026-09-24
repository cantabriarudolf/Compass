/**
 * /api/unidades — colección de unidades EF (BD-FUENTE-VERDAD Fase 3).
 *
 * GET vía factory. POST/PUT con reglas espejo de saveUnidad: microSectorId,
 * tipoUnidadId y estadoId (maestro estadosOcupacion) deben existir en la
 * comunidad. Baja bloqueada con vínculos (409).
 */
import { UnidadSchema } from "@/lib/schemas"
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

export const unidadesHandlers = createCrudHandlers({
  model: delegado(prisma.unidad),
  schema: UnidadSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "mp"),
  beforeDelete: async (record, scope) => {
    const vinculados = await prisma.vinculoUnidad.count({
      where: {
        comunidadId: scope.comunidadId,
        unidadId: (record as { id: string }).id,
      },
    })
    if (vinculados > 0) {
      return jsonError(
        409,
        "No se puede eliminar la unidad: tiene vínculos asociados."
      )
    }
    return null
  },
})

export const GET = unidadesHandlers.GET

const CAMPOS_UNIDAD = [
  "microSectorId",
  "numero",
  "etiqueta",
  "tipoUnidadId",
  "metraje",
  "prorrateo",
  "rolSii",
  "estadoId",
  "servicios",
] as const

export interface ReferenciasUnidad {
  microSectorId: string
  tipoUnidadId: string
  estadoId: string
}

/** FKs de la unidad contra la comunidad (400 si alguna no existe). */
export async function verificarReferenciasUnidad(
  comunidadId: string,
  refs: ReferenciasUnidad
): Promise<Response | null> {
  const micro = await prisma.microSector.findFirst({
    where: { comunidadId, id: refs.microSectorId },
  })
  if (!micro) {
    return jsonError(
      400,
      "No se puede guardar la unidad: microSectorId no existe en microSectores."
    )
  }
  const tipo = await prisma.tipoUnidad.findFirst({
    where: { comunidadId, id: refs.tipoUnidadId },
  })
  if (!tipo) {
    return jsonError(
      400,
      "No se puede guardar la unidad: tipoUnidadId no existe en tiposUnidad."
    )
  }
  const estado = await prisma.estadoOcupacion.findFirst({
    where: { comunidadId, id: refs.estadoId },
  })
  if (!estado) {
    return jsonError(
      400,
      "No se puede guardar la unidad: estadoId no existe en maestros.estadosOcupacion."
    )
  }
  return null
}

function limpiarUnidad(datos: Record<string, unknown>): Record<string, unknown> {
  const salida: Record<string, unknown> = {}
  for (const campo of CAMPOS_UNIDAD) {
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
  const parsed = UnidadSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const id = parsed.data.id

  try {
    const existente = await prisma.unidad.findUnique({ where: { id } })
    if (existente && existente.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    if (!puede(scope.rol, existente ? "editar" : "crear", "mp")) {
      return jsonError(403, "Permiso denegado.")
    }
    // SAFETY: parsed.data ya pasó UnidadSchema.safeParse; solo se lee para FKs.
    const corto = await verificarReferenciasUnidad(
      scope.comunidadId,
      parsed.data as unknown as ReferenciasUnidad
    )
    if (corto) return corto

    // SAFETY: parsed.data ya validado; el cast solo habilita la lista blanca.
    const limpio = limpiarUnidad(parsed.data as unknown as Record<string, unknown>)
    const record = await prisma.unidad.upsert({
      where: { id },
      create: { ...limpio, id, comunidadId: scope.comunidadId } as never,
      update: limpio as never,
    })
    return Response.json(record, { status: existente ? 200 : 201 })
  } catch (e) {
    logger.error({ err: e }, "[api/unidades] error inesperado")
    return errorGenerico(e)
  }
}
