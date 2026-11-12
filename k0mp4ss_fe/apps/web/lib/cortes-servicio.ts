/**
 * lib/cortes-servicio.ts — el trámite del corte de servicios por morosidad
 * (F28, Ley 21.442 art. 20 N°9).
 *
 * REGLA PURA: no consulta la base, no lee el reloj y no escribe nada. Las fechas
 * entran por parámetro y la unidad entra ya resuelta (cuotas impagas, si hay una
 * persona electrodependiente, si la deuda se devengó bajo catástrofe y si la
 * unidad ya tiene otro servicio suspendido). La usan las tres rutas de
 * `/api/cortes-servicio` para que el preaviso y la ejecución no decidan distinto.
 *
 * Base legal verificada (Ley 21.442 art. 20 N°9; no se re-deriva acá):
 *   · el administrador puede suspender —o requerir a las empresas que suspendan—
 *     electricidad, telecomunicaciones o calefacción de las unidades que adeuden
 *     TRES O MÁS CUOTAS, continuas o discontinuas;
 *   · exige ACUERDO DEL COMITÉ (lo consume la ruta: acá sólo se valida la
 *     morosidad y las prohibiciones);
 *   · exige AVISO AL DEUDOR con CINCO DÍAS CORRIDOS de anticipación;
 *   · está PROHIBIDO en unidades donde resida una persona ELECTRODEPENDIENTE y
 *     por deudas devengadas bajo estado de catástrofe;
 *   · NO pueden suspenderse dos servicios a la vez;
 *   · la reposición procede al día hábil siguiente de regularizada la deuda (la
 *     revocación; el día hábil es materia de la ruta que la registra).
 *
 * Dos decisiones que el contrato de la ley obliga y que, si se dejaran al
 * llamador, cada ruta las resolvería distinto:
 *
 *   1. La electrodependencia bloquea SIEMPRE y se evalúa primero: una unidad con
 *      diez cuotas impagas sigue sin poder ser cortada. No es un descuento ni un
 *      atenuante, es una prohibición.
 *   2. Los cinco días son CORRIDOS y se cuentan en días de calendario UTC, no en
 *      120 horas desde la hora exacta del preaviso: el día del preaviso no cuenta
 *      y el quinto sí, así que un preaviso a las 23:59 deja el corte habilitado
 *      al empezar el quinto día y no un minuto antes. Contar horas exactas haría
 *      que el corte se habilite a media tarde de un día hábil por una decisión de
 *      la hora en que se firmó el papel.
 */

/** Los tres servicios que la ley deja suspender: ni uno más (art. 20 N°9). */
export const SERVICIOS_CORTABLES = [
  "electricidad",
  "telecomunicaciones",
  "calefaccion",
] as const

export type ServicioCortable = (typeof SERVICIOS_CORTABLES)[number]

/**
 * Estados del trámite, en el orden en que ocurren:
 * - `preaviso`  el aviso escrito está cursado y corre el plazo de cinco días;
 * - `ejecutado` la empresa suspendió el servicio (hecho consumado);
 * - `revocado`  se dejó sin efecto por pago de la deuda o por error; la unidad
 *               vuelve a estar habilitada.
 */
export const ESTADOS_DEL_CORTE = ["preaviso", "ejecutado", "revocado"] as const

export type EstadoDelCorte = (typeof ESTADOS_DEL_CORTE)[number]

/** Tres cuotas: el mínimo que la ley exige para habilitar el corte. */
export const CUOTAS_MINIMAS_PARA_CORTE = 3

/** Cinco días corridos de preaviso antes de poder suspender. */
export const DIAS_DE_PREAVISO = 5

/** Milisegundos de un día: el plazo es de días de calendario, no de horas hábiles. */
const MS_POR_DIA = 24 * 60 * 60 * 1000

/** Entrada del dictamen: la unidad ya resuelta, sin base ni reloj. */
export interface EntradaCortePermitido {
  /** Cuotas impagas de la unidad, continuas o discontinuas (art. 20 N°9). */
  readonly cuotasImpagas: number
  /** ¿Reside en la unidad una persona electrodependiente registrada? */
  readonly electrodependiente: boolean
  /** ¿La deuda se devengó bajo estado de catástrofe? */
  readonly deudaDeCatastrofe: boolean
  /** ¿La unidad ya tiene OTRO servicio suspendido en este momento? */
  readonly otroServicioYaCortado: boolean
}

/** Dictamen del trámite: habilitado, o negado con el motivo que lo sostiene. */
export type DictamenCorte =
  | { readonly permitido: true }
  | { readonly permitido: false; readonly motivo: string }

/** ¿El estado declarado es uno de los que el trámite conoce? */
export function esEstadoDelCorte(valor: string): valor is EstadoDelCorte {
  return (ESTADOS_DEL_CORTE as readonly string[]).includes(valor)
}

