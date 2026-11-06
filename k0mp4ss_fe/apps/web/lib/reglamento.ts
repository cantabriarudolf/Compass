/**
 * lib/reglamento.ts — versión vigente del reglamento del cobro (T3) y el
 * documento legal que la respalda (F35 serie A, A4 · S9).
 *
 * S1/S3: cada comunidad declara su forma de contribución en una versión del
 * reglamento, con el instrumento que la funda y el período desde el que rige.
 * S2: los números del cobro (días de pago, reserva, mora, corte, IPC) viven en
 * `parametros`, no en el código. S4: la emisión usa la versión que rige su
 * período y guarda los valores con los que calculó.
 * S9: una versión NUEVA no lleva una referencia de acta suelta, apunta al
 * `Documento` legal del archivo que la respalda. `resolverDocumentoRespaldo` es
 * la compuerta de ese enlace y dice CUÁL de los tres motivos falló; las filas
 * históricas conservan `actaRef` y se siguen leyendo igual.
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

/**
 * F35 serie A (A4 · S9) — respaldo documental de una versión NUEVA.
 *
 * Un motivo por cada cosa que puede fallar, para que el rechazo diga cuál fue
 * (y no un «datos inválidos» que obliga a adivinar):
 *   · `faltante`  ⊂ el alta no declaró documento.
 *   · `no_existe` ⊂ ningún documento con ese id en la comunidad. Un documento
 *                   de OTRA comunidad cae acá a propósito: el rechazo no
 *                   confirma que exista (mismo contrato que el resto de la API).
 *   · `no_legal`  ⊂ existe en la comunidad pero es `comunitario`: solo un legal
 *                   respalda la forma de contribución.
 */
export const MENSAJES_DOCUMENTO_REGLAMENTO = {
  faltante:
    "Falta el documento legal que respalda la versión: elegí uno del archivo de la comunidad.",
  no_existe: "El documento indicado no existe en el archivo de esta comunidad.",
  no_legal:
    "El documento indicado no es legal: la versión del reglamento se respalda solo con un documento de naturaleza legal.",
} as const

export type MotivoDocumentoReglamento = keyof typeof MENSAJES_DOCUMENTO_REGLAMENTO

export type RespaldoDocumentoReglamento =
  | { ok: true; documentoId: string }
  | { ok: false; motivo: MotivoDocumentoReglamento }

/** Cliente mínimo del respaldo: solo el delegate `documento`. */
export type ClienteDocumentoReglamento = Pick<typeof prisma, "documento">

/**
 * Resuelve el documento que respalda una versión nueva. El id llega sin validar
 * (viene del cuerpo de la petición), así que se recorta y se compara con el
 * delegate de Prisma: la naturaleza `legal` es la lista cerrada de
 * `lib/documento-archivo.ts`, y la comunidad sale de la sesión, nunca del body.
 */
export async function resolverDocumentoRespaldo(
  comunidadId: string,
  documentoId: unknown,
  client: ClienteDocumentoReglamento = prisma
): Promise<RespaldoDocumentoReglamento> {
  const id = typeof documentoId === "string" ? documentoId.trim() : ""
  if (!id) return { ok: false, motivo: "faltante" }

  const documento = await client.documento.findUnique({
    where: { id },
    select: { id: true, comunidadId: true, naturaleza: true },
  })
  if (!documento || documento.comunidadId !== comunidadId) {
    return { ok: false, motivo: "no_existe" }
  }
  if (documento.naturaleza !== "legal") {
    return { ok: false, motivo: "no_legal" }
  }
  return { ok: true, documentoId: documento.id }
}
