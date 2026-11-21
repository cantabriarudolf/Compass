/**
 * co-notificacion-envio — la notificación in-app que el envío masivo de CO manda.
 *
 * La spec de CO («Envío Masivo con Filtros Dinámicos de Destinatarios») dice que el
 * envío «materializa una notificación por destinatario vía `notify()` con canal
 * `email_simulado`». Hasta F45 el alta sólo persistía `EnvioCO` y encolaba el correo:
 * la bandeja del residente nunca recibía el mensaje masivo, así que el envío existía y
 * no llegaba.
 *
 * Corre **dentro de la transacción del alta** (`POST /api/co/envios`), junto al
 * snapshot de destinatarios y a la cola: o queda el envío con sus notificaciones, o no
 * queda nada.
 *
 * El `destinatarioRol` sale de los roles REALES de la persona (`Persona.roles`), no de
 * una constante: es lo que `lib/api/notificaciones-scope.ts` usa cuando la notificación
 * no tiene destinatario puntual. El mapeo es el de ese módulo, no una copia: un
 * propietario entra como `residente` porque la bandeja del residente acepta
 * `residente` y `propietario`.
 */
import type { Prisma } from "@prisma/client"
import { CANAL_NOTIFICACION_EMAIL_SIMULADO } from "@/lib/schemas"

/** Roles de `Persona.roles` que la bandeja reconoce, en orden de prioridad. */
const ROL_DE_BANDEJA_POR_ROL: ReadonlyArray<readonly [string, string]> = [
  ["directiva", "directiva"],
  ["personal", "personal"],
  ["propietario", "residente"],
  ["residente", "residente"],
]

/** Rol de bandeja que corresponde a los roles de una persona (default: residente). */
export function rolDeBandeja(roles: unknown): string {
  const lista = Array.isArray(roles) ? roles.filter((r): r is string => typeof r === "string") : []
  for (const [rolPersona, rolBandeja] of ROL_DE_BANDEJA_POR_ROL) {
    if (lista.includes(rolPersona)) return rolBandeja
  }
  return "residente"
}

export interface EnvioAVisar {
  readonly comunidadId: string
  readonly envioId: string
  readonly asunto: string
  readonly cuerpo: string
  readonly fecha: string
  readonly destinatarios: ReadonlyArray<{ personaId: string; unidadId?: string }>
}

/**
 * Crea (idempotente) una notificación por destinatario. El id es determinista —
 * `not-co-<envío>-<persona>`—, así que reenviar o reeditar el mismo envío no duplica
 * el mensaje en la bandeja de nadie.
 */
export async function notificarEnvioCO(
  tx: Prisma.TransactionClient,
  datos: EnvioAVisar
): Promise<number> {
  const personaIds = [...new Set(datos.destinatarios.map((d) => d.personaId))]
  if (personaIds.length === 0) return 0

  const personas = await tx.persona.findMany({
    where: { id: { in: personaIds } },
    select: { id: true, roles: true },
  })
  const rolPorPersona = new Map(personas.map((p) => [p.id, rolDeBandeja(p.roles)]))

  let aseguradas = 0
  for (const destinatario of datos.destinatarios) {
    await tx.notificacion.upsert({
      where: { id: `not-co-${datos.envioId}-${destinatario.personaId}` },
      // Ya existe (mismo envío, misma persona): no se toca. La notificación es el
      // mensaje original, no una copia del estado actual del envío.
      update: {},
      create: {
        id: `not-co-${datos.envioId}-${destinatario.personaId}`,
        comunidadId: datos.comunidadId,
        destinatarioRol: rolPorPersona.get(destinatario.personaId) ?? "residente",
        destinatarioPersonaId: destinatario.personaId,
        unidadId: destinatario.unidadId ?? null,
        asunto: datos.asunto,
        cuerpo: datos.cuerpo,
        canal: CANAL_NOTIFICACION_EMAIL_SIMULADO,
        moduloOrigen: "CO",
        fecha: datos.fecha,
        leida: false,
      },
    })
    aseguradas++
  }
  return aseguradas
}