/** ¿El servicio declarado es uno de los tres que la ley deja suspender? */
export function esServicioCortable(valor: string): valor is ServicioCortable {
  return (SERVICIOS_CORTABLES as readonly string[]).includes(valor)
}

/**
 * ¿Procede el corte? Devuelve el motivo LITERAL cuando no procede, para que la
 * ruta lo devuelva tal cual y quien lo lea sepa qué falta.
 *
 * El orden de las comprobaciones no es casual: la electrodependencia manda sobre
 * todo (una unidad con diez cuotas impagas no se corta) y la catástrofe es una
 * prohibición de la DEUDA, no del estado de la unidad, así que también se evalúa
 * antes que el número de cuotas. El conteo de cuotas y el segundo servicio son
 * condiciones de procedencia, no prohibiciones.
 */
export function cortePermitido(entrada: EntradaCortePermitido): DictamenCorte {
  if (entrada.electrodependiente) {
    return {
      permitido: false,
      motivo:
        "No procede el corte: en la unidad reside una persona electrodependiente y la ley lo prohíbe en ese caso (Ley 21.442 art. 20 N°9).",
    }
  }

  if (entrada.deudaDeCatastrofe) {
    return {
      permitido: false,
      motivo:
        "No procede el corte: la deuda se devengó bajo estado de catástrofe y la ley no lo permite en ese caso (Ley 21.442 art. 20 N°9).",
    }
  }

  if (
    !Number.isFinite(entrada.cuotasImpagas) ||
    entrada.cuotasImpagas < CUOTAS_MINIMAS_PARA_CORTE
  ) {
    return {
      permitido: false,
      motivo:
        "No procede el corte: la ley exige tres o más cuotas impagas, continuas o discontinuas (Ley 21.442 art. 20 N°9).",
    }
  }

  if (entrada.otroServicioYaCortado) {
    return {
      permitido: false,
      motivo:
        "No procede el corte: la unidad ya tiene un servicio suspendido y no pueden suspenderse dos servicios a la vez (Ley 21.442 art. 20 N°9).",
    }
  }

  return { permitido: true }
}

/**
 * Fecha desde la cual el corte puede ejecutarse: el inicio (00:00 UTC) del QUINTO
 * día corrido posterior al día del preaviso. El día del preaviso no cuenta; el
 * quinto sí. Un preaviso el 1 de marzo habilita el 6, a cualquier hora de ese día.
 *
 * Devuelve una fecha nueva: la del preaviso no se muta.
 */
export function fechaHabilitadaDelCorte(preaviso: Date): Date {
  const inicioDelDia = Date.UTC(
    preaviso.getUTCFullYear(),
    preaviso.getUTCMonth(),
    preaviso.getUTCDate()
  )
  return new Date(inicioDelDia + DIAS_DE_PREAVISO * MS_POR_DIA)
}

/** Entrada de la ejecución: la fila persistida y el reloj, ambos por parámetro. */
export interface EntradaPuedeEjecutarse {
  /** Fecha habilitada que guardó el preaviso (`fechaHabilitadaDelCorte`). */
  readonly fechaHabilitada: Date
  /** Hoy, según el reloj que decida el llamador. */
  readonly hoy: Date
  /** Estado persistido del corte. */
  readonly estado: string
}

/** Dictamen de la ejecución: ejecutable, o negado con el motivo que lo sostiene. */
export type DictamenEjecucion =
  | { readonly ejecutable: true }
  | { readonly ejecutable: false; readonly motivo: string }

/**
 * ¿Se puede ejecutar YA el corte preavisado?
 *
 * Un corte ya ejecutado o revocado no se re-ejecuta: la ejecución es un hecho
 * consumado y la revocación la dejó sin efecto, así que ninguna de las dos se
 * repite (volver a ejecutar sería suspender el servicio de una unidad que ya
 * regularizó). El estado se evalúa antes que la fecha: esperar no arregla un
 * estado equivocado.
 */
export function puedeEjecutarse(
  entrada: EntradaPuedeEjecutarse
): DictamenEjecucion {
  if (entrada.estado === "ejecutado") {
    return {
      ejecutable: false,
      motivo: "No se puede ejecutar el corte: ya fue ejecutado y no se ejecuta dos veces.",
    }
  }

  if (entrada.estado === "revocado") {
    return {
      ejecutable: false,
      motivo: "No se puede ejecutar el corte: fue revocado y la unidad quedó habilitada.",
    }
  }

  if (entrada.estado !== "preaviso") {
    return {
      ejecutable: false,
      motivo: `No se puede ejecutar el corte: el estado «${entrada.estado}» no es preaviso.`,
    }
  }

  if (entrada.hoy.getTime() < entrada.fechaHabilitada.getTime()) {
    return {
      ejecutable: false,
      motivo:
        "No se puede ejecutar el corte: el preaviso debe cumplir cinco días corridos y todavía no se cumplieron (Ley 21.442 art. 20 N°9).",
    }
  }

  return { ejecutable: true }
}
