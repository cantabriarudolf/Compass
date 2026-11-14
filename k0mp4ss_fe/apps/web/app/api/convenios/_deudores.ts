/**
 * Deudor del convenio de pago — el PROPIETARIO VIGENTE de la unidad (F29).
 *
 * Ley 21.442 art. 6: el administrador celebra el convenio con los copropietarios
 * morosos. La deuda es de la UNIDAD —la emiten los `CobroFI` a nombre de la
 * unidad—, pero el deudor que firma es su dueño, así que el deudor se DERIVA de
 * la unidad elegida y no se elige de una lista de personas de la comunidad.
 *
 * El criterio es el que el repositorio ya usa para decidir a quién se le cobra:
 * `propietarioVigenteDeUnidad()` (`lib/entrega-aviso.ts`) filtra por
 * `rol: "propietario"` y `fechaFin` null, ordenado por `fechaInicio` desc. Este
 * módulo repite ese `where` —no lo importa— porque necesita el conjunto COMPLETO:
 * esa función devuelve un solo propietario (el más reciente) y un convenio puede
 * firmarlo cualquiera de los copropietarios vigentes de la unidad.
 *
 * Un vínculo con `fechaFin` es historia (el dueño anterior), y un arrendatario
 * vigente vive en la unidad pero no la debe: ninguno de los dos puede ser el
 * deudor del convenio.
 */
import { prisma } from "@/lib/prisma"

/** Lo mínimo para nombrar al deudor en la pantalla del alta. */
export interface DeudorDeUnidad {
  personaId: string
  nombreCompleto: string
  rut: string
}

/**
 * El criterio de propiedad vigente, en un solo lugar: rol `propietario` y vínculo
 * abierto (`fechaFin` null). Es el mismo `where` de la cobranza FI.
 */
const PROPIETARIO_VIGENTE = { rol: "propietario", fechaFin: null } as const

/**
 * Los propietarios VIGENTES de la unidad, el más reciente primero.
 *
 * Dos consultas fijas —los vínculos y los nombres— y nunca una por vínculo. Una
 * unidad puede tener varios copropietarios y todos son deudores posibles del
 * convenio; una unidad sin ninguno devuelve la lista vacía, que NO es un error:
 * la pantalla lo dice y manda a corregir el registro.
 */
export async function propietariosVigentesDeUnidad(
  comunidadId: string,
  unidadId: string
): Promise<DeudorDeUnidad[]> {
  const vinculos = await prisma.vinculoUnidad.findMany({
    where: { comunidadId, unidadId, ...PROPIETARIO_VIGENTE },
    orderBy: { fechaInicio: "desc" },
    select: { personaId: true },
  })

  const personaIds = [...new Set(vinculos.map((vinculo) => vinculo.personaId))]
  if (personaIds.length === 0) return []

  const personas = await prisma.persona.findMany({
    where: { comunidadId, id: { in: personaIds } },
    select: { id: true, nombreCompleto: true, rut: true },
  })
  const porId = new Map(personas.map((persona) => [persona.id, persona]))

  // El orden del vínculo manda (el más reciente es el propietario actual) y se
  // conserva: es lo que la pantalla usa para preseleccionar cuando hay uno solo.
  return personaIds.flatMap((personaId) => {
    const persona = porId.get(personaId)
    return persona === undefined
      ? []
      : [
          {
            personaId: persona.id,
            nombreCompleto: persona.nombreCompleto,
            rut: persona.rut,
          },
        ]
  })
}

/**
 * `true` si la persona es propietario VIGENTE de la unidad.
 *
 * Es la compuerta del alta (`POST /api/convenios`): sin ella el convenio de una
 * unidad podía quedar firmado por el deudor de otra, que es un registro válido de
 * una deuda ajena.
 */
export async function esPropietarioVigenteDeUnidad(
  comunidadId: string,
  unidadId: string,
  personaId: string
): Promise<boolean> {
  const vinculo = await prisma.vinculoUnidad.findFirst({
    where: { comunidadId, unidadId, personaId, ...PROPIETARIO_VIGENTE },
    select: { id: true },
  })
  return vinculo !== null
}
