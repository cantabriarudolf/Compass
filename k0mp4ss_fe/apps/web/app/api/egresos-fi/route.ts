/**
 * /api/egresos-fi — colección de egresos FI (BD-FUENTE-VERDAD Fase 3).
 *
 * GET paginado vía factory. POST upsert con reglas espejo de saveEgresoFI:
 * folio FE-#### correlativo auto-generado al alta, fondo existente y activo,
 * y FKs (sub-sectores, unidad, acta de aprobación) contra la comunidad.
 */
import { EgresoFISchema } from "@/lib/schemas"
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

export const egresosHandlers = createCrudHandlers({
  model: delegado(prisma.egresoFI),
  schema: EgresoFISchema,
  authzCheck: (rol, accion) => puede(rol, accion, "fi"),
})

export const GET = egresosHandlers.GET

const CAMPOS_EGRESO = [
  "folio",
  "fecha",
  "categoria",
  "descripcion",
  "monto",
  "fondoId",
  "esRecurrente",
  "comprobante",
  "microSectoresIds",
  "proveedor",
  "unidadId",
  "aprobacionActaGDId",
] as const

/** Siguiente folio FE-#### correlativo dentro de la comunidad. */
export async function siguienteFolioFE(comunidadId: string): Promise<string> {
  const egresos = await prisma.egresoFI.findMany({
    where: { comunidadId },
    select: { folio: true },
  })
  const numeros = egresos
    .map((e) => Number.parseInt((e.folio ?? "").replace(/^FE-/, ""), 10))
    .filter((n) => Number.isFinite(n))
  return `FE-${String((numeros.length > 0 ? Math.max(...numeros) : 0) + 1).padStart(4, "0")}`
}

export interface ReferenciasEgreso {
  fondoId: string
  microSectoresIds?: string[]
  unidadId?: string
  aprobacionActaGDId?: string
}

/** FKs del egreso contra la comunidad (400 si alguna no existe / fondo inactivo). */
export async function verificarReferenciasEgreso(
  comunidadId: string,
  refs: ReferenciasEgreso
): Promise<Response | null> {
  const fondo = await prisma.fondoFI.findFirst({
    where: { comunidadId, id: refs.fondoId },
  })
  if (!fondo) {
    return jsonError(
      400,
      "No se puede guardar el gasto: el fondo de imputación no existe."
    )
  }
  if (!fondo.activo) {
    return jsonError(
      400,
      `No se puede guardar el gasto: el fondo "${fondo.nombre}" está inactivo.`
    )
  }
  for (const microId of refs.microSectoresIds ?? []) {
    const micro = await prisma.microSector.findFirst({
      where: { comunidadId, id: microId },
    })
    if (!micro) {
      return jsonError(
        400,
        "No se puede guardar el gasto: uno de los sub-sectores diferenciados no existe."
      )
    }
  }
  if (refs.unidadId) {
    const unidad = await prisma.unidad.findFirst({
      where: { comunidadId, id: refs.unidadId },
    })
    if (!unidad) {
      return jsonError(
        400,
        "No se puede guardar el gasto: la unidad indicada no existe en el inventario."
      )
    }
  }
  if (refs.aprobacionActaGDId) {
    const acta = await prisma.actaGD.findFirst({
      where: { comunidadId, id: refs.aprobacionActaGDId },
    })
    if (!acta) {
      return jsonError(
        400,
        "No se puede guardar el gasto: el acta de aprobación indicada no existe."
      )
    }
  }
  return null
}

function limpiarEgreso(datos: Record<string, unknown>): Record<string, unknown> {
  const salida: Record<string, unknown> = {}
  for (const campo of CAMPOS_EGRESO) {
    if (campo in datos) salida[campo] = datos[campo]
  }
  return salida
}

/** POST upsert idempotente por id (folio auto solo al alta). */
export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")
  const parsed = EgresoFISchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const id = parsed.data.id

  try {
    const existente = await prisma.egresoFI.findUnique({ where: { id } })
    if (existente && existente.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    if (!puede(scope.rol, existente ? "editar" : "crear", "fi")) {
      return jsonError(403, "Permiso denegado.")
    }
    // SAFETY: parsed.data ya pasó EgresoFISchema.safeParse; el cast solo habilita la lista blanca de campos persistibles.
    const datos = parsed.data as unknown as Record<string, unknown>
    if (!existente && !parsed.data.folio) {
      datos.folio = await siguienteFolioFE(scope.comunidadId)
    }
    // SAFETY: datos conserva el shape validado del schema (fondoId, microSectoresIds, unidadId, aprobacionActaGDId); solo se lee para verificar FKs.
    const corto = await verificarReferenciasEgreso(
      scope.comunidadId,
      datos as unknown as ReferenciasEgreso
    )
    if (corto) return corto

    const limpio = limpiarEgreso(datos)
    const record = await prisma.egresoFI.upsert({
      where: { id },
      create: { ...limpio, id, comunidadId: scope.comunidadId } as never,
      update: limpio as never,
    })
    return Response.json(record, { status: existente ? 200 : 201 })
  } catch (e) {
    logger.error({ err: e }, "[api/egresos-fi] error inesperado")
    return errorGenerico(e)
  }
}
