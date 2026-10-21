/**
 * /api/controles-propiedad/[id] — detalle/actualización/baja de un control AD.
 *
 * - GET: gestión todo; residente solo si el control es de su unidad.
 * - PUT parcial: se fusiona y revalida el ControlPropiedadSchema completo;
 *   respeta la unicidad por unidad. Solo administrador/directiva.
 * - DELETE (borrado lógico, decisión owner 2026-10-21): admin/comité desestiman;
 *   nunca se borra la fila. Copia a `ControlPropiedadArchivada` + auditoría.
 */
import { ControlPropiedadSchema } from "@/lib/schemas"
import { z } from "zod"
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
import { generarId } from "@/lib/id-utils"
import { logger } from "@/lib/logger"

type CtxTipo = { params: Promise<{ id: string }> }

/** Motivo opcional del borrado lógico (body del DELETE). */
const MotivoDesestimacionSchema = z.object({
  motivo: z
    .string({ invalid_type_error: "El motivo debe ser texto." })
    .trim()
    .min(1, "El motivo no puede estar vacío.")
    .max(500, "El motivo no puede exceder 500 caracteres.")
    .optional(),
})

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
          estado: "vigente", // desestimados no bloquean re-registro
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

/**
 * DELETE por id (borrado lógico, decisión owner 2026-10-21: admin y comité
 * pueden, pero nunca se borra una fila). En una transacción: copia íntegra a
 * `ControlPropiedadArchivada` con motivo opcional y actor de la sesión, el
 * control queda en estado `desestimada`, y se emite `AD_CONTROL_DESESTIMADO`.
 * Segunda llamada sobre un control ya desestimado → 404, igual que inexistente.
 */
export async function DELETE(req: Request, ctx: CtxTipo): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  const { id } = await ctx.params

  // Motivo opcional del body; inválido → 400 (nunca se archiva un motivo sucio).
  // DELETE sin body es válido: equivale a "sin motivo", no a un body inválido.
  const body: unknown = await req.json().catch(() => null)
  const motivoParseado = MotivoDesestimacionSchema.safeParse(body ?? {})
  if (!motivoParseado.success) {
    return jsonError(400, "Motivo inválido.", {
      detalles: motivoParseado.error.flatten(),
    })
  }
  const motivo = motivoParseado.data.motivo ?? null

  try {
    const archivado = await prisma.$transaction(async (tx) => {
      const record = await tx.controlPropiedad.findUnique({ where: { id } })
      if (!record || record.comunidadId !== scope.comunidadId) {
        return null
      }
      if (!puedeGestionarControles(scope.rol, "eliminar")) {
        return "denegado"
      }
      if (record.estado === "desestimada") {
        return null
      }
      // Copia íntegra ANTES de marcar; si el archivo falla no se marca nada.
      // `estado` no va al archivo: solo se archiva lo vigente, así que el valor
      // sería redundante con la existencia misma de la fila archivada.
      // SAFETY: `record` es la fila completa del modelo Prisma ControlPropiedad;
      // se copia plano al modelo de archivo, que tiene los mismos campos salvo `estado`.
      const datos = { ...(record as unknown as Record<string, unknown>) }
      delete datos.estado
      await tx.controlPropiedadArchivada.create({
        data: {
          ...datos,
          motivo,
          actorUsuarioId: scope.usuarioId,
        } as never,
      })
      await tx.controlPropiedad.update({
        where: { id },
        data: { estado: "desestimada" },
      })
      // Auditoría (categoría AD, patrón de periodos-directiva; nunca bloquea).
      try {
        await tx.eventoAuditoria.create({
          data: {
            id: generarId("ev"),
            comunidadId: scope.comunidadId,
            timestamp: new Date().toISOString(),
            usuario: scope.usuarioId,
            categoria: "AD",
            tipoAccion: "AD_CONTROL_DESESTIMADO",
            referenciaId: id,
            descripcion: motivo
              ? `Control de propiedad desestimado (unidad ${record.unidadId}): ${motivo}.`
              : `Control de propiedad desestimado (unidad ${record.unidadId}) con copia en el archivo.`,
          },
        })
      } catch (e) {
        logger.error(
          { err: e },
          "[api/controles-propiedad] no se pudo registrar AD_CONTROL_DESESTIMADO"
        )
      }
      return record
    })
    if (archivado === "denegado") return jsonError(403, "Permiso denegado.")
    if (!archivado) return jsonError(404, "Registro no encontrado.")
    return Response.json({ ok: true })
  } catch (e) {
    // id ya presente en el archivo (id reutilizado) → sin doble copia.
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return jsonError(409, "El control ya tiene una copia archivada.")
    }
    return errorControles(e)
  }
}
