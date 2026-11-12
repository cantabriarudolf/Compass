/**
 * `_vista.ts` — la forma en que se devuelve un convenio de pago (F29).
 *
 * Las tres rutas de `/api/convenios` (alta, pago y lectura) tienen que devolver lo
 * mismo: un convenio con sus cuotas y los totales PAGADO y PENDIENTE. Los totales
 * se calculan en memoria sobre las cuotas ya leídas —nunca con una consulta por
 * cuota ni con `aggregate`— porque la cuota es la fuente de verdad del dinero del
 * convenio: la suma de las cuotas es el monto total, y un agregado paralelo sería
 * una segunda verdad que puede separarse de las filas.
 *
 * El dinero se opera en CENTAVOS enteros: sumar floats de pesos da $666.666,9999
 * y un total que no cuadra con la última cuota. La conversión es local a esta
 * función, que es la única que suma dinero de un convenio.
 */

/** Cuota ya persistida, en la forma mínima que la vista necesita. */
export interface CuotaDelConvenioPersistida {
  readonly numero: number
  readonly monto: number
  readonly venceEn: Date
  readonly estado: string
  readonly pagadaEn: Date | null
  readonly registradaPor: string | null
}

/** Convenio ya persistido, en la forma mínima que la vista necesita. */
export interface ConvenioPersistido {
  readonly id: string
  readonly unidadId: string
  readonly personaId: string
  readonly acuerdoId: string
  readonly montoTotal: number
  readonly numeroCuotas: number
  readonly fechaSuscripcion: Date
  readonly primeraCuota: number
  readonly estado: string
  readonly observaciones: string | null
}

/** Cuota tal como viaja al cliente. */
export interface CuotaEnLaVista {
  readonly numero: number
  readonly monto: number
  readonly venceEn: string
  readonly estado: string
  readonly pagadaEn: string | null
  readonly registradaPor: string | null
}

/** Convenio tal como viaja al cliente, con lo derivado de sus cuotas. */
export interface ConvenioEnLaVista {
  readonly id: string
  readonly unidadId: string
  readonly personaId: string
  readonly acuerdoId: string
  readonly montoTotal: number
  readonly numeroCuotas: number
  readonly fechaSuscripcion: string
  readonly primeraCuota: number
  readonly estado: string
  readonly observaciones: string | null
  readonly cuotas: CuotaEnLaVista[]
  readonly totales: { readonly pagado: number; readonly pendiente: number }
  /** Nombres para leer el convenio sin tener que cruzar ids a mano. */
  readonly unidadNumero: string | null
  readonly deudorNombre: string | null
  readonly acuerdoFolio: string | null
}

/** Pesos → centavos enteros. */
function aCentavos(monto: number): number {
  return Math.round(monto * 100)
}

/**
 * Totales del convenio derivados de sus cuotas: lo pagado y lo que falta.
 *
 * `pendiente` es la suma de las cuotas NO pagadas (no `montoTotal − pagado`): si
 * alguna cuota quedara fuera del reparto, la resta lo escondería y la suma de las
 * filas lo delata. Como las cuotas suman el monto total, las dos cuentas coinciden
 * y la vista lo puede afirmar.
 */
export function totalesDelConvenio(
  cuotas: readonly { readonly monto: number; readonly estado: string }[]
): { pagado: number; pendiente: number } {
  let pagado = 0
  let pendiente = 0
  for (const cuota of cuotas) {
    if (cuota.estado === "pagada") pagado += aCentavos(cuota.monto)
    else pendiente += aCentavos(cuota.monto)
  }
  return { pagado: pagado / 100, pendiente: pendiente / 100 }
}

/** Nombres que acompañan al convenio, resueltos por la ruta en consultas fijas. */
export interface NombresDelConvenio {
  readonly unidadNumero?: string | null
  readonly deudorNombre?: string | null
  readonly acuerdoFolio?: string | null
}

/**
 * Arma la vista de un convenio. Las cuotas se ordenan por número acá (no en el
 * llamador): la cuota 0 es el pago al suscribir y tiene que leerse primero.
 */
export function vistaDeConvenio(
  convenio: ConvenioPersistido,
  cuotas: readonly CuotaDelConvenioPersistida[],
  nombres: NombresDelConvenio = {}
): ConvenioEnLaVista {
  const ordenadas = [...cuotas].sort((a, b) => a.numero - b.numero)
  return {
    id: convenio.id,
    unidadId: convenio.unidadId,
    personaId: convenio.personaId,
    acuerdoId: convenio.acuerdoId,
    montoTotal: convenio.montoTotal,
    numeroCuotas: convenio.numeroCuotas,
    fechaSuscripcion: convenio.fechaSuscripcion.toISOString(),
    primeraCuota: convenio.primeraCuota,
    estado: convenio.estado,
    observaciones: convenio.observaciones,
    cuotas: ordenadas.map((cuota) => ({
      numero: cuota.numero,
      monto: cuota.monto,
      venceEn: cuota.venceEn.toISOString(),
      estado: cuota.estado,
      pagadaEn: cuota.pagadaEn?.toISOString() ?? null,
      registradaPor: cuota.registradaPor,
    })),
    totales: totalesDelConvenio(ordenadas),
    unidadNumero: nombres.unidadNumero ?? null,
    deudorNombre: nombres.deudorNombre ?? null,
    acuerdoFolio: nombres.acuerdoFolio ?? null,
  }
}
