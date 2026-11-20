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
 * Firmante (hallazgos #3/#4 de `odd/auditorias/identidad-comunidad.md`, S2 de
 * `odd/tasks/identidad-unica.md`): el firmante que imprimen los papeles se DERIVA
 * de la membresía `administrador` vigente y de la persona del padrón, y viaja en su
 * propio campo `firmante: { nombre, rut } | null` — `null` si la comunidad no tiene
 * administrador designado. Las columnas `administradorResponsable` y
 * `rutAdministrador` están DEPRECADAS: seguirán en la base (nadie las borra), pero
 * no se leen, no se proyectan en la respuesta y PUT no las escribe.
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
import { firmanteDeLaComunidad } from "./_lib/identidad-papel"
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
    const [comunidad, config, firmante] = await Promise.all([
      prisma.comunidad.findUnique({
        where: { id: scope.comunidadId },
        select: { nombre: true },
      }),
      prisma.configuracionGlobal.findUnique({
        where: { comunidadId: scope.comunidadId },
        // Las tres columnas deprecadas no se leen: el nombre se proyecta desde la
        // comunidad y el firmante desde la membresía administrador.
        omit: {
          nombreComunidad: true,
          administradorResponsable: true,
          rutAdministrador: true,
        },
      }),
      firmanteDeLaComunidad(scope.comunidadId),
    ])
    if (!comunidad) {
      return jsonError(404, "Comunidad no encontrada.")
    }
    if (!config) {
      return jsonError(404, "Configuración no encontrada.")
    }
    return Response.json({
      ...config,
      nombreComunidad: comunidad.nombre,
      // El firmante derivado en su propio campo; las dos columnas deprecadas ya no
      // viajan en la respuesta. `null` cuando no hay administrador designado: la
      // pantalla lo muestra y los papeles responden 409 (nunca el texto libre que
      // quedó en la columna).
      firmante: firmante
        ? { nombre: firmante.nombreCompleto, rut: firmante.rut }
        : null,
    })
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
  // Defensa explícita: el schema de escritura ya excluye las tres columnas
  // deprecadas, pero si el shape cambia no se escriben nunca.
  delete datos.nombreComunidad
  delete datos.administradorResponsable
  delete datos.rutAdministrador
  // `firmante` es la proyección derivada: nunca un dato que el formulario escriba.
  delete datos.firmante

  try {
    const [configActual, comunidad, firmante] = await Promise.all([
      prisma.configuracionGlobal.findUnique({
        where: { comunidadId: scope.comunidadId },
      }),
      prisma.comunidad.findUnique({
        where: { id: scope.comunidadId },
        select: { nombre: true },
      }),
      firmanteDeLaComunidad(scope.comunidadId),
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
          // Las columnas deprecadas no vuelven al cliente: mismo shape que el GET.
          omit: { administradorResponsable: true, rutAdministrador: true },
        })
      : await prisma.configuracionGlobal.create({
          data: {
            ...defaults,
            // Snapshots congelados de las fuentes únicas, escritos UNA sola vez al
            // crear la fila: el nombre de la comunidad (S1) y el firmante derivado
            // de la membresía administrador (vacío si todavía no hay). Ningún
            // lector los usa y ninguna actualización los reescribe.
            nombreComunidad: comunidad.nombre,
            administradorResponsable: firmante?.nombreCompleto ?? "",
            rutAdministrador: firmante?.rut ?? "",
            ...datos,
            id: crypto.randomUUID(),
            comunidadId: scope.comunidadId,
          },
          omit: { administradorResponsable: true, rutAdministrador: true },
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
      // Mismo shape que el GET: el nombre y el firmante son la proyección de sus
      // fuentes únicas, nunca las columnas deprecadas que acaban de quedar (o
      // seguir) congeladas en la base.
      {
        ...registro,
        nombreComunidad: comunidad.nombre,
        firmante: firmante
          ? { nombre: firmante.nombreCompleto, rut: firmante.rut }
          : null,
      },
      { status: configActual ? 200 : 201 }
    )
  } catch (e) {
    logger.error({ err: e }, "[configuracion] error PUT")
    return jsonError(500, "Error interno del servidor.")
  }
}
