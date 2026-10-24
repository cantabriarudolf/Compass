/**
 * proyeccion-envio — qué campos de un envío CO ve cada rol (change
 * co-lectura-residente, decisión D2 del design).
 *
 * | rol           | filas             | destinatarios[] | lecturas[] | totales |
 * | administrador | toda la comunidad | sí              | sí         | sí      |
 * | comite        | toda la comunidad | no              | no         | sí      |
 * | residente     | solo donde figura | no              | no         | no      |
 *
 * El residente recibe `lecturaPropia` y nada más de lectura: la nómina de
 * destinatarios y el estado de lectura ajeno son datos personales de terceros
 * (dictamen Ley 19.628/21.442 recogido en el proposal, defecto D-1).
 *
 * Pertenencia y lectura se resuelven SIEMPRE sobre `EnvioDestinatarioCO` (la
 * tabla es la única fuente de verdad, D3); `EnvioCO.destinatarios` se copia al
 * response del administrador como snapshot de trazabilidad y `EnvioCO.lecturas`
 * se ignora por completo (está derivada y puede quedar vieja).
 */
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { normalizaRol } from "@/lib/authz"

/** Roles que llegan a estas rutas (los demás no tienen `co` ver en la matriz). */
export type RolProyeccion = "administrador" | "comite" | "residente"

/** Mismo criterio que el motor RBAC; cualquier rol restante cae al menor privilegio. */
export function rolProyeccion(rol: string): RolProyeccion {
  const normalizado = normalizaRol(rol)
  if (normalizado === "administrador") return "administrador"
  if (normalizado === "comite") return "comite"
  return "residente"
}

/** Fila de `EnvioCO` que la proyección necesita (subconjunto de la tabla). */
export interface FilaEnvioCO {
  id: string
  comunidadId: string
  asunto: string
  cuerpo: string
  plantillaId: string | null
  destinatarios: unknown
  fechaEnvio: string
  lecturas: unknown
  createdAt: Date
}

/** Fila de `EnvioDestinatarioCO` que la proyección necesita. */
export interface DestinoEnvioCO {
  envioId: string
  personaId: string
  leidoEn: Date | null
}

/** `where` de la colección según rol; `id: { in: [] }` = "ninguna fila" (residente sin MP). */
export function whereEnvios(
  rol: RolProyeccion,
  comunidadId: string,
  personaId: string | null
): Prisma.EnvioCOWhereInput {
  if (rol !== "residente") return { comunidadId }
  if (!personaId) return { id: { in: [] } }
  return { comunidadId, destinatariosCO: { some: { personaId } } }
}

/** `where` del detalle: el 404 del residente no distingue "ajeno" de "no existe" (S3). */
export function whereEnvioDetalle(
  rol: RolProyeccion,
  comunidadId: string,
  id: string,
  personaId: string | null
): Prisma.EnvioCOWhereInput {
  return { ...whereEnvios(rol, comunidadId, personaId), id }
}

/**
 * Destinos de los envíos pedidos. `personaId` acota la consulta a la fila propia
 * cuando el solicitante es residente (no se traen lecturas de terceros al server).
 */
export async function cargarDestinos(
  envioIds: string[],
  personaId?: string | null
): Promise<DestinoEnvioCO[]> {
  if (envioIds.length === 0) return []
  const where: Prisma.EnvioDestinatarioCOWhereInput = { envioId: { in: envioIds } }
  if (personaId) where.personaId = personaId
  return prisma.envioDestinatarioCO.findMany({
    where,
    select: { envioId: true, personaId: true, leidoEn: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })
}

function personaIdsLeidos(destinos: DestinoEnvioCO[]): string[] {
  const leidos: string[] = []
  for (const destino of destinos) {
    if (destino.leidoEn !== null) leidos.push(destino.personaId)
  }
  return leidos
}

/**
 * Proyecta una fila de envío al shape del rol. `destinos` son las filas de
 * `EnvioDestinatarioCO` de ESE envío (para el residente, solo la suya).
 */
export function proyectarEnvio(
  rol: RolProyeccion,
  fila: FilaEnvioCO,
  destinos: DestinoEnvioCO[]
): Record<string, unknown> {
  const totalDestinatarios = destinos.length
  const lecturas = personaIdsLeidos(destinos)

  if (rol === "administrador") {
    return {
      id: fila.id,
      comunidadId: fila.comunidadId,
      asunto: fila.asunto,
      cuerpo: fila.cuerpo,
      plantillaId: fila.plantillaId,
      // Snapshot inmutable de lo enviado (trazabilidad), no fuente de pertenencia.
      destinatarios: fila.destinatarios,
      fechaEnvio: fila.fechaEnvio,
      // Derivada de la tabla: el JSON persistido no se usa como fuente (D3).
      lecturas,
      createdAt: fila.createdAt,
      totalDestinatarios,
      totalLecturas: lecturas.length,
    }
  }

  if (rol === "comite") {
    return {
      id: fila.id,
      asunto: fila.asunto,
      cuerpo: fila.cuerpo,
      plantillaId: fila.plantillaId,
      fechaEnvio: fila.fechaEnvio,
      createdAt: fila.createdAt,
      totalDestinatarios,
      totalLecturas: lecturas.length,
    }
  }

  return {
    id: fila.id,
    asunto: fila.asunto,
    cuerpo: fila.cuerpo,
    plantillaId: fila.plantillaId,
    fechaEnvio: fila.fechaEnvio,
    createdAt: fila.createdAt,
    lecturaPropia: { leidoEn: destinos[0]?.leidoEn?.toISOString() ?? null },
  }
}
