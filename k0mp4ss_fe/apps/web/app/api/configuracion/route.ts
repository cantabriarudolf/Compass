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
import { generarId } from "@/lib/id-utils"
import crypto from "node:crypto"
import type { Prisma } from "@prisma/client"

/** Parámetros legales de remuneraciones (PL) auditados con `CF_UPDATE_PARAM`. */
const PARAMETROS_LEGALES = [
  "ufMensual",
  "ingresoMinimoMensual",
  "topeGratificacionLegal",
  "tasaSIS",
] as const

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

    const registro = configActual
      ? await prisma.configuracionGlobal.update({
          where: { comunidadId: scope.comunidadId },
          data: datos as Prisma.ConfiguracionGlobalUpdateInput,
        })
      : await prisma.configuracionGlobal.create({
          data: {
            ...defaults,
            ...datos,
            id: crypto.randomUUID(),
            comunidadId: scope.comunidadId,
          },
        })

    // Auditoría `CF_UPDATE_PARAM` (certificado por PL): solo los parámetros
    // legales cuyo valor cambia, con old/new. Patrón de las rutas que emiten
    // evento a mano; la emisión no bloquea una escritura ya persistida.
    const anteriores = (configActual ?? {}) as Record<string, unknown>
    const cambios = PARAMETROS_LEGALES.flatMap((campo) => {
      if (!(campo in datos)) return []
      const anterior = anteriores[campo] ?? null
      const nuevo = datos[campo] ?? null
      return anterior === nuevo
        ? []
        : [`${campo}: ${anterior ?? "(sin valor)"} → ${nuevo ?? "(sin valor)"}`]
    })
    if (cambios.length > 0) {
      try {
        await prisma.eventoAuditoria.create({
          data: {
            id: generarId("ev"),
            comunidadId: scope.comunidadId,
            timestamp: new Date().toISOString(),
            usuario: scope.usuarioId,
            categoria: "CF",
            tipoAccion: "CF_UPDATE_PARAM",
            referenciaId: registro.id,
            descripcion: `Parámetros legales de remuneraciones actualizados: ${cambios.join("; ")}.`,
          },
        })
      } catch (e) {
        logger.error({ err: e }, "[configuracion] no se pudo registrar CF_UPDATE_PARAM")
      }
    }

    return Response.json(registro, { status: configActual ? 200 : 201 })
  } catch (e) {
    logger.error({ err: e }, "[configuracion] error PUT")
    return jsonError(500, "Error interno del servidor.")
  }
}
