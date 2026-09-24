/**
 * /api/controles-propiedad/[id] — detalle/actualización/baja de un control AD.
 *
 * - GET: gestión todo; residente solo si el control es de su unidad.
 * - PUT parcial: se fusiona y revalida el ControlPropiedadSchema completo;
 *   respeta la unicidad por unidad. Solo administrador/directiva.
 * - DELETE: solo administrador/directiva.
 */
import { ControlPropiedadSchema } from "@/lib/schemas"
import { prisma } from "@/lib/prisma"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import {
  personaIdDelUsuarioDb,
  puedeGestionarControles,
  unidadesVinculadasDb,
} from "@/lib/api/gd-guard"
import {
  errorControles,
  limpiarPayloadControl,
} from "../route"

type CtxTipo = { params: Promise<{ id: string }> }

function esResidente(rol: string): boolean {
  const n = rol.trim().toLowerCase()
  return n === "residente" || n === "propietario"
}

/** GET un control por id (residente: solo su unidad). */
export async function GET(_req: Request, ctx: CtxTipo): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  const { id } = await ctx.params

  try {
    const record = await prisma.controlPropiedad.findUnique({ where: { id } })
    if (!record || record.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    if (esResidente(scope.rol)) {
      const personaId = await personaIdDelUsuarioDb(scope.usuarioId)
      const unidades = personaId
        ? await unidadesVinculadasDb(personaId, scope.comunidadId)
        : []
      if (!unidades.includes(record.unidadId)) {
        return jsonError(403, "Permiso denegado: solo ves los controles de tu unidad.")
      }
      return Response.json(record)
    }
    if (!puedeGestionarControles(scope.rol, "ver")) {
      return jsonError(403, "Permiso denegado.")
    }
    return Response.json(record)
  } catch (e) {
    return errorControles(e)
  }
}

/** PUT parcial por id (solo administrador/directiva). */
export async function PUT(req: Request, ctx: CtxTipo): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  const { id } = await ctx.params

  const body: unknown = await req.json().catch(() => null)
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return jsonError(400, "Cuerpo JSON inválido.")
  }

  try {
    const existente = await prisma.controlPropiedad.findUnique({ where: { id } })
    if (!existente || existente.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    if (!puedeGestionarControles(scope.rol, "editar")) {
      return jsonError(403, "Permiso denegado.")
    }

    // Fusión + revalidación completa (null de Prisma → undefined para zod).
    // SAFETY: la fila del control tiene exactamente los campos del schema más metadatos.
    const base = Object.fromEntries(
      Object.entries(existente as unknown as Record<string, unknown>).map(
        ([k, v]) => [k, v === null ? undefined : v]
      )
    ) as Record<string, unknown>
    const fusion = { ...base, ...(body as Record<string, unknown>), id }
    const parsed = ControlPropiedadSchema.safeParse(fusion)
    if (!parsed.success) {
      return jsonError(400, "Datos inválidos.", {
        detalles: parsed.error.flatten(),
      })
    }
    // Unicidad por unidad si cambia la unidad (misma regla que POST).
    if (
      parsed.data.unidadId !== existente.unidadId &&
      (await prisma.controlPropiedad.findFirst({
        where: {
          comunidadId: scope.comunidadId,
          unidadId: parsed.data.unidadId,
          NOT: { id },
        },
        select: { id: true },
      }))
    ) {
      return jsonError(409, "La unidad ya tiene controles registrados.")
    }

    // SAFETY: parcial validado por zod + lista blanca de campos.
    const actualizado = await prisma.controlPropiedad.update({
      where: { id },
      data: limpiarPayloadControl(
        parsed.data as unknown as Record<string, unknown>
      ) as never,
    })
    return Response.json(actualizado)
  } catch (e) {
    return errorControles(e)
  }
}

/** DELETE por id (solo administrador/directiva). */
export async function DELETE(_req: Request, ctx: CtxTipo): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  const { id } = await ctx.params

  try {
    const record = await prisma.controlPropiedad.findUnique({ where: { id } })
    if (!record || record.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    if (!puedeGestionarControles(scope.rol, "editar")) {
      return jsonError(403, "Permiso denegado.")
    }
    await prisma.controlPropiedad.delete({ where: { id } })
    return Response.json({ ok: true })
  } catch (e) {
    return errorControles(e)
  }
}
