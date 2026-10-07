/**
 * /api/personas/[id] — detalle/actualización parcial/baja de una persona (MP).
 *
 * ABAC residente (mp:propios): solo puede ver/editar SU propia ficha
 * (Usuario.personaId); cualquier otro id → 403. DELETE siempre requiere
 * permiso "mp"/eliminar en la matriz (el residente no lo tiene).
 * Baja protegida: una persona con vínculos de unidad no se elimina (409).
 */
import { PersonaSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import {
  auditarPodaGobernanza,
  errorGenerico,
  limpiarPayloadPersona,
  personaIdDelUsuario,
  validarYLimpiarPersona,
} from "../route"

type CtxTipo = { params: Promise<{ id: string }> }

function denegar(rol: string, accion: "ver" | "editar" | "eliminar"): Response | null {
  if (puede(rol, accion, "mp")) return null
  return jsonError(403, "Permiso denegado.")
}

async function abortarResidenteAjeno(
  rol: string,
  usuarioId: string,
  id: string
): Promise<Response | null> {
  if (rol !== "residente") return null
  const personaId = await personaIdDelUsuario(usuarioId)
  if (id !== personaId) {
    return jsonError(403, "Permiso denegado: solo puedes acceder a tu propia ficha.")
  }
  return null
}

/** GET_ONE por id (scoped a la comunidad). ABAC residente: solo su ficha. */
export async function GET(req: Request, ctx: CtxTipo): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  const { id } = await ctx.params
  if (scope.rol === "residente") {
    const personaId = await personaIdDelUsuario(scope.usuarioId)
    if (id !== personaId) {
      return jsonError(403, "Permiso denegado: solo puedes acceder a tu propia ficha.")
    }
  } else if (!puede(scope.rol, "ver", "mp")) {
    return jsonError(403, "Permiso denegado.")
  }

  try {
    const record = await prisma.persona.findUnique({ where: { id } })
    if (!record || record.comunidadId !== resultado.scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    return Response.json(record)
  } catch (e) {
    return errorGenerico(e)
  }
}

/** PUT parcial: las claves no enviadas no se tocan. Validaciones de negocio
 * corren sobre el registro mergeado (fuente de verdad + parche). */
export async function PUT(req: Request, ctx: CtxTipo): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  const { id } = await ctx.params

  // Residente: editar propia ficha (mp:propios). Otros roles: matriz "mp".
  const permitido =
    scope.rol === "residente"
      ? (await personaIdDelUsuario(scope.usuarioId)) === id
      : puede(scope.rol, "editar", "mp")
  if (!permitido) return jsonError(403, "Permiso denegado.")

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")

  try {
    const existente = await prisma.persona.findUnique({ where: { id } })
    if (!existente || existente.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    const parcial = PersonaSchema.partial().safeParse(body)
    if (!parcial.success) {
      return jsonError(400, "Datos inválidos.", { detalles: parcial.error.flatten() })
    }

    // SAFETY: la fila Prisma y el parche Zod validado se funden como Record
    // genérico para el helper de validación (que lee/escribe claves sueltas).
    const mergeado = limpiarPayloadPersona({
      ...(existente as unknown as Record<string, unknown>),
      ...(parcial.data as Record<string, unknown>),
    })
    const validado = await validarYLimpiarPersona(mergeado, scope, id)
    if (!validado.ok) return validado.response

    const datos = limpiarPayloadPersona(parcial.data as Record<string, unknown>)
    // GD: la poda se decide contra la fila PERSISTIDA (más la clave entrante),
    // no contra la mera presencia de `datosGobernanza` en el payload. Si la fila
    // ya tenía ficha —o llega una— y los roles resultantes del merge pierden
    // `directiva`, la columna se fija en null en esta misma escritura. Sin esto
    // Prisma salta la columna y la ficha vieja sobrevive sin poda ni auditoría
    // (es el camino real del formulario de persona).
    const rolesMerge = Array.isArray(validado.datos.roles)
      ? (validado.datos.roles as string[])
      : []
    if (
      !rolesMerge.includes("directiva") &&
      (existente.datosGobernanza != null || datos.datosGobernanza != null)
    ) {
      datos.datosGobernanza = null
    }

    const record = await prisma.persona.update({
      where: { id },
      data: datos as never,
    })
    // AD: la poda de gobernanza se audita recién cuando la escritura quedó
    // persistida. Una única emisión aunque el helper de validación y el
    // epílogo hayan coincidido en la misma request.
    await auditarPodaGobernanza(scope, existente, record)
    return Response.json(record)
  } catch (e) {
    return errorGenerico(e)
  }
}

/** DELETE: 409 si la persona tiene vínculos de unidad asociados. */
export async function DELETE(req: Request, ctx: CtxTipo): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  const { id } = await ctx.params
  const corto = await abortarResidenteAjeno(scope.rol, scope.usuarioId, id)
  if (corto) return corto
  const denegado = denegar(scope.rol, "eliminar")
  if (denegado) return denegado

  try {
    const existente = await prisma.persona.findUnique({ where: { id } })
    if (!existente || existente.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    const vinculos = await prisma.vinculoUnidad.count({
      where: { comunidadId: scope.comunidadId, personaId: id },
    })
    if (vinculos > 0) {
      return jsonError(
        409,
        `No se puede eliminar la persona: ${vinculos} vínculo(s) de unidad asociado(s).`
      )
    }
    await prisma.persona.delete({ where: { id } })
    return Response.json({ ok: true })
  } catch (e) {
    return errorGenerico(e)
  }
}
