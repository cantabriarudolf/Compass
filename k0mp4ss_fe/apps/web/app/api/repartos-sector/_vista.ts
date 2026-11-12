/**
 * `_vista.ts` — la forma en que se devuelve un reparto por sector (F32).
 *
 * El alta y la lectura devuelven lo mismo: el reparto con su sector, su período,
 * su concepto, el monto total y el avalúo total PERSISTIDOS, y sus cuotas. Los dos
 * totales salen de la fila, no de una segunda suma calculada al leer: son el
 * snapshot del momento en que se emitió, y una revalorización posterior de una
 * unidad no reescribe lo emitido.
 *
 * El número de unidad y el nombre del sector los resuelve la ruta en consultas
 * fijas (no hay relación Prisma desde la cuota hacia la unidad, a propósito: el
 * reparto guarda el avalúo que usó y no depende de la fila viva).
 */

/** Cuota ya persistida, en la forma mínima que la vista necesita. */
export interface CuotaDelRepartoPersistida {
  readonly id: string
  readonly unidadId: string
  readonly avaluoUsado: number
  readonly monto: number
}

/** Reparto ya persistido, en la forma mínima que la vista necesita. */
export interface RepartoSectorPersistido {
  readonly id: string
  readonly microSectorId: string
  readonly periodo: string
  readonly concepto: string
  readonly montoTotal: number
  readonly avaluoTotal: number
  readonly estado: string
  readonly creadoPor: string
  readonly createdAt: Date
}

/** Cuota tal como viaja al cliente, con el número de unidad que la ruta resolvió. */
export interface CuotaEnLaVista {
  readonly id: string
  readonly unidadId: string
  readonly unidadNumero: string | null
  readonly avaluoUsado: number
  readonly monto: number
}

/** Reparto tal como viaja al cliente, con sus cuotas. */
export interface RepartoSectorEnLaVista {
  readonly id: string
  readonly microSectorId: string
  readonly microSectorNombre: string | null
  readonly periodo: string
  readonly concepto: string
  readonly montoTotal: number
  readonly avaluoTotal: number
  readonly estado: string
  readonly creadoPor: string
  readonly createdAt: string
  readonly cuotas: CuotaEnLaVista[]
}

/** Nombres que acompañan al reparto, resueltos por la ruta. */
export interface NombresDelReparto {
  readonly microSectorNombre?: string | null
  /** Número de unidad por id, resuelto para todo el listado en una consulta. */
  readonly numeroPorUnidad?: ReadonlyMap<string, string>
}

/**
 * Arma la vista de un reparto. Las cuotas se ordenan por monto descendente y, a
 * igual monto, por número de unidad: la cuota mayor —la que absorbió el residuo—
 * se lee primero, sin depender del orden en que la base devolvió las filas.
 */
export function vistaDeReparto(
  reparto: RepartoSectorPersistido,
  cuotas: readonly CuotaDelRepartoPersistida[],
  nombres: NombresDelReparto = {}
): RepartoSectorEnLaVista {
  const numeroPorUnidad = nombres.numeroPorUnidad ?? new Map<string, string>()
  const ordenadas = [...cuotas].sort((a, b) => {
    if (b.monto !== a.monto) return b.monto - a.monto
    const numeroA = numeroPorUnidad.get(a.unidadId) ?? a.unidadId
    const numeroB = numeroPorUnidad.get(b.unidadId) ?? b.unidadId
    return numeroA.localeCompare(numeroB)
  })
  return {
    id: reparto.id,
    microSectorId: reparto.microSectorId,
    microSectorNombre: nombres.microSectorNombre ?? null,
    periodo: reparto.periodo,
    concepto: reparto.concepto,
    montoTotal: reparto.montoTotal,
    avaluoTotal: reparto.avaluoTotal,
    estado: reparto.estado,
    creadoPor: reparto.creadoPor,
    createdAt: reparto.createdAt.toISOString(),
    cuotas: ordenadas.map((cuota) => ({
      id: cuota.id,
      unidadId: cuota.unidadId,
      unidadNumero: numeroPorUnidad.get(cuota.unidadId) ?? null,
      avaluoUsado: cuota.avaluoUsado,
      monto: cuota.monto,
    })),
  }
}
