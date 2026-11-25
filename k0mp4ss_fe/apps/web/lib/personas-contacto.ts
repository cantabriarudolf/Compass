/**
 * personas-contacto — la ÚNICA resolución de correos por persona.
 *
 * Por qué existe (T1 de `odd/tasks/un-camino-de-entrega.md`): seis sitios
 * repetían `persona.findMany({ select: { id, email } })` con variantes —uno
 * devolvía el mapa con `undefined` para el correo vacío, otro no recortaba los
 * espacios—, así que una regla nueva (recortar, no cruzar el tenant, incluir a
 * quien no tiene dirección) tenía seis lugares donde quedar desactualizada. T3
 * adopta esta definición en los cinco call sites que hoy no mandan correo.
 *
 * Reglas que no se reinterpretan:
 * - **Una sola consulta por lote.** Nada de N+1: el llamador pide todos los ids
 *   de una vez.
 * - **El mapa es TOTAL.** Todo id pedido tiene entrada: la persona sin dirección
 *   (o sin fila en esta comunidad) vale `""`. Nunca `undefined`, nunca una
 *   dirección inventada: la ausencia de correo es un hecho que el llamador
 *   declara con su motivo, no un hueco que se rellena.
 * - **El tenant no se cruza.** El `where` filtra por `comunidadId`: pedir la
 *   persona de otra comunidad devuelve `""` en vez de filtrar su dirección.
 * - **El correo se recorta.** Se devuelve `email.trim()`, que es la forma en la
 *   que el emisor SMTP y los registros de entrega lo necesitan.
 * - **El cliente es del llamador.** El tercer argumento permite resolver dentro
 *   de la transacción que escribe el aviso (`Prisma.TransactionClient`), así el
 *   correo leído y la notificación que lo usa son la misma foto. Sin él usa el
 *   cliente global.
 */
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

/**
 * Correo recortado de cada persona pedida, indexado por `personaId`.
 *
 * Los ids que no tienen fila en la comunidad (o ninguna fila) entran con `""`,
 * igual que una persona sin dirección: el llamador no distingue «no existe» de
 * «no tiene correo», porque para la entrega son el mismo hecho —no hay a dónde
 * mandar—. Un `Map` vacío si no se pidió ningún id.
 */
export async function correosDePersonas(
  comunidadId: string,
  personaIds: readonly string[],
  cliente: Prisma.TransactionClient = prisma
): Promise<Map<string, string>> {
  const ids = [...new Set(personaIds)]
  const correos = new Map<string, string>(ids.map((id) => [id, ""]))
  if (ids.length === 0) return correos

  const personas = await cliente.persona.findMany({
    where: { comunidadId, id: { in: ids } },
    select: { id: true, email: true },
  })
  for (const persona of personas) {
    correos.set(persona.id, persona.email.trim())
  }
  return correos
}
