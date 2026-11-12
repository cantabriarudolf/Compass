/**
 * lib/convenios.ts — cuotas del convenio de pago de deuda de gastos comunes (F29).
 *
 * REGLA PURA: no consulta la base, no lee el reloj y no escribe nada. Recibe los
 * términos del convenio y devuelve la DEUDA que el convenio genera, para que la
 * ruta la persista dentro de su transacción.
 *
 * Base legal verificada (Ley 21.442 art. 6 inc. 4; no se re-deriva acá):
 *   - el administrador está facultado para celebrar convenios de pago con los
 *     copropietarios morosos, en cuotas mensuales;
 *   - la PRIMERA CUOTA se paga al suscribir el convenio;
 *   - el convenio exige acuerdo del Comité (la ruta consume el acuerdo: acá sólo
 *     se arman los números).
 *
 * Dos decisiones que el contrato de la ley obliga y que, si se dejaran al
 * llamador, cada ruta las resolvería distinto:
 *
 *   1. La primera cuota NO es deuda. Se pagó al firmar, así que no se devuelve en
 *      la lista: la deuda del convenio empieza en la cuota 1 y suma exactamente
 *      `montoTotal − primeraCuota`.
 *   2. El dinero se reparte en CENTAVOS enteros. Dividir floats deja cuotas de
 *      $222.222,3333 y una suma que no cuadra con el saldo: el residuo del
 *      redondeo se carga a la ÚLTIMA cuota, y así el convenio cierra al centavo
 *      (el art. 6 habla de cuotas mensuales iguales, no de cuotas iguales y una
 *      distinta: el centavo sobrante es el último, no un monto nuevo).
 *
 * Los vencimientos son mensuales desde la suscripción y conservan el DÍA del mes
 * de la firma. Un mes corto no arrastra el día hacia atrás (31 de enero → 28 de
 * febrero → 31 de marzo): cada vencimiento se calcula desde la suscripción, que
 * es el ancla del calendario del convenio.
 */

/** Términos del convenio con los que se arma la deuda. */
export interface EntradaCuotasDelConvenio {
  /** Deuda total que el convenio regulariza, en pesos. */
  readonly montoTotal: number
  /** Número de cuotas mensuales del SALDO (no cuenta la primera cuota). */
  readonly numeroCuotas: number
  /** Lo que el copropietario paga al suscribir: se registra pagado, no se debe. */
  readonly primeraCuota: number
  /** Fecha de firma: ancla de todos los vencimientos. */
  readonly fechaSuscripcion: Date
}

/** Una cuota de la deuda del convenio, lista para persistirse. */
export interface CuotaDelConvenio {
  /** 1..N. La cuota 0 es el pago al suscribir y no se genera acá. */
  readonly numero: number
  /** Monto en pesos, con la precisión del centavo. */
  readonly monto: number
  /** Vencimiento mensual derivado de la suscripción. */
  readonly venceEn: Date
}

/** Mensajes fijos: describen el contrato, no una fila de nadie. */
const MENSAJE_SIN_CUOTAS =
  "El convenio debe tener al menos una cuota mensual del saldo."
const MENSAJE_PRIMERA_CUOTA =
  "La primera cuota debe ser mayor a cero y no puede superar el monto total del convenio."
const MENSAJE_SALDO_INSUFICIENTE =
  "El saldo que deja la primera cuota no alcanza para cuotas de al menos un centavo."

/** Pesos → centavos enteros (la moneda se opera en su unidad mínima). */
function aCentavos(monto: number): number {
  return Math.round(monto * 100)
}

/**
 * Suma meses conservando el día y la hora de la fecha base, con el día acotado al
 * último del mes destino. El día se toma SIEMPRE de la fecha original, así que un
 * febrero corto no arrastra los vencimientos siguientes.
 */
function sumarMeses(fecha: Date, meses: number): Date {
  const totalMeses = fecha.getUTCMonth() + meses
  const anio = fecha.getUTCFullYear() + Math.floor(totalMeses / 12)
  const mes = ((totalMeses % 12) + 12) % 12
  // Día 0 del mes siguiente = último día del mes destino.
  const ultimoDiaDelMes = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate()
  return new Date(
    Date.UTC(
      anio,
      mes,
      Math.min(fecha.getUTCDate(), ultimoDiaDelMes),
      fecha.getUTCHours(),
      fecha.getUTCMinutes(),
      fecha.getUTCSeconds(),
      fecha.getUTCMilliseconds()
    )
  )
}

/**
 * Cuotas mensuales que genera un convenio de pago, con su vencimiento.
 *
 * Devuelve sólo la deuda: la primera cuota está pagada por definición y no se
 * incluye. Con `primeraCuota === montoTotal` no queda saldo y la lista es vacía.
 *
 * Lanza `Error` cuando los términos no permiten armar cuotas válidas: un convenio
 * sin cuotas, una primera cuota fuera de rango o un saldo que no alcanza para
 * cuotas de un centavo no se pueden persistir sin mentir en el saldo. Las rutas
 * validan los mismos bordes con zod; esto es la garantía de la regla, no su
 * reemplazo.
 */
export function cuotasDelConvenio(
  entrada: EntradaCuotasDelConvenio
): CuotaDelConvenio[] {
  const { montoTotal, numeroCuotas, primeraCuota, fechaSuscripcion } = entrada

  if (!Number.isInteger(numeroCuotas) || numeroCuotas < 1) {
    throw new Error(MENSAJE_SIN_CUOTAS)
  }
  if (
    !Number.isFinite(montoTotal) ||
    !Number.isFinite(primeraCuota) ||
    montoTotal <= 0 ||
    primeraCuota <= 0 ||
    primeraCuota > montoTotal
  ) {
    throw new Error(MENSAJE_PRIMERA_CUOTA)
  }

  const saldoCentavos = aCentavos(montoTotal) - aCentavos(primeraCuota)
  // La primera cuota cubrió el total: no hay deuda que repartir.
  if (saldoCentavos <= 0) return []
  if (saldoCentavos < numeroCuotas) throw new Error(MENSAJE_SALDO_INSUFICIENTE)

  const cuotaBase = Math.floor(saldoCentavos / numeroCuotas)
  const residuo = saldoCentavos - cuotaBase * numeroCuotas

  const cuotas: CuotaDelConvenio[] = []
  for (let numero = 1; numero <= numeroCuotas; numero++) {
    const esUltima = numero === numeroCuotas
    cuotas.push({
      numero,
      monto: (esUltima ? cuotaBase + residuo : cuotaBase) / 100,
      venceEn: sumarMeses(fechaSuscripcion, numero),
    })
  }
  return cuotas
}
