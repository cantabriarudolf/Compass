/**
 * /api/configuracion — singleton de ConfiguracionGlobal por comunidad
 * (BD-FUENTE-VERDAD Fase 5A).
 *
 * GET: devuelve la config existente de la comunidad (404 si no hay).
 * PUT: upsert — crea si no existe, update si existe.
 *
 * S1 (`odd/tasks/identidad-unica.md`): `ConfiguracionGlobal.nombreComunidad` está
 * DEPRECADA. La fuente única del nombre es `Comunidad.nombre`:
 *   · GET la OMITE de la fila (`omit`) y completa `nombreComunidad` con el nombre de
 *     la comunidad, para que el formulario y los papeles conserven su shape;
 *   · PUT usa `ConfiguracionGlobalEscrituraSchema`, que excluye el campo: no se
 *     edita por acá. La columna se escribe UNA sola vez, al crear la fila, como
 *     snapshot congelado de `Comunidad.nombre`; después nadie la actualiza.
 * Renombrar la comunidad es `PUT /api/comunidad-actual`.
 *
 * Authz: recurso "cf" (admin full, comité ver, residente sin acceso).
 * No POST ni DELETE: solo hay una config por comunidad.
 */
import { ConfiguracionGlobalEscrituraSchema } from "@/lib/schemas"
import { configuracionDefault } from "@/data/admin/configuracion"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import {
  jsonError,
  withComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { registrarEventoAuditoria } from "@/lib/auditoria"
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
    const [comunidad, config] = await Promise.all([
      prisma.comunidad.findUnique({
        where: { id: scope.comunidadId },
        select: { nombre: true },
      }),
      prisma.configuracionGlobal.findUnique({
        where: { comunidadId: scope.comunidadId },
        // La columna deprecada no se lee: el nombre se proyecta desde la comunidad.
        omit: { nombreComunidad: true },
      }),
    ])
    if (!comunidad) {
      return jsonError(404, "Comunidad no encontrada.")
    }
    if (!config) {
      return jsonError(404, "Configuración no encontrada.")
    }
    return Response.json({ ...config, nombreComunidad: comunidad.nombre })
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

  const parsed = ConfiguracionGlobalEscrituraSchema.partial().safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }

  const datos = parsed.data as Record<string, unknown>
  delete datos.id
  delete datos.comunidadId
  // Defensa explícita: el schema de escritura ya excluye el nombre, pero si el
  // shape cambia, la columna deprecada no se escribe nunca (S1).
  delete datos.nombreComunidad

  try {
    const [configActual, comunidad] = await Promise.all([
      prisma.configuracionGlobal.findUnique({
        where: { comunidadId: scope.comunidadId },
      }),
      prisma.comunidad.findUnique({
        where: { id: scope.comunidadId },
        select: { nombre: true },
      }),
    ])
    if (!comunidad) {
      return jsonError(404, "Comunidad no encontrada.")
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

    const registro = configActual
      ? await prisma.configuracionGlobal.update({
          where: { comunidadId: scope.comunidadId },
          data: datos as Prisma.ConfiguracionGlobalUpdateInput,
        })
      : await prisma.configuracionGlobal.create({
          data: {
            ...defaults,
            // Snapshot congelado de la fuente única (S1): se escribe una sola vez,
            // acá. Ningún lector lo usa y ninguna actualización lo reescribe.
            nombreComunidad: comunidad.nombre,
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
        await registrarEventoAuditoria({
          id: generarId("ev"),
          comunidadId: scope.comunidadId,
          timestamp: new Date().toISOString(),
          usuario: scope.usuarioId,
          categoria: "CF",
          tipoAccion: "CF_UPDATE_PARAM",
          referenciaId: registro.id,
          descripcion: `Parámetros legales de remuneraciones actualizados: ${cambios.join("; ")}.`,
        })
      } catch (e) {
        logger.error({ err: e }, "[configuracion] no se pudo registrar CF_UPDATE_PARAM")
      }
    }

    return Response.json(
      // Mismo shape que el GET: el nombre es la proyección de la fuente única (S1),
      // nunca la columna deprecada que acaba de quedar (o seguir) congelada.
      { ...registro, nombreComunidad: comunidad.nombre },
      { status: configActual ? 200 : 201 }
    )
  } catch (e) {
    logger.error({ err: e }, "[configuracion] error PUT")
    return jsonError(500, "Error interno del servidor.")
  }
}
