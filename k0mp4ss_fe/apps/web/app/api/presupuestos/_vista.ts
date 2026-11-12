/**
 * `_vista.ts` — la forma en que se devuelve un presupuesto por partidas (F31).
 *
 * El alta y la lectura tienen que devolver lo mismo: el presupuesto con su
 * período, el cuerpo que lo aprobó (copiado del acuerdo), su versión y estado, el
 * total y sus partidas ordenadas. El total de la vista es el `total` PERSISTIDO:
 * es el snapshot aprobado, no una segunda suma calculada al leer. Si alguna
 * partida cambiara después del alta, lo aprobado no se reescribe.
 */

/** Partida ya persistida, en la forma mínima que la vista necesita. */
export interface PartidaDelPresupuestoPersistida {
  readonly id: string
  readonly nombre: string
  readonly categoria: string
  readonly monto: number
  readonly orden: number
}

/** Presupuesto ya persistido, en la forma mínima que la vista necesita. */
export interface PresupuestoPersistido {
  readonly id: string
  readonly periodo: string
  readonly cuerpo: string
  readonly acuerdoId: string
  readonly version: number
  readonly estado: string
  readonly total: number
  readonly creadoPor: string
  readonly createdAt: Date
}

/** Partida tal como viaja al cliente. */
export interface PartidaEnLaVista {
  readonly id: string
  readonly nombre: string
  readonly categoria: string
  readonly monto: number
  readonly orden: number
}

/** Presupuesto tal como viaja al cliente, con sus partidas. */
export interface PresupuestoEnLaVista {
  readonly id: string
  readonly periodo: string
  readonly cuerpo: string
  readonly acuerdoId: string
  readonly version: number
  readonly estado: string
  readonly total: number
  readonly creadoPor: string
  readonly createdAt: string
  readonly partidas: PartidaEnLaVista[]
  /** Folio del acuerdo que lo aprueba, resuelto por la ruta en consultas fijas. */
  readonly acuerdoFolio: string | null
}

/** Nombres que acompañan al presupuesto, resueltos por la ruta. */
export interface NombresDelPresupuesto {
  readonly acuerdoFolio?: string | null
}

/**
 * Arma la vista de un presupuesto. Las partidas se ordenan por `orden` acá (no en
 * el llamador): el desglose se lee en el orden en que se aprobó.
 */
export function vistaDePresupuesto(
  presupuesto: PresupuestoPersistido,
  partidas: readonly PartidaDelPresupuestoPersistida[],
  nombres: NombresDelPresupuesto = {}
): PresupuestoEnLaVista {
  const ordenadas = [...partidas].sort((a, b) => a.orden - b.orden)
  return {
    id: presupuesto.id,
    periodo: presupuesto.periodo,
    cuerpo: presupuesto.cuerpo,
    acuerdoId: presupuesto.acuerdoId,
    version: presupuesto.version,
    estado: presupuesto.estado,
    total: presupuesto.total,
    creadoPor: presupuesto.creadoPor,
    createdAt: presupuesto.createdAt.toISOString(),
    partidas: ordenadas.map((partida) => ({
      id: partida.id,
      nombre: partida.nombre,
      categoria: partida.categoria,
      monto: partida.monto,
      orden: partida.orden,
    })),
    acuerdoFolio: nombres.acuerdoFolio ?? null,
  }
}
