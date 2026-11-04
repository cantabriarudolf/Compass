/**
 * lib/reglamento.ts — versión vigente del reglamento del cobro (T3).
 *
 * S1/S3: cada comunidad declara su forma de contribución en una versión del
 * reglamento, con el instrumento que la funda y el período desde el que rige.
 * S2: los números del cobro (días de pago, reserva, mora, corte, IPC) viven en
 * `parametros`, no en el código. S4: la emisión usa la versión que rige su
 * período y guarda los valores con los que calculó.
 *
 * `versionReglamentoVigente` es pura (sin IO): el resolver se testea con
 * fixtures y la ruta usa el wrapper Prisma, que solo trae las filas de una
 * comunidad y delega la decisión acá.
 */
import type { VersionReglamento as VersionReglamentoBD } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  FUENTES_INSTRUMENTO_REALES,
  ParametrosReglamentoSchema,
  type ParametrosCobroReglamento,
} from "@/lib/schemas"

/** Lo mínimo que el resolver necesita de una versión (sirve para fixtures). */
export interface VersionReglamentoConVigencia {
  version: number
  vigenteDesde: string
}

/** Cliente Prisma mínimo: el singleton o el `tx` de una transacción. */
type ClienteReglamento = Pick<typeof prisma, "versionReglamento">

/**
 * Devuelve la versión que rige `periodo`: la de `vigenteDesde` más alto que no
 * lo supere. `vigenteDesde` y `periodo` son AAAA-MM, así que el orden
 * lexicográfico es el orden cronológico. Si dos versiones comparten período de
 * inicio, gana la de número mayor. Sin versión aplicable → null (S1: no se
 * puede emitir).
 */
export function versionReglamentoVigente<T extends VersionReglamentoConVigencia>(
  versiones: readonly T[],
  periodo: string
): T | null {
  let vigente: T | null = null
  for (const candidata of versiones) {
    if (candidata.vigenteDesde > periodo) continue
    if (
      vigente === null ||
      candidata.vigenteDesde > vigente.vigenteDesde ||
      (candidata.vigenteDesde === vigente.vigenteDesde &&
        candidata.version > vigente.version)
    ) {
      vigente = candidata
    }
  }
  return vigente
}

/**
 * Compuerta de emisión (S1): solo una fuente real funda la forma de
 * contribución. `migracion_automatica` materializa el comportamiento heredado
 * y NO habilita la emisión: la comunidad debe declarar su instrumento.
 */
export function autorizaEmision(version: { fuenteInstrumento: string }): boolean {
  return (FUENTES_INSTRUMENTO_REALES as readonly string[]).includes(
    version.fuenteInstrumento
  )
}

/**
 * Parámetros tipados de la versión, o null si la fila no los declara completos.
 * Una versión sin números válidos no puede gobernar una emisión (S2). El tipo
 * incluye `reservaIncluidaEnPresupuesto`, que el esquema completa con la
 * lectura normativa cuando la versión persistida no lo trae (S5).
 */
export function parametrosDeVersion(version: {
  parametros: unknown
}): ParametrosCobroReglamento | null {
  const parsed = ParametrosReglamentoSchema.safeParse(version.parametros)
  return parsed.success ? parsed.data : null
}

/** Trae las versiones de la comunidad y resuelve la que rige `periodo`. */
export async function versionReglamentoVigenteDeComunidad(
  comunidadId: string,
  periodo: string,
  client: ClienteReglamento = prisma
): Promise<VersionReglamentoBD | null> {
  const versiones = await client.versionReglamento.findMany({
    where: { comunidadId },
  })
  return versionReglamentoVigente(versiones, periodo)
}
