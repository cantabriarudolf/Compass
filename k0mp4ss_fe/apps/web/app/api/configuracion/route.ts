/**
 * /api/configuracion — singleton de ConfiguracionGlobal por comunidad
 * (BD-FUENTE-VERDAD Fase 5A).
 *
 * GET: devuelve la config existente de la comunidad (404 si no hay).
 * PUT: upsert — crea si no existe, update si existe.
 *
 * Authz: recurso "cf" (admin full, comité ver, residente sin acceso).
 * No POST ni DELETE: solo hay una config por comunidad.
 */
import { ConfiguracionGlobalSchema } from "@/lib/schemas"
import { configuracionDefault } from "@/data/admin/configuracion"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import {
  jsonError,
  withComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { logger } from "@/lib/logger"
import crypto from "node:crypto"
import type { Prisma } from "@prisma/client"

export async function GET(): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  if (!puede(scope.rol, "ver", "cf")) {
    return jsonError(403, "Permiso denegado.")
  }

  try {
    const config = await prisma.configuracionGlobal.findUnique({
      where: { comunidadId: scope.comunidadId },
    })
    if (!config) {
      return jsonError(404, "Configuración no encontrada.")
    }
    return Response.json(config)
  } catch (e) {
    logger.error({ err: e }, "[configuracion] error GET")
    return jsonError(500, "Error interno del servidor.")
  }
}

export async function PUT(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  if (!puede(scope.rol, "editar", "cf")) {
    return jsonError(403, "Permiso denegado.")
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError(400, "Cuerpo JSON inválido.")
  }

  const parsed = ConfiguracionGlobalSchema.partial().safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }

  const datos = parsed.data as Record<string, unknown>
  delete datos.id
  delete datos.comunidadId

  try {
    const configActual = await prisma.configuracionGlobal.findUnique({
      where: { comunidadId: scope.comunidadId },
    })

    if (configActual) {
      const actualizado = await prisma.configuracionGlobal.update({
        where: { comunidadId: scope.comunidadId },
        data: datos as Prisma.ConfiguracionGlobalUpdateInput,
      })
      return Response.json(actualizado)
    }

    // Creación inicial: defaults del seed (válidos según schema, de modo que
    // el form puede reenviar la fila completa sin 400).
    const defaults: Omit<
      Prisma.ConfiguracionGlobalCreateInput,
      "id" | "comunidadId" | "comunidad"
    > = {
      ...configuracionDefault,
      smtpPassword: "",
      claveEliminacionMaestro: "",
    }

    const creado = await prisma.configuracionGlobal.create({
      data: {
        ...defaults,
        ...datos,
        id: crypto.randomUUID(),
        comunidadId: scope.comunidadId,
      },
    })
    return Response.json(creado, { status: 201 })
  } catch (e) {
    logger.error({ err: e }, "[configuracion] error PUT")
    return jsonError(500, "Error interno del servidor.")
  }
}
