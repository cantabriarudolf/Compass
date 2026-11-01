/**
 * lib/auditoria.ts — ÚNICA puerta de ESCRITURA de la bitácora (`EventoAuditoria`).
 *
 * INV-03 (`docs/INVARIANTES.md`, fila `EventoAuditoria`): la forma mínima del
 * evento vive en `EventoAuditoriaSchema` desde la capa de datos, pero el schema
 * no tenía dueño. Treinta sitios armaban el objeto a mano y
 * `/api/auditoria/sync` hacía `upsert` sin validar, así que un evento con
 * `descripcion` vacía o sin `referenciaId` entraba igual y la lectura posterior
 * (`/api/auditoria`, `/api/mis-datos`, el peritaje legal) no podía confiar en la
 * forma del rastro.
 *
 * Este módulo es la puerta, no un helper más:
 * - `registrarEventoAuditoria` — alta normal (`create`), para todo writer.
 * - `upsertEventoAuditoria` — ingesta en lote idempotente por `id`
 *   (`/api/auditoria/sync`, que importa eventos ya emitidos por el cliente).
 *
 * Las dos validan ANTES de escribir: si el payload no cumple el contrato lanzan
 * `Error` con el detalle de Zod y no dejan fila escrita. Los llamadores que
 * envuelven la emisión en try/catch para que la auditoría nunca rompa la
 * operación (patrón de `app/api/mis-datos/route.ts`) lo conservan tal cual, y el
 * `client` opcional acepta el `tx` de `prisma.$transaction` para que los sitios
 * transaccionales sigan siendo atómicos.
 */
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { EventoAuditoriaSchema, IdEntidadSchema } from "@/lib/schemas"

/**
 * Contrato de la FILA que se persiste: la forma mínima del evento
 * (`EventoAuditoriaSchema`, dueño de los 7 campos) más `comunidadId`, que es la
 * clave foránea obligatoria del modelo y siempre sale del scope del servidor.
 */
export const EventoAuditoriaRegistradoSchema = EventoAuditoriaSchema.extend({
  comunidadId: IdEntidadSchema,
})

/** Evento completo, tal como queda en la bitácora. */
export type EventoAuditoriaRegistrado = z.infer<
  typeof EventoAuditoriaRegistradoSchema
>

/** Cliente Prisma mínimo: el singleton o el `tx` de `prisma.$transaction`. */
export type ClienteAuditoria = Pick<typeof prisma, "eventoAuditoria">

/**
 * Valida el evento completo contra el contrato y devuelve la forma canónica.
 * Lanza con el detalle de Zod: un evento inválido nunca llega a la base.
 */
function validarEvento(
  evento: EventoAuditoriaRegistrado
): EventoAuditoriaRegistrado {
  const parsed = EventoAuditoriaRegistradoSchema.safeParse(evento)
  if (parsed.success) return parsed.data
  const detalle = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "(evento)"}: ${issue.message}`)
    .join("; ")
  throw new Error(`Evento de auditoría inválido: ${detalle}`)
}

/**
 * Emite UN evento de auditoría (alta). Es la única puerta de `create` de la
 * bitácora: valida con `EventoAuditoriaSchema` y escribe con
 * `client.eventoAuditoria.create`. Con `client` = `tx` se integra a la
 * transacción del llamador.
 */
export async function registrarEventoAuditoria(
  evento: EventoAuditoriaRegistrado,
  client: ClienteAuditoria = prisma
): Promise<EventoAuditoriaRegistrado> {
  const data = validarEvento(evento)
  await client.eventoAuditoria.create({ data })
  return data
}

/**
 * Emite VARIOS eventos en UNA sola sentencia (`createMany`).
 *
 * Valida todos ANTES de escribir: si uno solo rompe el contrato, no se escribe
 * ninguno (todo o nada, como el `createMany` que reemplaza). Existe para los
 * sitios que emiten N eventos de un mismo efecto, sin perder atomicidad.
 */
export async function registrarEventosAuditoria(
  eventos: EventoAuditoriaRegistrado[],
  client: ClienteAuditoria = prisma
): Promise<EventoAuditoriaRegistrado[]> {
  if (eventos.length === 0) return []
  const data = eventos.map(validarEvento)
  await client.eventoAuditoria.createMany({ data })
  return data
}

/**
 * Emite UN evento de auditoría de forma idempotente por `id` (upsert). Es la
 * puerta de la ingesta en lote (`/api/auditoria/sync`): misma validación que
 * `registrarEventoAuditoria`, sin cambiar la semántica del sync (el segundo
 * envío del mismo `id` actualiza la fila en vez de duplicarla).
 */
export async function upsertEventoAuditoria(
  evento: EventoAuditoriaRegistrado,
  client: ClienteAuditoria = prisma
): Promise<EventoAuditoriaRegistrado> {
  const data = validarEvento(evento)
  const { id, ...resto } = data
  await client.eventoAuditoria.upsert({
    where: { id },
    create: data,
    update: resto,
  })
  return data
}
