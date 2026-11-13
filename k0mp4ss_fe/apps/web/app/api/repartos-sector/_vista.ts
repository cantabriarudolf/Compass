/**
 * `_vista.ts` — la forma en que se devuelve un reparto por sector (F32).
 *
 * El alta y la lectura devuelven lo mismo: el reparto con su sector, su período,
 * su concepto, el monto total y el avalúo total PERSISTIDOS, sus cuotas —cada una
 * con el `CobroFI` que produjo (S7), que es la deuda que el sistema cobra— y la
 * lista de unidades que quedaron FUERA. Los dos totales salen de la fila, no de una
 * segunda suma calculada al leer: son el snapshot del momento en que se emitió, y
 * una revalorización posterior de una unidad no reescribe lo emitido.
 *
 * `unidadesExcluidas` se LEE de la columna y nunca se deriva del padrón de hoy: una
 * unidad dada de alta en el sector después de la emisión no existía cuando el
 * reparto se emitió, así que mostrarla como excluida sería falso. Por la misma
 * razón la vista no cruza las cuotas con las unidades del sector: el complemento
 * de las cuotas de HOY no es la exclusión de AYER.
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
  /**
   * `CobroFI` que la cuota produjo (S7). `null` = la cuota quedó en cero y no hay
   * deuda que cobrar, o el reparto se emitió antes de que existiera el vínculo.
   */
  readonly cobroId: string | null
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
  /**
   * Columna `Json` con el snapshot de las unidades sin avalúo al emitir. Se recibe
   * como `unknown` a propósito: la vista no confía en la forma del valor guardado
   * y la valida antes de exponerla.
   */
  readonly unidadesExcluidas: unknown
}

/** Cuota tal como viaja al cliente, con el número de unidad que la ruta resolvió. */
export interface CuotaEnLaVista {
  readonly id: string
  readonly unidadId: string
  readonly unidadNumero: string | null
  readonly avaluoUsado: number
  readonly monto: number
  /** La deuda que la cuota produjo: el `CobroFI` que el sistema cobra. */
  readonly cobroId: string | null
}

/**
 * Unidad que quedó FUERA del reparto al emitirse: no tenía avalúo fiscal declarado
 * (ni `null` ni un valor <= 0 entran a la regla), así que no paga su parte y no se
 * la compensa. Es el snapshot congelado, no el padrón de hoy.
 */
export interface UnidadExcluidaEnLaVista {
  readonly unidadId: string
  readonly unidadNumero: string
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
  readonly unidadesExcluidas: UnidadExcluidaEnLaVista[]
}

/** Nombres que acompañan al reparto, resueltos por la ruta. */
export interface NombresDelReparto {
  readonly microSectorNombre?: string | null
  /** Número de unidad por id, resuelto para todo el listado en una consulta. */
  readonly numeroPorUnidad?: ReadonlyMap<string, string>
}

/**
 * Lee el snapshot persistido de las unidades excluidas.
 *
 * La columna la escribe el alta con `[{ unidadId, unidadNumero }]`. Se lee TAL CUAL
 * y no se cruza con las unidades actuales del sector: hacerlo convertiría una foto
 * en un cálculo y señalaría como excluida a una unidad que se dio de alta después
 * de la emisión. Una entrada con otra forma se descarta en vez de inventar una
 * exclusión que el reparto no declaró.
 */
function leerUnidadesExcluidas(valor: unknown): UnidadExcluidaEnLaVista[] {
  if (!Array.isArray(valor)) return []
  const excluidas: UnidadExcluidaEnLaVista[] = []
  for (const entrada of valor) {
    if (typeof entrada !== "object" || entrada === null) continue
    const registro = entrada as Record<string, unknown>
    const unidadId = registro.unidadId
    const unidadNumero = registro.unidadNumero
    if (typeof unidadId !== "string" || typeof unidadNumero !== "string") {
      continue
    }
    excluidas.push({ unidadId, unidadNumero })
  }
  return excluidas
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
      // El vínculo a la deuda se lee de la fila, no se busca al armar la vista: si
      // la cuota no produjo un cobro, no se inventa uno.
      cobroId: cuota.cobroId ?? null,
    })),
    unidadesExcluidas: leerUnidadesExcluidas(reparto.unidadesExcluidas),
  }
}
