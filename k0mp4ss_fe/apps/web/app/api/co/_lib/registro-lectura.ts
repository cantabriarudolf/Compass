/**
 * registro-lectura — confirmación de lectura de un envío CO (change
 * co-lectura-residente, decisión D3 del design).
 *
 * La tabla `EnvioDestinatarioCO` es la única fuente de verdad: la lectura se
 * marca con un **update condicional** sobre la fila del destinatario y
 * `EnvioCO.lecturas` (JSON) se reescribe derivada de la tabla, en la misma
 * transacción.
 *
 * Por qué no se toca el array JSON directamente (lo que hacía la ruta antes de
 * este change): leer-modificar-escribir el array completo pierde lecturas
 * concurrentes — dos destinatarios leen a la vez, ambos leen el mismo array y el
 * segundo pisa al primero. Con una fila por destinatario cada lectura es
 * independiente y el filtro `leidoEn: null` la vuelve idempotente.
 */
import { prisma } from "@/lib/prisma"

export interface ResultadoLectura {
  /** Destinatarios con lectura registrada en el envío, después de esta llamada. */
  leidos: number
  /** `true` si esta llamada fue la que escribió la fecha (primera lectura). */
  primeraLectura: boolean
}

/**
 * Registra la lectura de `personaId` en `envioId`.
 *
 * El llamador ya validó que `personaId` es destinatario en la tabla; acá se
 * vuelve a condicionar el update a `leidoEn: null` para que dos lecturas
 * simultáneas de la MISMA persona no se pisen entre sí.
 */
export async function registrarLecturaDestinatario(
  envioId: string,
  personaId: string
): Promise<ResultadoLectura> {
  return prisma.$transaction(async (tx) => {
    const marcado = await tx.envioDestinatarioCO.updateMany({
      where: { envioId, personaId, leidoEn: null },
      data: { leidoEn: new Date() },
    })

    // Derivada: el JSON nunca se lee como fuente, se recalcula desde la tabla.
    const leidos = await tx.envioDestinatarioCO.findMany({
      where: { envioId, leidoEn: { not: null } },
      select: { personaId: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    })
    const personaIds = leidos.map((d) => d.personaId)
    await tx.envioCO.update({
      where: { id: envioId },
      data: { lecturas: personaIds as never },
    })

    return { leidos: personaIds.length, primeraLectura: marcado.count > 0 }
  })
}
