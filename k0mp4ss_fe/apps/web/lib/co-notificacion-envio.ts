/**
 * co-notificacion-envio — la notificación in-app que el envío masivo de CO manda.
 *
 * La spec de CO («Envío Masivo con Filtros Dinámicos de Destinatarios») dice que el
 * envío «materializa una notificación por destinatario vía `notify()` con canal
 * `email_simulado`». Hasta F45 el alta sólo persistía `EnvioCO` y encolaba el correo:
 * la bandeja del residente nunca recibía el mensaje masivo, así que el envío existía y
 * no llegaba.
 *
 * Desde T5 (`odd/tasks/un-camino-de-entrega.md`, S1 y S3) el aviso no se escribe
 * acá: entra por el puente único `avisar()` (`lib/entrega/notificar.ts`), que escribe
 * la `Notificacion` Y su constancia de entrega `visor`/`entregado` en
 * `entregas_notificacion`. Este módulo conserva lo que es delgada propiedad de CO —el
 * id determinista `not-co-<envío>-<persona>` y el rol de bandeja que sale de los
 * roles REALES de la persona— y delega el resto.
 *
 * Corre **dentro de la transacción del alta** (`POST /api/co/envios`), junto al
 * snapshot de destinatarios y a la cola: o queda el envío con sus notificaciones, o no
 * queda nada (S3b: el aviso no tiene red de por medio, así que puede vivir en la
 * transacción del llamador; el correo sale después, por la cola).
 *
 * El `destinatarioRol` sale de los roles REALES de la persona (`Persona.roles`), no de
 * una constante: es lo que `lib/api/notificaciones-scope.ts` usa cuando la notificación
 * no tiene destinatario puntual. El mapeo es el de ese módulo, no una copia: un
 * propietario entra como `residente` porque la bandeja del residente acepta
 * `residente` y `propietario`.
 */
import type { Prisma } from "@prisma/client"
import { avisar } from "@/lib/entrega/notificar"
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
 * Id determinista del aviso de un envío a una persona: `not-co-<envío>-<persona>`.
 *
 * La disciplina es la misma que `notificarEnvioCO` ya tenía y que
 * `asegurarAvisosActaPublicada` (GD) copió: reenviar o reeditar el mismo envío no
 * duplica el mensaje en la bandeja de nadie. El drenaje de la cola usa este mismo id
 * para colgar el intento de correo del aviso que lo anuncia (S3).
 */
export function idNotificacionEnvioCO(envioId: string, personaId: string): string {
  return `not-co-${envioId}-${personaId}`
}

/**
 * Crea (idempotente) una notificación por destinatario, por el puente único.
 *
 * El id determinista es la idempotencia: si el aviso ya existe, acá no se escribe
 * NADA —ni la notificación ni una segunda constancia de visor, que declararía una
 * entrega que no ocurrió—. La notificación es el mensaje original, no una copia del
 * estado actual del envío.
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
    const notificacionId = idNotificacionEnvioCO(datos.envioId, destinatario.personaId)
    const existente = await tx.notificacion.findFirst({
      where: { id: notificacionId, comunidadId: datos.comunidadId },
      select: { id: true },
    })
    if (!existente) {
      // S1: el aviso y su fila de visor salen por el puente, dentro de la
      // transacción del alta (S3b: no hay red de por medio).
      await avisar(tx, {
        notificacionId,
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
      })
    }
    aseguradas++
  }
  return aseguradas
}
