/**
 * /api/cobros-fi/canales — interruptores de canal de la cobranza FI
 * (SERIE-FASE2 §V5).
 *
 * Dos interruptores, una sola ruta:
 * - **Global de la comunidad** (`ConfiguracionCobranzaFI`): solo el
 *   administrador lo cambia (`fi:cobranza` editar); el comité lo lee.
 * - **Por residente** (`PreferenciaCanalCobranzaFI`, una fila por persona): el
 *   administrador puede fijarla por cualquier persona de su comunidad y cada
 *   residente puede fijar la suya (`fi:cobranza:propia` editar + ABAC de
 *   pertenencia: el cliente NUNCA decide de quién es la preferencia).
 *
 * GET  — global + preferencias visibles para el rol de la sesión
 *        (administrador y comité: todas; residente: solo la propia).
 * PUT  — actualiza el interruptor global (`{ global: {...} }`) o la preferencia
 *        de una persona (`{ personaId, canalVisor?, canalEmail? }`).
 *
 * Sin fila se asume ENCENDIDO en ambos niveles: la comunidad que nunca configuró
 * la cobranza conserva el comportamiento previo (visor + email).
 */
import { z } from "zod"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { IdEntidadSchema } from "@/lib/schemas"
import { personaIdDelUsuarioDb } from "@/lib/api/sesion-persona"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import {
  RECURSO_COBRANZA,
  RECURSO_COBRANZA_PROPIA,
  leerInterruptorGlobal,
  leerPreferenciaCanal,
  registrarEventoCobranza,
} from "../_cobranza"

/** Body del PUT: o el interruptor global, o la preferencia de una persona. */
const EntradaCanalesSchema = z.object({
  global: z
    .object({
      canalVisor: z.boolean().optional(),
      canalEmail: z.boolean().optional(),
    })
    .optional(),
  personaId: IdEntidadSchema.optional(),
  canalVisor: z.boolean().optional(),
  canalEmail: z.boolean().optional(),
})

export async function GET(): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  const veTodas = puede(scope.rol, "ver", RECURSO_COBRANZA)
  const veLaPropia = puede(scope.rol, "ver", RECURSO_COBRANZA_PROPIA)
  if (!veTodas && !veLaPropia) {
    return jsonError(403, "Permiso denegado.")
  }

  try {
    const propio = veLaPropia
      ? await personaIdDelUsuarioDb(scope.usuarioId)
      : null
    const global = await leerInterruptorGlobal(scope.comunidadId)

    if (veTodas) {
      const preferencias = await prisma.preferenciaCanalCobranzaFI.findMany({
        where: { comunidadId: scope.comunidadId },
        orderBy: { personaId: "asc" },
        select: {
          personaId: true,
          canalVisor: true,
          canalEmail: true,
          actualizadoPor: true,
        },
      })
      return Response.json({ global, personas: preferencias, propio: null })
    }

    // Residente: solo su propia preferencia (ABAC de pertenencia).
    const preferencia = propio
      ? await leerPreferenciaCanal(scope.comunidadId, propio)
      : null
    return Response.json({
      global,
      personas: [],
      propio: propio ? { personaId: propio, ...preferencia } : null,
    })
  } catch (e) {
    logger.error({ err: e }, "[api/cobros-fi/canales] error GET")
    return jsonError(500, "Error interno del servidor.")
  }
}

export async function PUT(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  const crudo = await req.json().catch(() => null)
  const parsed = EntradaCanalesSchema.safeParse(crudo ?? {})
  if (!parsed.success) {
    return jsonError(400, "Datos de los canales de cobranza inválidos.")
  }
  const { global, personaId, canalVisor, canalEmail } = parsed.data

  try {
    // 1) Interruptor GLOBAL de la comunidad.
    if (global) {
      if (!puede(scope.rol, "editar", RECURSO_COBRANZA)) {
        return jsonError(403, "Permiso denegado.")
      }
      const previo = await leerInterruptorGlobal(scope.comunidadId)
      const siguiente = {
        canalVisor: global.canalVisor ?? previo.visor,
        canalEmail: global.canalEmail ?? previo.email,
      }
      await prisma.configuracionCobranzaFI.upsert({
        where: { comunidadId: scope.comunidadId },
        create: {
          id: generarId("cfg-cob"),
          comunidadId: scope.comunidadId,
          ...siguiente,
          actualizadoPor: scope.usuarioId,
        },
        update: { ...siguiente, actualizadoPor: scope.usuarioId },
      })
      await registrarEventoCobranza(
        scope,
        "FI_COBRANZA_CHANNEL_CONFIG",
        scope.comunidadId,
        `Interruptor global de cobranza actualizado: visor ${previo.visor ? "on" : "off"} → ${siguiente.canalVisor ? "on" : "off"}, email ${previo.email ? "on" : "off"} → ${siguiente.canalEmail ? "on" : "off"}.`
      )
      return Response.json({
        ok: true,
        global: { visor: siguiente.canalVisor, email: siguiente.canalEmail },
      })
    }

    // 2) Preferencia POR RESIDENTE.
    if (!personaId) {
      return jsonError(
        400,
        "Indicá el interruptor global o la persona cuya preferencia querés cambiar."
      )
    }
    const editaTodas = puede(scope.rol, "editar", RECURSO_COBRANZA)
    if (!editaTodas) {
      const propia = puede(scope.rol, "editar", RECURSO_COBRANZA_PROPIA)
        ? await personaIdDelUsuarioDb(scope.usuarioId)
        : null
      if (!propia || propia !== personaId) {
        return jsonError(403, "Permiso denegado.")
      }
    }

    // La persona debe pertenecer a la comunidad de la sesión (nunca del body).
    const persona = await prisma.persona.findUnique({
      where: { id: personaId },
      select: { id: true, comunidadId: true },
    })
    if (!persona || persona.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }

    const previo = await leerPreferenciaCanal(scope.comunidadId, personaId)
    const siguiente = {
      canalVisor: canalVisor ?? previo.visor,
      canalEmail: canalEmail ?? previo.email,
    }
    await prisma.preferenciaCanalCobranzaFI.upsert({
      where: {
        comunidadId_personaId: { comunidadId: scope.comunidadId, personaId },
      },
      create: {
        id: generarId("pref-cob"),
        comunidadId: scope.comunidadId,
        personaId,
        ...siguiente,
        actualizadoPor: scope.usuarioId,
      },
      update: { ...siguiente, actualizadoPor: scope.usuarioId },
    })
    await registrarEventoCobranza(
      scope,
      "FI_COBRANZA_CHANNEL_PREF",
      personaId,
      `Preferencia de canal de cobranza del residente ${personaId} actualizada: visor ${previo.visor ? "on" : "off"} → ${siguiente.canalVisor ? "on" : "off"}, email ${previo.email ? "on" : "off"} → ${siguiente.canalEmail ? "on" : "off"}.`
    )

    return Response.json({
      ok: true,
      personaId,
      preferencia: {
        visor: siguiente.canalVisor,
        email: siguiente.canalEmail,
      },
    })
  } catch (e) {
    logger.error({ err: e }, "[api/cobros-fi/canales] error PUT")
    return jsonError(500, "Error interno del servidor.")
  }
}
