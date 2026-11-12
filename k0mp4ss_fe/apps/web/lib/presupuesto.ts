/**
 * lib/presupuesto.ts — presupuesto por partidas aprobado por el cuerpo que el
 * reglamento de la comunidad defina (F31, Ley 21.442 arts. 15 y 17).
 *
 * REGLA PURA: no consulta la base, no lee el reloj y no escribe nada. Recibe el
 * acuerdo ya leído (su estado y su cuerpo), si el período tiene un presupuesto
 * vigente y las partidas, y devuelve el dictamen que la ruta persiste.
 *
 * Base legal verificada (no se re-deriva acá):
 *   - el art. 17 faculta al COMITÉ a aprobar presupuestos estimativos de gastos
 *     comunes;
 *   - el art. 15 reserva ciertas materias a la ASAMBLEA;
 *   - cuál de los dos aprueba el presupuesto de partidas lo define el REGLAMENTO
 *     de cada comunidad. Por eso el sistema no elige: registra el cuerpo del
 *     acuerdo que lo aprobó y lo COPIA al presupuesto. Un cuerpo que no sea
 *     `comite` ni `asamblea` no se asume: no habilita nada.
 *
 * Tres decisiones que, si se dejaran al llamador, cada ruta resolvería distinto:
 *
 *   1. El dinero se suma en CENTAVOS enteros. Sumar pesos como floats deja
 *      $999.999,9999999 en un presupuesto que debe cerrar exacto: el total es la
 *      suma de las partidas, sin drift, y se persiste como snapshot del momento
 *      del alta (una partida que cambie después no reescribe lo aprobado).
 *   2. Partidas vacías NO son un presupuesto de $0: no hay nada aprobado que
 *      emitir. Un monto negativo tampoco es un gasto presupuestable.
 *   3. Que el período ya tenga un presupuesto vigente NO bloquea el alta: el
 *      presupuesto nuevo lo REEMPLAZA con la versión siguiente. La coexistencia
 *      de dos vigentes se evita versionando, no rechazando el acuerdo nuevo.
 */

/** Cuerpos que pueden aprobar el presupuesto (art. 17 comité; art. 15 asamblea). */
export const CUERPOS_DEL_PRESUPUESTO = ["comite", "asamblea"] as const

export type CuerpoDelPresupuesto = (typeof CUERPOS_DEL_PRESUPUESTO)[number]

/** Estados de un presupuesto: sólo uno `vigente` por comunidad y período. */
export const ESTADOS_DEL_PRESUPUESTO = ["vigente", "reemplazado"] as const

export type EstadoDelPresupuesto = (typeof ESTADOS_DEL_PRESUPUESTO)[number]

/** Partida en la forma mínima que necesita la suma. */
export interface PartidaConMonto {
  readonly monto: number
}

/** Partida en la forma mínima que necesita la validación. */
export interface PartidaParaValidar {
  readonly nombre: string
  readonly categoria: string
  readonly monto: number
}

/** Entrada del dictamen de habilitación: el acuerdo ya leído, sin base ni reloj. */
export interface EntradaPresupuestoPermitido {
  /** Estado del acuerdo: sólo `aprobado` habilita (abierto/rechazado, no). */
  readonly acuerdoEstado: string
  /** Cuerpo del acuerdo: `comite` o `asamblea`; es el que se copia al presupuesto. */
  readonly acuerdoCuerpo: string
  /**
   * ¿El período ya tiene un presupuesto `vigente`? Se recibe para dejar dicha la
   * regla: un vigente NO bloquea el alta — el nuevo lo reemplaza versionando —,
   * así que este campo nunca produce un rechazo. La versión y el reemplazo los
   * resuelve la ruta dentro de su transacción.
   */
  readonly yaHayVigente: boolean
}

export type DictamenPresupuesto =
  | { readonly permitido: true }
  | { readonly permitido: false; readonly motivo: string }

export type DictamenPartidas =
  | { readonly validas: true; readonly total: number }
  | { readonly validas: false; readonly motivo: string }

/** Mensajes fijos: describen el contrato, no una fila de nadie. */
const MOTIVO_ACUERDO_NO_APROBADO =
  "El acuerdo que aprueba el presupuesto no está aprobado."
const MOTIVO_CUERPO_DESCONOCIDO =
  "El acuerdo no tiene un cuerpo que pueda aprobar el presupuesto: el reglamento define si lo aprueba el comité o la asamblea."
const MOTIVO_SIN_PARTIDAS =
  "El presupuesto debe tener al menos una partida."
const MOTIVO_MONTO_INVALIDO =
  "El monto de una partida no puede ser negativo ni dejar de ser un número finito."

/** Pesos → centavos enteros (la moneda se opera en su unidad mínima). */
function aCentavos(monto: number): number {
  return Math.round(monto * 100)
}

/** ¿El cuerpo declarado es uno de los que pueden aprobar el presupuesto? */
export function esCuerpoDelPresupuesto(
  valor: string
): valor is CuerpoDelPresupuesto {
  return (CUERPOS_DEL_PRESUPUESTO as readonly string[]).includes(valor)
}

/**
 * Suma exacta de las partidas, en centavos enteros.
 *
 * Una lista vacía suma cero: la suma de nada es cero y esta función no decide si
 * hay presupuesto — eso lo dice `validarPartidas`.
 */
export function totalDePartidas(
  partidas: readonly PartidaConMonto[]
): number {
  let centavos = 0
  for (const partida of partidas) centavos += aCentavos(partida.monto)
  return centavos / 100
}

/**
 * ¿El acuerdo habilita el presupuesto?
 *
 * El estado se exige `aprobado` y el cuerpo tiene que ser uno de los dos que la
 * ley faculta: el acuerdo es la evidencia de quién aprobó, así que el registro
 * copia ese cuerpo y nunca asume el que la comunidad «debería» tener.
 */
export function presupuestoPermitido(
  entrada: EntradaPresupuestoPermitido
): DictamenPresupuesto {
  if (entrada.acuerdoEstado !== "aprobado") {
    return { permitido: false, motivo: MOTIVO_ACUERDO_NO_APROBADO }
  }
  if (!esCuerpoDelPresupuesto(entrada.acuerdoCuerpo)) {
    return { permitido: false, motivo: MOTIVO_CUERPO_DESCONOCIDO }
  }
  // `yaHayVigente` no rechaza: el reemplazo versionado es el mecanismo (ver el
  // encabezado del módulo). Se lee para que la regla quede dicha y probada.
  return { permitido: true }
}

/**
 * ¿Las partidas constituyen un presupuesto? Devuelve además el total exacto que
 * la ruta persiste como snapshot.
 *
 * El nombre y la categoría los valida el contrato del cuerpo (zod); acá se
 * validan las reglas del dinero: al menos una partida, monto finito y no negativo.
 */
export function validarPartidas(
  partidas: readonly PartidaParaValidar[]
): DictamenPartidas {
  if (partidas.length === 0) {
    return { validas: false, motivo: MOTIVO_SIN_PARTIDAS }
  }
  for (const partida of partidas) {
    if (!Number.isFinite(partida.monto) || partida.monto < 0) {
      return { validas: false, motivo: MOTIVO_MONTO_INVALIDO }
    }
  }
  return { validas: true, total: totalDePartidas(partidas) }
}
