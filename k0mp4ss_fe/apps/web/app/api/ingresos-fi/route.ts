/**
 * /api/ingresos-fi — colección de ingresos a fondo FI (BD-FUENTE-VERDAD Fase 3).
 *
 * GET paginado vía factory. POST/PUT con regla espejo de registrarIngresoFI:
 * el fondo de imputación debe existir en la comunidad y estar activo.
 */
import { IngresoFISchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
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

export const ingresosHandlers = createCrudHandlers({
  model: delegado(prisma.ingresoFI),
  schema: IngresoFISchema,
  authzCheck: (rol, accion) => puede(rol, accion, "fi"),
})

export const GET = ingresosHandlers.GET

const CAMPOS_INGRESO = ["fecha", "monto", "concepto", "fondoId", "familia"] as const

/** El fondo de imputación debe existir y estar activo (400 si no). */
export async function verificarFondoActivo(
  comunidadId: string,
  fondoId: string
): Promise<Response | null> {
  const fondo = await prisma.fondoFI.findFirst({
    where: { comunidadId, id: fondoId },
  })
  if (!fondo) {
    return jsonError(
      400,
      "No se puede registrar el ingreso: el fondo de imputación no existe."
    )
  }
  if (!fondo.activo) {
    return jsonError(
      400,
      `No se puede registrar el ingreso: el fondo "${fondo.nombre}" está inactivo.`
    )
  }
  return null
}

function limpiarIngreso(datos: Record<string, unknown>): Record<string, unknown> {
  const salida: Record<string, unknown> = {}
  for (const campo of CAMPOS_INGRESO) {
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
  const parsed = IngresoFISchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const id = parsed.data.id

  try {
    const existente = await prisma.ingresoFI.findUnique({ where: { id } })
    if (existente && existente.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    if (!puede(scope.rol, existente ? "editar" : "crear", "fi")) {
      return jsonError(403, "Permiso denegado.")
    }
    const corto = await verificarFondoActivo(
      scope.comunidadId,
      parsed.data.fondoId
    )
    if (corto) return corto

    // SAFETY: parsed.data ya pasó IngresoFISchema.safeParse; el cast solo habilita la lista blanca de campos persistibles.
    const limpio = limpiarIngreso(
      parsed.data as unknown as Record<string, unknown>
    )
    const record = await prisma.ingresoFI.upsert({
      where: { id },
      create: { ...limpio, id, comunidadId: scope.comunidadId } as never,
      update: limpio as never,
    })

    // Auditoría `FI_INGRESO_REGISTRADO` (categoría FI): se emite después de la
    // escritura y nunca la bloquea (patrón de las rutas que auditan a mano).
    try {
      await prisma.eventoAuditoria.create({
        data: {
          id: generarId("ev"),
          comunidadId: scope.comunidadId,
          timestamp: new Date().toISOString(),
          usuario: scope.usuarioId,
          categoria: "FI",
          tipoAccion: "FI_INGRESO_REGISTRADO",
          referenciaId: record.id,
          descripcion: `Ingreso registrado en el fondo ${record.fondoId}: $${record.monto.toLocaleString("es-CL")} (${record.concepto}), fecha ${record.fecha}.`,
        },
      })
    } catch (e) {
      logger.error({ err: e }, "[api/ingresos-fi] no se pudo registrar FI_INGRESO_REGISTRADO")
    }

    return Response.json(record, { status: existente ? 200 : 201 })
  } catch (e) {
    logger.error({ err: e }, "[api/ingresos-fi] error inesperado")
    return errorGenerico(e)
  }
}
