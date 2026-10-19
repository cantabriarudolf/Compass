/**
 * /api/ir/recursos/[id] — detalle/actualización parcial/baja.
 *
 * GET_ONE y DELETE vía factory. PUT parcial vía put-merge sobre
 * "ir:mantenimiento". El paso del activo a Reparación emite `IR_ASSET_REPAIR`
 * (categoría IR) después de la escritura.
 */
import { RecursoIRSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { createPutMerge } from "@/lib/api/put-merge"
import { withComunidadScope } from "@/lib/api/with-comunidad-scope"

const modelo = delegado(prisma.recursoIR)
const authzCheck = (rol: string, accion: "ver" | "crear" | "editar" | "eliminar" | "ejecutar") =>
  puede(rol, accion, "ir:mantenimiento")

const handlers = createCrudHandlers({
  model: modelo,
  schema: RecursoIRSchema,
  authzCheck,
})

const putMerge = createPutMerge({
  model: modelo,
  schema: RecursoIRSchema,
  authzCheck,
  recurso: "ir/recursos",
})

type Ctx = { params: Promise<{ id: string }> }

export const GET = handlers.GET_ONE

/**
 * PUT parcial + auditoría del paso a Reparación.
 *
 * `putMerge` es genérico y no expone punto de extensión post-escritura; esta
 * ruta lo envuelve para emitir `IR_ASSET_REPAIR` en la transición real
 * (estado previo ≠ "reparacion" → "reparacion"), después de la escritura y en
 * su propio try/catch: la auditoría nunca bloquea la mutación.
 */
export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params
  // El parche se lee de un clon: el handler put-merge consume el cuerpo original.
  const parche = (await req
    .clone()
    .json()
    .catch(() => null)) as Record<string, unknown> | null
  const aReparacion = parche?.estadoActivo === "reparacion"
  // Solo la transición: el re-guardado del mismo estado no vuelve a auditar.
  const previo = aReparacion
    ? await prisma.recursoIR.findUnique({
        where: { id },
        select: { estadoActivo: true },
      })
    : null

  const res = await putMerge(req, ctx)
  if (!res.ok || !aReparacion || previo?.estadoActivo === "reparacion") return res

  try {
    const recurso = (await res.clone().json()) as {
      codigo?: string | null
      nombre?: string
      categoria?: string
    }
    const scopeResult = await withComunidadScope()
    if (scopeResult.ok) {
      const { scope } = scopeResult
      await prisma.eventoAuditoria.create({
        data: {
          id: generarId("ev"),
          comunidadId: scope.comunidadId,
          timestamp: new Date().toISOString(),
          usuario: scope.usuarioId,
          categoria: "IR",
          tipoAccion: "IR_ASSET_REPAIR",
          referenciaId: id,
          descripcion: `${recurso.codigo ? `${recurso.codigo} · ` : ""}${recurso.nombre ?? "Activo IR"} (${recurso.categoria ?? "sin categoría"}) pasa a Reparación desde ${previo?.estadoActivo ?? "disponible"}.`,
        },
      })
    }
  } catch (e) {
    logger.error(
      { err: e },
      "[api/ir/recursos] no se pudo registrar IR_ASSET_REPAIR"
    )
  }

  return res
}

export const DELETE = handlers.DELETE
