/**
 * S1/S4 — la multa de vigencia sale del maestro de infracciones **de la comunidad**
 * y se propone con un acto explícito cuando el caso lo habilita.
 *
 * El monto no vive en el código ni en un segundo maestro de multas: cada
 * comunidad declara en su propio maestro (`TipoInfraccionIN`) el tipo canónico
 * con el valor que fija *su* reglamento y el ancla legal que lo respalda. Si la
 * comunidad no lo declaró —o lo declaró sin monto— el sistema lo dice y **no
 * multa**: inventar un número es exactamente lo que este módulo evita.
 *
 * La decisión no se reimplementa acá: `multaDisponible` y
 * `habilitaPropuestaDeMulta` (reglas puras de `lib/vigencia-registro.ts`) son el
 * contrato, y este módulo sólo entrega la fila del maestro, su ancla legal y la
 * regla pura que dice si la propuesta está permitida (S4).
 */
import { prisma } from "@/lib/prisma"
import {
  habilitaPropuestaDeMulta,
  multaDisponible,
  type DisponibilidadDeMulta,
  type EstadoCasoRegistro,
} from "@/lib/vigencia-registro"

/**
 * Nombre canónico del tipo en el maestro. Exacto: la administración lo declara
 * así, y no hay un segundo nombre ni un alias que active la multa por accidente.
 */
export const NOMBRE_TIPO_MULTA_VIGENCIA =
  "Registro de Copropietarios no actualizado"

/** Cliente Prisma mínimo: el singleton o el `tx` de `prisma.$transaction`. */
export type ClienteTiposInfraccion = Pick<typeof prisma, "tipoInfraccionIN">

export type MultaDeVigencia = DisponibilidadDeMulta & {
  /** Artículo del reglamento o acta que fija el monto; `null` si no consta. */
  readonly referenciaLegal: string | null
  /** Fila del maestro de la que sale el monto; `null` si la comunidad no la declaró. */
  readonly tipoInfraccionId: string | null
}

/**
 * Disponibilidad de la multa de vigencia para una comunidad, con su ancla legal.
 *
 * Una sola consulta por comunidad (nunca una por unidad). Si el maestro tiene
 * más de una fila con ese nombre —el maestro no impone unicidad— prevalece la
 * última editada, que es la declaración vigente.
 */
export async function multaDeVigenciaDeLaComunidad(
  comunidadId: string,
  client: ClienteTiposInfraccion = prisma
): Promise<MultaDeVigencia> {
  const tipo = await client.tipoInfraccionIN.findFirst({
    where: { comunidadId, nombre: NOMBRE_TIPO_MULTA_VIGENCIA },
    select: { id: true, nombre: true, valor: true, referenciaLegal: true },
    orderBy: { updatedAt: "desc" },
  })

  return {
    ...multaDisponible(tipo),
    referenciaLegal: tipo?.referenciaLegal ?? null,
    tipoInfraccionId: tipo?.id ?? null,
  }
}

/**
 * S4 — cuándo se permite proponer la multa.
 *
 * La propuesta nace de un acto explícito de la administración (D5: sin cron) y
 * sólo cuando se cumplen las tres condiciones: el caso está `habilitado_para_multa`
 * (regla pura `habilitaPropuestaDeMulta`), la comunidad declaró el monto con su
 * ancla legal (regla pura `multaDisponible`) y el ciclo no tiene ya una propuesta.
 *
 * Es pura a propósito: recibe el veredicto y la disponibilidad ya resueltos y no
 * consulta la base, para que todo «no» traiga su motivo legible y ninguna ruta
 * tenga que re-derivar la decisión.
 */
export type DecisionDePropuesta =
  | { readonly permitida: true }
  | { readonly permitida: false; readonly motivo: string }

export interface EntradaDePropuesta {
  readonly veredicto: { readonly estado: EstadoCasoRegistro }
  readonly multa: MultaDeVigencia
  readonly propuestaExistente: boolean
}

export function propuestaDeMultaPermitida(
  entrada: EntradaDePropuesta
): DecisionDePropuesta {
  // La propuesta ya escrita manda: un ciclo se propone una sola vez, aunque el
  // estado o el maestro hayan cambiado después.
  if (entrada.propuestaExistente) {
    return {
      permitida: false,
      motivo:
        "Ya hay una propuesta de multa para este ciclo: la multa se propone una sola vez por requerimiento y no se duplica.",
    }
  }

  if (!habilitaPropuestaDeMulta(entrada.veredicto)) {
    return {
      permitida: false,
      motivo: `El caso está en estado «${entrada.veredicto.estado}»: no se propone multa hasta que venzan los 60 días corridos del requerimiento sin actualización ni revalidación.`,
    }
  }

  if (!entrada.multa.disponible) {
    // El motivo sale de la misma regla que decide la disponibilidad (S1): sin
    // monto declarado no se multa y el sistema lo dice.
    return { permitida: false, motivo: entrada.multa.motivo }
  }

  return { permitida: true }
}
