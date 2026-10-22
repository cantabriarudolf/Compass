/**
 * _cobranza.ts — utilidades compartidas de la COBRANZA FI multicanal
 * (SERIE-FASE2 §V5).
 *
 * Módulo co-locado (no es una ruta de Next): resuelve el scope de comunidad, el
 * permiso del recurso, los INTERRUPTORES de canal (global de la comunidad y por
 * residente) y emite los eventos de auditoría con el mismo shape que
 * `registrarEvento` del store legacy (categoría "FI", `usuario` = sesión).
 *
 * Decisiones del plan que están codificadas acá (no reinterpretar):
 * - Canales fijos: **visor interno** y **email**. Un canal apagado no se usa y
 *   queda registrado el motivo (`ResolucionCanal`).
 * - Canal activo = interruptor **global** ∧ preferencia **del residente**.
 *   El apagado más restrictivo gana: no hay forma de saltear el interruptor
 *   global desde la preferencia individual.
 * - **Sin emisor SMTP** el email queda en outbox `pendiente` y nunca se reporta
 *   como enviado.
 * - Authz: `fi:cobranza` (administrador ejecuta, comité solo `ver`) y
 *   `fi:cobranza:propia` (el residente decide su propio canal, ABAC en la ruta).
 */
import { puede, type Accion } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { generarId } from "@/lib/id-utils"
import type { CanalCobranzaFI } from "@/lib/schemas"
import {
  jsonError,
  withComunidadScope,
  type ComunidadScope,
  type ScopeResult,
} from "@/lib/api/with-comunidad-scope"

/** Cobranza de la comunidad: el administrador la ejecuta, el comité la audita. */
export const RECURSO_COBRANZA = "fi:cobranza"
/** Preferencia de canal del propio residente (ABAC: solo su persona). */
export const RECURSO_COBRANZA_PROPIA = "fi:cobranza:propia"

/** Interruptores de canal (global de la comunidad o de un residente). */
export interface CanalesCobranzaFI {
  visor: boolean
  email: boolean
}

/** Resultado de resolver UN canal para UNA gestión concreta. */
export type ResolucionCanal =
  | { activo: true }
  | { activo: false; motivo: string }

export type CanalesResueltosFI = Record<CanalCobranzaFI, ResolucionCanal>

export type ContextoCobranza =
  | { ok: true; scope: ComunidadScope }
  | { ok: false; response: Response }

/**
 * Contexto server-side de una acción de cobranza: sesión + membresía + permiso
 * sobre `fi:cobranza` (por defecto `ver`).
 */
export async function contextoCobranza(
  accion: Accion = "ver"
): Promise<ContextoCobranza> {
  const resultado: ScopeResult = await withComunidadScope()
  if (!resultado.ok) return resultado
  if (!puede(resultado.scope.rol, accion, RECURSO_COBRANZA)) {
    return { ok: false, response: jsonError(403, "Permiso denegado.") }
  }
  return { ok: true, scope: resultado.scope }
}

/**
 * Interruptor GLOBAL de la comunidad. Sin fila se asume **encendido**: la
 * comunidad que nunca configuró la cobranza conserva el comportamiento previo
 * (visor + email), que es lo que hacía la acción legacy del store.
 */
export async function leerInterruptorGlobal(
  comunidadId: string
): Promise<CanalesCobranzaFI> {
  const config = await prisma.configuracionCobranzaFI.findUnique({
    where: { comunidadId },
    select: { canalVisor: true, canalEmail: true },
  })
  return {
    visor: config?.canalVisor ?? true,
    email: config?.canalEmail ?? true,
  }
}

/**
 * Preferencia del RESIDENTE (destinatario). Sin fila también se asume
 * encendido: el residente que nunca eligió recibe lo mismo que antes.
 */
export async function leerPreferenciaCanal(
  comunidadId: string,
  personaId: string
): Promise<CanalesCobranzaFI> {
  const preferencia = await prisma.preferenciaCanalCobranzaFI.findUnique({
    where: { comunidadId_personaId: { comunidadId, personaId } },
    select: { canalVisor: true, canalEmail: true },
  })
  return {
    visor: preferencia?.canalVisor ?? true,
    email: preferencia?.canalEmail ?? true,
  }
}

/**
 * Resolución de los canales de una gestión: global ∧ preferencia, con el
 * motivo textual de cada canal que quedó fuera (se guarda en la respuesta, en
 * el evento de auditoría y, cuando aplica, en el `motivo` del envío).
 */
export function resolverCanalesCobranza(
  global: CanalesCobranzaFI,
  residente: CanalesCobranzaFI
): CanalesResueltosFI {
  const resolver = (
    canal: CanalCobranzaFI,
    nombreGlobal: string
  ): ResolucionCanal => {
    if (!global[canal]) {
      return {
        activo: false,
        motivo: `Interruptor global de la comunidad apagado para el canal ${nombreGlobal}.`,
      }
    }
    if (!residente[canal]) {
      return {
        activo: false,
        motivo: `El residente apagó el canal ${nombreGlobal} en su preferencia individual.`,
      }
    }
    return { activo: true }
  }
  return {
    visor: resolver("visor", "visor interno"),
    email: resolver("email", "email"),
  }
}

/**
 * Clave de idempotencia de un envío: unidad + destinatario + canal.
 *
 * Reenviar la misma cobranza NO duplica el envío ya registrado; el reenvío
 * explícito agrega un sufijo con el instante (`:reenvio:<epoch>`) y queda
 * marcado con `reenvio: true` para distinguirlo en el historial.
 */
export function claveEnvioCobranza(input: {
  unidadId: string
  personaId: string
  canal: CanalCobranzaFI
  reenvioEn?: number
}): string {
  const base = `${input.unidadId}:${input.personaId}:${input.canal}`
  return input.reenvioEn === undefined ? base : `${base}:reenvio:${input.reenvioEn}`
}

/** Emite UN evento de auditoría FI (con `client` se integra a la transacción). */
export function registrarEventoCobranza(
  scope: ComunidadScope,
  tipoAccion: string,
  referenciaId: string,
  descripcion: string,
  client: Pick<typeof prisma, "eventoAuditoria"> = prisma
): Promise<unknown> {
  return client.eventoAuditoria.create({
    data: {
      id: generarId("ev"),
      comunidadId: scope.comunidadId,
      timestamp: new Date().toISOString(),
      usuario: scope.usuarioId,
      categoria: "FI",
      tipoAccion,
      referenciaId,
      descripcion,
    },
  })
}

/** Formato CLP usado en los textos de la gestión (paridad con la UI). */
export function clp(n: number): string {
  return `$${Math.round(n).toLocaleString("es-CL")}`
}
