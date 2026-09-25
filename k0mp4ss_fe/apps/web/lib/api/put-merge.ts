/**
 * put-merge — PUT parcial con validación de objeto completo (BD-FUENTE-VERDAD Fase 4).
 *
 * La factory (`crud-factory`) exige schemas ZodObject para su PUT (aplica
 * `.partial()`), pero varios schemas de dominio son ZodEffects (`.refine` de
 * negocio: ElementoRA, AvisoCV, PlantillaCV…). Este helper implementa el PUT
 * parcial sin `.partial()`: fusiona el parche sobre el registro existente y
 * valida el objeto COMPLETO, de modo que los refinamientos de negocio se
 * siguen cumpliendo en actualizaciones parciales.
 *
 * Contrato idéntico al resto de la serie:
 * - `comunidadId` desde sesión, jamás del body.
 * - Authz `editar` antes de tocar Prisma.
 * - Registro de otra comunidad → 404 (sin filtrar existencia).
 * - Claves desconocidas (createdAt/updatedAt de Prisma) las poda Zod.
 */
import type { z } from "zod"
import { logger } from "@/lib/logger"
import type { Accion } from "@/lib/authz"
import {
  jsonError,
  withComunidadScope,
} from "./with-comunidad-scope"
import type { AuthzCheck, CrudDelegate } from "./crud-factory"

export interface PutMergeConfig {
  model: CrudDelegate
  schema: z.ZodType
  authzCheck?: AuthzCheck
  recurso?: string
}

type Ctx = { params: Promise<{ id: string }> }

/**
 * Crea un handler PUT parcial: fusiona parche + existente y valida completo.
 */
export function createPutMerge(config: PutMergeConfig) {
  const { model, schema, authzCheck, recurso } = config

  return async function PUT(req: Request, ctx: Ctx): Promise<Response> {
    const resultado = await withComunidadScope()
    if (!resultado.ok) return resultado.response
    const scope = resultado.scope

    const body: unknown = await req.json().catch(() => null)
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return jsonError(400, "Cuerpo JSON inválido.")
    }

    const { id } = await ctx.params
    try {
      const existente = (await model.findUnique({
        where: { id },
      })) as Record<string, unknown> | null
      if (!existente || existente.comunidadId !== scope.comunidadId) {
        return jsonError(404, "Registro no encontrado.")
      }
      if (authzCheck && !authzCheck(scope.rol, "editar" as Accion)) {
        return jsonError(403, "Permiso denegado.")
      }

      // Fusión parche + existente; Zod poda claves de Prisma (createdAt…).
      // Los NULL de BD equivalen a "ausente" para los opcionales de Zod
      // (optional acepta undefined, no null); se podan salvo que el parche
      // los envíe explícitamente (ahí valida el schema y falla si no admite null).
      const parche = body as Record<string, unknown>
      const base: Record<string, unknown> = {}
      for (const [clave, valor] of Object.entries(existente)) {
        if (valor === null && !(clave in parche)) continue
        base[clave] = valor
      }
      const fusionado = { ...base, ...parche }
      const parsed = schema.safeParse(fusionado)
      if (!parsed.success) {
        return jsonError(400, "Datos inválidos.", {
          detalles: parsed.error.flatten(),
        })
      }
      // SAFETY: parsed.data ya pasó safeParse del schema; solo se podan id/comunidadId.
      const datos = { ...(parsed.data as Record<string, unknown>) }
      delete datos.id
      delete datos.comunidadId
      const actualizado = await model.update({
        where: { id },
        data: datos,
      })
      return Response.json(actualizado)
    } catch (e) {
      if (
        typeof e === "object" &&
        e !== null &&
        "code" in e &&
        (e as { code: string }).code === "P2002"
      ) {
        return jsonError(409, "Conflicto: registro duplicado.")
      }
      logger.error(
        { err: e, recurso },
        "[api/put-merge] error inesperado"
      )
      return jsonError(500, "Error interno del servidor.")
    }
  }
}
