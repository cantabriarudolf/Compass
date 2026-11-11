/**
 * S1 — la multa de vigencia sale del maestro de infracciones **de la comunidad**.
 *
 * El monto no vive en el código ni en un segundo maestro de multas: cada
 * comunidad declara en su propio maestro (`TipoInfraccionIN`) el tipo canónico
 * con el valor que fija *su* reglamento y el ancla legal que lo respalda. Si la
 * comunidad no lo declaró —o lo declaró sin monto— el sistema lo dice y **no
 * multa**: inventar un número es exactamente lo que este módulo evita.
 *
 * La decisión no se reimplementa acá: `multaDisponible` (regla pura de
 * `lib/vigencia-registro.ts`) es el contrato, y este cargador sólo le entrega la
 * fila del maestro y le agrega el ancla legal para que una pantalla pueda
 * mostrar de dónde viene el número.
 */
import { prisma } from "@/lib/prisma"
import {
  multaDisponible,
  type DisponibilidadDeMulta,
} from "@/lib/vigencia-registro"

/**
 * Nombre canónico del tipo en el maestro. Exacto: la administración lo declara
 * así, y no hay un segundo nombre ni un alias que active la multa por accidente.
 */
export const NOMBRE_TIPO_MULTA_VIGENCIA =
  "Registro de Copropietarios no actualizado"

export type MultaDeVigencia = DisponibilidadDeMulta & {
  /** Artículo del reglamento o acta que fija el monto; `null` si no consta. */
  readonly referenciaLegal: string | null
}

/**
 * Disponibilidad de la multa de vigencia para una comunidad, con su ancla legal.
 *
 * Una sola consulta por comunidad (nunca una por unidad). Si el maestro tiene
 * más de una fila con ese nombre —el maestro no impone unicidad— prevalece la
 * última editada, que es la declaración vigente.
 */
export async function multaDeVigenciaDeLaComunidad(
  comunidadId: string
): Promise<MultaDeVigencia> {
  const tipo = await prisma.tipoInfraccionIN.findFirst({
    where: { comunidadId, nombre: NOMBRE_TIPO_MULTA_VIGENCIA },
    select: { nombre: true, valor: true, referenciaLegal: true },
    orderBy: { updatedAt: "desc" },
  })

  return {
    ...multaDisponible(tipo),
    referenciaLegal: tipo?.referenciaLegal ?? null,
  }
}
