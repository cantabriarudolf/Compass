/**
 * lib/reparto-sector.ts — reparto de un gasto entre las unidades de un sector, en
 * proporción al AVALÚO FISCAL de cada una (F32).
 *
 * REGLA PURA: no consulta la base, no lee el reloj y no escribe nada. Recibe el
 * monto a repartir y el avalúo declarado de cada unidad del sector, y devuelve las
 * cuotas que la ruta persiste. El avalúo es un HECHO catastral de la unidad
 * (`Unidad.avaluoFiscal`): esta regla no lo estima, no lo deduce del metraje ni del
 * `prorrateo`, y no lo reemplaza por un valor por defecto.
 *
 * El caso que la regla existe para resolver: el reglamento de la comunidad manda
 * que el gasto de un bien o servicio que sirve a UN solo sector se cargue sólo a
 * ese sector, en proporción al avalúo fiscal de sus unidades. Repartirlo entre
 * todas las unidades de la comunidad (lo que hace la emisión general) cobra a quien
 * no recibe el servicio.
 *
 * Tres decisiones que, si se dejaran al llamador, cada ruta resolvería distinto:
 *
 *   1. EL DINERO SE REPARTE EN CENTAVOS ENTEROS. Las cuotas se calculan en
 *      centavos y recién al final se convierten a pesos, así que la suma de las
 *      cuotas es EXACTAMENTE el monto total: repartir pesos como floats deja
 *      fracciones de centavo y un gasto que no cierra.
 *   2. LA UNIDAD SIN AVALÚO QUEDA FUERA. `null` significa «no declarado»: no
 *      entra al reparto, no se le asigna 0 y no se la compensa repartiendo en
 *      partes iguales. Asignarle 0 sería cobrarle nada por un gasto que sí la
 *      alcanza; inventarle un avalúo sería inventar un hecho catastral. La unidad
 *      queda pendiente de declarar su avalúo y no aparece en las cuotas.
 *   3. EL RESIDUO VA A LA UNIDAD DE MAYOR AVALÚO. El piso de cada cuota deja un
 *      residuo no negativo (nunca negativo: el piso nunca supera la cuota exacta),
 *      y se lo lleva la unidad de mayor avalúo. Así la suma cierra al centavo sin
 *      cobrar de más a nadie, y con empate de avalúo máximo gana la primera unidad
 *      en el orden recibido: el resultado es determinístico y no depende de cómo
 *      la base devolvió las filas.
 */

/** Unidad en la forma mínima que necesita el reparto. */
export interface UnidadParaRepartir {
  readonly unidadId: string
  /**
   * Avalúo fiscal de la unidad. `null` = no declarado: la unidad queda FUERA del
   * reparto (ver la decisión 2 del encabezado). Un avalúo declarado en cero o
   * negativo tampoco entra: no es un avalúo con el que se pueda prorratear.
   */
  readonly avaluo: number | null
}

/** Entrada del reparto: el monto y las unidades del sector, sin base ni reloj. */
export interface EntradaRepartoSector {
  readonly montoTotal: number
  readonly unidades: readonly UnidadParaRepartir[]
}

/** Cuota del reparto: qué unidad, con qué avalúo (congelado) y por cuánto. */
export interface CuotaDeRepartoSector {
  readonly unidadId: string
  /** El avalúo que se usó para esta cuota, congelado en el momento del reparto. */
  readonly avaluoUsado: number
  readonly monto: number
}

export type DictamenRepartoSector =
  | { readonly permitido: true; readonly cuotas: readonly CuotaDeRepartoSector[] }
  | { readonly permitido: false; readonly motivo: string }

/** Mensajes fijos: describen el contrato, no una fila de nadie. */
const MOTIVO_MONTO_INVALIDO =
  "El monto total a repartir debe ser un número finito mayor a cero."
const MOTIVO_SIN_AVALUO =
  "No se reparte: ninguna unidad del sector tiene avalúo fiscal declarado, y sin avalúo no se reparte en partes iguales."

/** Pesos → centavos enteros (la moneda se opera en su unidad mínima). */
function aCentavos(monto: number): number {
  return Math.round(monto * 100)
}

