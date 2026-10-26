/**
 * /api/maestros/[tipo]/ocultar — F20 (fase 1): ocultamiento de catálogos
 * nacionales POR COMUNIDAD.
 *
 * PUT { maestroId, oculto }:
 * - `oculto: true`  → crea la marca (upsert idempotente por la única compuesta
 *   comunidadId+tipo+maestroId); el GET de la colección deja de mostrar la fila.
 * - `oculto: false` → elimina la marca (deleteMany): la fila vuelve al listado.
 *
 * La fila nacional NUNCA se modifica ni se borra; solo la marca. Solo los
 * catálogos nacionales admiten ocultamiento (400 en cualquier otro tipo) y la
 * acción requiere `mp:editar` (mismo permiso que la colección maestros).
 */
import { z } from "zod"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { esTipoNacional } from "@/lib/maestros-nacionales"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"

type CtxTipo = { params: Promise<{ tipo: string }> }

const CUERPO = z.object({
  maestroId: z.string().min(1),
  oculto: z.boolean(),
})

/** PUT marca/desmarca el ocultamiento de una fila nacional para la comunidad. */
export async function PUT(req: Request, ctx: CtxTipo): Promise<Response> {
  const { tipo } = await ctx.params
  if (!esTipoNacional(tipo)) {
    return jsonError(
      400,
      "El tipo de maestro no admite ocultamiento (solo los catálogos nacionales)."
    )
  }

  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  if (!puede(scope.rol, "editar", "mp")) {
    return jsonError(403, "Permiso denegado.")
  }

  let cuerpo: unknown = null
  try {
    cuerpo = await req.json()
  } catch {
    return jsonError(400, "Cuerpo JSON inválido.")
  }
  const parsed = CUERPO.safeParse(cuerpo)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const { maestroId, oculto } = parsed.data

  if (oculto) {
    // Upsert idempotente: repetir la marca no duplica (única compuesta) ni
    // cambia nada (update vacío, la marca no tiene estado adicional).
    await prisma.maestroOculto.upsert({
      where: {
        comunidadId_tipo_maestroId: {
          comunidadId: scope.comunidadId,
          tipo,
          maestroId,
        },
      },
      update: {},
      create: { comunidadId: scope.comunidadId, tipo, maestroId },
    })
  } else {
    await prisma.maestroOculto.deleteMany({
      where: { comunidadId: scope.comunidadId, tipo, maestroId },
    })
  }

  return Response.json({ ok: true, oculto })
}
