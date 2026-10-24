/**
 * escritura-envio — alta y edición de envíos CO sobre la tabla de destinatarios.
 *
 * Change co-lectura-residente (tarea 1.6 · D3 del design): `EnvioDestinatarioCO`
 * es la única fuente de verdad de pertenencia y de lectura, así que el alta y la
 * edición escriben la tabla **y** el snapshot `destinatarios` dentro de la misma
 * `$transaction`, y dejan `EnvioCO.lecturas` derivada de la tabla.
 *
 * El `lecturas` que llega del cliente NO se persiste como estado: en el alta se
 * interpreta como "lecturas ya confirmadas" (compatibilidad con el contrato de
 * entrada) y se traduce a `leidoEn` en las filas correspondientes. Las filas de
 * quienes ya habían leído conservan su fecha cuando la nómina se edita: perderla
 * sería borrar un dato de lectura real.
 */
import type { Prisma } from "@prisma/client"
import { generarId } from "@/lib/id-utils"
import type { DestinatarioEnvio } from "@/lib/schemas"

type Tx = Prisma.TransactionClient

export interface DatosEnvioCO {
  id: string
  comunidadId: string
  asunto: string
  cuerpo: string
  plantillaId: string | null
  fechaEnvio: string
  destinatarios: DestinatarioEnvio[]
}

/** Lecturas derivadas de la tabla, en orden estable. */
export async function derivarLecturas(tx: Tx, envioId: string): Promise<string[]> {
  const leidos = await tx.envioDestinatarioCO.findMany({
    where: { envioId, leidoEn: { not: null } },
    select: { personaId: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })
  return leidos.map((d) => d.personaId)
}

/**
 * Reconcilia las filas de destinatarios con la nómina declarada: agrega las
 * nuevas, actualiza la unidad de las que siguen (sin tocar `leidoEn`) y borra
 * las que ya no están.
 */
async function sincronizarDestinatarios(
  tx: Tx,
  envioId: string,
  destinatarios: DestinatarioEnvio[]
): Promise<void> {
  const personaIds = destinatarios.map((d) => d.personaId)
  await tx.envioDestinatarioCO.deleteMany({
    where: { envioId, personaId: { notIn: personaIds } },
  })

  for (const destinatario of destinatarios) {
    await tx.envioDestinatarioCO.upsert({
      where: {
        envioId_personaId: { envioId, personaId: destinatario.personaId },
      },
      // La fila nace SIN leer: la lectura solo la registra el destinatario
      // (POST /api/co/envios/[id]/leer). El alta rechaza `lecturas` del cliente.
      create: {
        id: generarId("ed"),
        envioId,
        personaId: destinatario.personaId,
        unidadId: destinatario.unidadId ?? null,
      },
      // La unidad se refresca; `leidoEn` NUNCA se pisa (una lectura no se deshace).
      update: { unidadId: destinatario.unidadId ?? null },
    })
  }
}

/**
 * Escribe el envío (create o update), sus filas de destinatarios y el `lecturas`
 * derivado, todo en la transacción que abre el llamador.
 */
export async function escribirEnvioCO(
  tx: Tx,
  datos: DatosEnvioCO,
  opciones: { crear: boolean }
): Promise<void> {
  const campos = {
    asunto: datos.asunto,
    cuerpo: datos.cuerpo,
    plantillaId: datos.plantillaId,
    // Snapshot inmutable de lo enviado (trazabilidad); la pertenencia vive en la tabla.
    destinatarios: datos.destinatarios as never,
    fechaEnvio: datos.fechaEnvio,
  }

  if (opciones.crear) {
    await tx.envioCO.create({
      data: {
        ...campos,
        id: datos.id,
        comunidadId: datos.comunidadId,
        // Se escribe derivada al final; arranca vacía para no heredar estado del cliente.
        lecturas: [] as never,
      },
    })
    await sincronizarDestinatarios(tx, datos.id, datos.destinatarios)
  } else {
    await tx.envioCO.update({ where: { id: datos.id }, data: campos })
    await sincronizarDestinatarios(tx, datos.id, datos.destinatarios)
  }

  const lecturas = await derivarLecturas(tx, datos.id)
  await tx.envioCO.update({
    where: { id: datos.id },
    data: { lecturas: lecturas as never },
  })
}
