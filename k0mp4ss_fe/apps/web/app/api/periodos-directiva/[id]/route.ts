/**
 * /api/periodos-directiva/[id] — detalle/actualización/baja de un período (Fase 2).
 *
 * Contrato preservado de Fase 0 (tests): GET_ONE scoped, PUT parcial,
 * DELETE de un vigente → 409, DELETE de un cerrado → 200.
 * Reglas nuevas del libro:
 * - La nómina de un período "cerrado" está congelada (PUT con miembros → 409).
 * - Un cerrado no se reabre (PUT/POST con estado vigente → 409; usar cerrar).
 * - Pasar a vigente por PUT exige nómina válida y que no haya otro vigente.
 * - DELETE de un cerrado con actas asociadas (periodoId) → 409.
 */
import { PeriodoDirectivaSchema } from "@/lib/schemas"
import type { z } from "zod"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { periodoVigenteDb } from "@/lib/api/gd-guard"
import {
  errorPeriodos,
  limpiarPayloadPeriodo,
  rotarVigente,
  validarNomina,
} from "../route"

type CtxTipo = { params: Promise<{ id: string }> }

/** GET un período por id (scoped). */
export async function GET(_req: Request, ctx: CtxTipo): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  if (!puede(scope.rol, "ver", "gd")) {
    return jsonError(403, "Permiso denegado.")
  }
  const { id } = await ctx.params
  try {
    const record = await prisma.periodoDirectiva.findUnique({ where: { id } })
    if (!record || record.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    return Response.json(record)
  } catch (e) {
    return errorPeriodos(e)
  }
}

/** PUT parcial por id (nómina congelada si está cerrado). */
export async function PUT(req: Request, ctx: CtxTipo): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  const { id } = await ctx.params

  const body: unknown = await req.json().catch(() => null)
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return jsonError(400, "Cuerpo JSON inválido.")
  }
  const cambios = body as Record<string, unknown>

  try {
    const existente = await prisma.periodoDirectiva.findUnique({ where: { id } })
    if (!existente || existente.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    if (!puede(scope.rol, "editar", "gd")) {
      return jsonError(403, "Permiso denegado.")
    }

    // Nómina congelada al cerrar: el libro archivado no se reescribe.
    if (existente.estado === "cerrado" && "miembros" in cambios) {
      return jsonError(
        409,
        "La nómina de un período cerrado está congelada (historia del libro)."
      )
    }
    if (existente.estado === "cerrado" && cambios.estado === "vigente") {
      return jsonError(409, "Un período cerrado no se puede reabrir.")
    }

    if ("miembros" in cambios) {
      const nominaValidada = await validarNomina(cambios.miembros, scope)
      if (!nominaValidada.ok) return nominaValidada.response
      if (
        (cambios.estado ?? existente.estado) === "vigente" &&
        (nominaValidada.nomina.length < 3 ||
          nominaValidada.nomina.length % 2 === 0 ||
          nominaValidada.nomina.length > 5)
      ) {
        return jsonError(
          400,
          "La nómina vigente debe ser impar de 3 a 5 miembros (art. 17 Ley 21.442)."
        )
      }
    }
    if (cambios.estado === "vigente" && existente.estado !== "vigente") {
      const otro = await periodoVigenteDb(scope.comunidadId)
      if (otro && otro.id !== id) {
        return jsonError(
          409,
          "Ya existe otro período vigente: cerralo antes de activar este."
        )
      }
    }

    // PUT parcial validado por campo (el schema completo rige en POST).
    // SAFETY: el contrato exige que el schema sea un z.object de entidad; el cast recupera ZodObject para .partial() y safeParse valida de verdad.
    const parcial = (PeriodoDirectivaSchema as unknown as z.ZodObject<z.ZodRawShape>).partial()
    const parsed = parcial.safeParse(cambios)
    if (!parsed.success) {
      return jsonError(400, "Datos inválidos.", {
        detalles: parsed.error.flatten(),
      })
    }

    // SAFETY: parcial validado por zod; lista blanca de campos persistibles.
    const actualizado = await prisma.periodoDirectiva.update({
      where: { id },
      data: limpiarPayloadPeriodo(
        parsed.data as Record<string, unknown>
      ) as never,
    })

    // Si el PUT trae nómina nueva sobre un vigente, reasigna fichas en MP.
    if ("miembros" in cambios && actualizado.estado === "vigente") {
      const nominaValidada = await validarNomina(cambios.miembros, scope)
      if (nominaValidada.ok) {
        await rotarVigente(scope, id, actualizado.fechaInicio, nominaValidada.nomina)
      }
    }
    return Response.json(actualizado)
  } catch (e) {
    return errorPeriodos(e)
  }
}

/** DELETE por id (vigente → 409; cerrado con actas → 409; si no → 200). */
export async function DELETE(_req: Request, ctx: CtxTipo): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  const { id } = await ctx.params

  try {
    const record = await prisma.periodoDirectiva.findUnique({ where: { id } })
    if (!record || record.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    if (!puede(scope.rol, "eliminar", "gd")) {
      return jsonError(403, "Permiso denegado.")
    }
    if (record.estado === "vigente") {
      return jsonError(
        409,
        "No se puede eliminar un período vigente: cerralo antes (el libro de directiva nunca se borra)."
      )
    }
    const actasAsociadas = await prisma.actaGD.count({
      where: { comunidadId: scope.comunidadId, periodoId: id },
    })
    if (actasAsociadas > 0) {
      return jsonError(
        409,
        `No se puede eliminar: ${actasAsociadas} acta(s) referencian este período (trazabilidad del libro).`
      )
    }
    await prisma.periodoDirectiva.delete({ where: { id } })
    return Response.json({ ok: true })
  } catch (e) {
    return errorPeriodos(e)
  }
}
