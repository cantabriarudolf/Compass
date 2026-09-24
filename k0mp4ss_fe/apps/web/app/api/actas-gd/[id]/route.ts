/**
 * /api/actas-gd/[id] — detalle/actualización/baja de un acta GD (Fase 2).
 *
 * - GET: administrador/directiva todo; residente solo publicadas con
 *   autorización AD (residenteVeActas).
 * - PUT parcial: se fusiona con el registro y se revalida el ActaGDSchema
 *   completo; si trae presentes/ausentes se revalida la membresía vigente.
 * - DELETE: bloqueado si el acta está publicada (409; el libro no se reescribe).
 */
import { ActaGDSchema } from "@/lib/schemas"
import { prisma } from "@/lib/prisma"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { puedeGestionarActas, residentesVenActas } from "@/lib/api/gd-guard"
import {
  errorActas,
  limpiarPayloadActa,
  validarAsistentesYPeriodo,
} from "../route"

type CtxTipo = { params: Promise<{ id: string }> }

function esResidente(rol: string): boolean {
  const n = rol.trim().toLowerCase()
  return n === "residente" || n === "propietario"
}

/** GET una acta por id (scoped; residente solo publicadas autorizadas). */
export async function GET(_req: Request, ctx: CtxTipo): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  const { id } = await ctx.params

  try {
    const record = await prisma.actaGD.findUnique({ where: { id } })
    if (!record || record.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    if (esResidente(scope.rol)) {
      if (
        record.estado !== "publicada" ||
        !(await residentesVenActas(scope.comunidadId))
      ) {
        return jsonError(404, "Registro no encontrado.")
      }
      return Response.json(record)
    }
    if (!puedeGestionarActas(scope.rol, "ver")) {
      return jsonError(403, "Permiso denegado.")
    }
    return Response.json(record)
  } catch (e) {
    return errorActas(e)
  }
}

/** PUT parcial por id (solo administrador/directiva; revalida schema + quórum). */
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
    const existente = await prisma.actaGD.findUnique({ where: { id } })
    if (!existente || existente.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    if (!puedeGestionarActas(scope.rol, "editar")) {
      return jsonError(403, "Permiso denegado.")
    }

    // Fusión + revalidación completa (null de Prisma → undefined para zod).
    // SAFETY: la fila Prisma del acta tiene exactamente los campos del schema más metadatos; se fusiona el parcial encima.
    const base = Object.fromEntries(
      Object.entries(existente as unknown as Record<string, unknown>).map(
        ([k, v]) => [k, v === null ? undefined : v]
      )
    ) as Record<string, unknown>
    const fusion = { ...base, ...(body as Record<string, unknown>), id }
    const parsed = ActaGDSchema.safeParse(fusion)
    if (!parsed.success) {
      return jsonError(400, "Datos inválidos.", {
        detalles: parsed.error.flatten(),
      })
    }
    // SAFETY: mismo tratamiento que en POST (mapa plano validado por zod).
    const datos = parsed.data as unknown as Record<string, unknown>
    if ("presentes" in (body as object) || "ausentes" in (body as object)) {
      const negocio = await validarAsistentesYPeriodo(datos, scope)
      if (!negocio.ok) return negocio.response
    }

    // SAFETY: payload blanqueado; Json arrays ya validados por zod.
    const actualizado = await prisma.actaGD.update({
      where: { id },
      data: limpiarPayloadActa(datos) as never,
    })
    return Response.json(actualizado)
  } catch (e) {
    return errorActas(e)
  }
}

/** DELETE por id (solo administrador/directiva; publicada → 409). */
export async function DELETE(_req: Request, ctx: CtxTipo): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  const { id } = await ctx.params

  try {
    const record = await prisma.actaGD.findUnique({ where: { id } })
    if (!record || record.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    if (!puedeGestionarActas(scope.rol, "editar")) {
      return jsonError(403, "Permiso denegado.")
    }
    if (record.estado === "publicada") {
      return jsonError(
        409,
        "No se puede eliminar un acta publicada (el libro de directiva no se reescribe)."
      )
    }
    await prisma.actaGD.delete({ where: { id } })
    return Response.json({ ok: true })
  } catch (e) {
    return errorActas(e)
  }
}