/** Centavos enteros → pesos (el único lugar donde vuelve a haber decimales). */
function aPesos(centavos: number): number {
  return centavos / 100
}

/** ¿El avalúo declarado sirve para prorratear? (no nulo, finito y mayor a cero) */
function esAvaluoDeclarado(avaluo: number | null): avaluo is number {
  return avaluo !== null && Number.isFinite(avaluo) && avaluo > 0
}

/**
 * Reparte `montoTotal` entre las unidades del sector en proporción a su avalúo
 * fiscal.
 *
 * Devuelve las cuotas (en el orden en que llegaron las unidades elegibles) o el
 * motivo por el que no se reparte. Las unidades sin avalúo declarado no aparecen
 * en las cuotas: no se les asigna 0 ni se reparte el total en partes iguales.
 */
export function repartirPorAvaluo(
  entrada: EntradaRepartoSector
): DictamenRepartoSector {
  const centavosDelMonto = aCentavos(entrada.montoTotal)
  // `Number.isFinite` primero: con NaN la comparación `<= 0` es falsa y el monto
  // inválido pasaría el control.
  if (!Number.isFinite(entrada.montoTotal) || centavosDelMonto <= 0) {
    return { permitido: false, motivo: MOTIVO_MONTO_INVALIDO }
  }

  // Las unidades sin avalúo declarado no se listan siquiera: quedan FUERA del
  // reparto y no reciben una cuota de $0.
  const elegibles: { readonly unidadId: string; readonly avaluo: number }[] = []
  for (const unidad of entrada.unidades) {
    if (esAvaluoDeclarado(unidad.avaluo)) {
      elegibles.push({ unidadId: unidad.unidadId, avaluo: unidad.avaluo })
    }
  }

  const avaluoTotal = elegibles.reduce(
    (total, unidad) => total + unidad.avaluo,
    0
  )
  if (elegibles.length === 0 || !(avaluoTotal > 0)) {
    return { permitido: false, motivo: MOTIVO_SIN_AVALUO }
  }

  // Piso de cada cuota exacta. El piso nunca supera la cuota exacta, así que el
  // residuo (`centavosDelMonto - sumaDePisos`) es no negativo salvo que la
  // división en punto flotante redondee hacia arriba justo en un borde; en ese
  // caso el residuo es -1 y se descuenta del mayor avalúo. La suma sigue siendo
  // exacta en los dos casos: es la suma de pisos más el residuo, por construcción.
  const cuotasEnCentavos = elegibles.map((unidad) => ({
    unidadId: unidad.unidadId,
    avaluoUsado: unidad.avaluo,
    centavos: Math.floor((centavosDelMonto * unidad.avaluo) / avaluoTotal),
  }))

  // Unidad de MAYOR avalúo: con empate gana la PRIMERA recibida (la comparación es
  // estricta), así el resultado es determinístico y no depende del orden de la base.
  let indiceMayorAvaluo = 0
  let mayorAvaluo = 0
  cuotasEnCentavos.forEach((cuota, indice) => {
    if (cuota.avaluoUsado > mayorAvaluo) {
      mayorAvaluo = cuota.avaluoUsado
      indiceMayorAvaluo = indice
    }
  })

  const sumaDePisos = cuotasEnCentavos.reduce(
    (total, cuota) => total + cuota.centavos,
    0
  )
  const residuo = centavosDelMonto - sumaDePisos

  return {
    permitido: true,
    cuotas: cuotasEnCentavos.map((cuota, indice) => ({
      unidadId: cuota.unidadId,
      avaluoUsado: cuota.avaluoUsado,
      monto: aPesos(
        indice === indiceMayorAvaluo ? cuota.centavos + residuo : cuota.centavos
      ),
    })),
  }
}

/**
 * Suma de los avalúos congelados en las cuotas: el `avaluoTotal` del reparto.
 *
 * Existe para que la ruta no vuelva a leer los avalúos al persistir: lo que se
 * guarda es el avalúo que el reparto usó, no el que la unidad tenga después (una
 * revalorización posterior no reescribe un reparto emitido).
 */
export function avaluoTotalDeCuotas(
  cuotas: readonly CuotaDeRepartoSector[]
): number {
  return cuotas.reduce((total, cuota) => total + cuota.avaluoUsado, 0)
}
