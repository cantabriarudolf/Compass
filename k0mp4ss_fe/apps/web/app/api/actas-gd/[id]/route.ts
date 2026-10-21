/**
 * /api/actas-gd/[id] — detalle/actualización/baja de un acta GD (Fase 2).
 *
 * - GET: administrador/directiva todo; residente solo publicadas con
 *   autorización AD (residenteVeActas).
 * - PUT parcial: se fusiona con el registro y se revalida el ActaGDSchema
 *   completo; si trae presentes/ausentes se revalida la membresía vigente.
 * - DELETE (borrado lógico, decisión owner 2026-10-21): admin/comité desestiman;
 *   nunca se borra la fila. Copia a `ActaGDArchivada` + evento de auditoría.
 */
import { ActaGDSchema } from "@/lib/schemas"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { puedeGestionarActas, residentesVenActas } from "@/lib/api/gd-guard"
import { generarId } from "@/lib/id-utils"
import {
  errorActas,
  limpiarPayloadActa,
  validarAsistentesYPeriodo,
} from "../route"

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
    // El estado `desestimada` solo lo escribe el DELETE (borrado lógico con
    // copia de archivo y auditoría); un PUT no puede forzarlo ni reactivar
    // un acta desestimada (queda archivada, igual que en el DELETE).
    if (
      existente.estado === "desestimada" ||
      parsed.data.estado === "desestimada"
    ) {
      return jsonError(
        400,
        "El estado desestimada solo se establece al eliminar el acta (borrado lógico)."
      )
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

/**
 * DELETE por id (borrado lógico, decisión owner 2026-10-21: admin y comité
 * pueden, pero nunca se borra una fila). En una transacción: copia íntegra a
 * `ActaGDArchivada` con motivo opcional y actor de la sesión, el acta queda en
 * estado `desestimada`, y se emite el evento `GD_ACTA_DESESTIMADA`. Segunda
 * llamada sobre un acta ya desestimada → 404, igual que inexistente.
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
    const archivada = await prisma.$transaction(async (tx) => {
      const record = await tx.actaGD.findUnique({ where: { id } })
      if (!record || record.comunidadId !== scope.comunidadId) {
        return null
      }
      if (!puedeGestionarActas(scope.rol, "eliminar")) {
        return "denegado"
      }
      if (record.estado === "desestimada") {
        return null
      }
      // Paridad con la regla previa: un acta publicada forma parte del libro y no
      // se desestima por DELETE.
      if (record.estado === "publicada") {
        return "publicada"
      }
      // Copia íntegra ANTES de marcar; si el archivo falla no se marca nada.
      // SAFETY: la fila tiene exactamente los campos del modelo de archivo.
      await tx.actaGDArchivada.create({
        data: {
          ...record,
          motivo,
          actorUsuarioId: scope.usuarioId,
        } as never,
      })
      await tx.actaGD.update({
        where: { id },
        data: { estado: "desestimada" },
      })
      // Auditoría (categoría GD, patrón de periodos-directiva; nunca bloquea).
      try {
        await tx.eventoAuditoria.create({
          data: {
            id: generarId("ev"),
            comunidadId: scope.comunidadId,
            timestamp: new Date().toISOString(),
            usuario: scope.usuarioId,
            categoria: "GD",
            tipoAccion: "GD_ACTA_DESESTIMADA",
            referenciaId: id,
            descripcion: motivo
              ? `Acta GD desestimada (${record.estado}): ${motivo}.`
              : `Acta GD desestimada (${record.estado}) con copia en el archivo.`,
          },
        })
      } catch (e) {
        logger.error(
          { err: e },
          "[api/actas-gd] no se pudo registrar GD_ACTA_DESESTIMADA"
        )
      }
      return record
    })
    if (archivada === "denegado") return jsonError(403, "Permiso denegado.")
    if (archivada === "publicada") {
      return jsonError(409, "El acta está publicada: no se puede desestimar.")
    }
    if (!archivada) return jsonError(404, "Registro no encontrado.")
    return Response.json({ ok: true })
  } catch (e) {
    // id ya presente en el archivo (id reutilizado) → sin doble copia.
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return jsonError(409, "El acta ya tiene una copia archivada.")
    }
    return errorActas(e)
  }
}
