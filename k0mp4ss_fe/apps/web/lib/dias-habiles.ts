/**
 * dias-habiles — el día hábil siguiente, DERIVADO del calendario (Ley 21.442
 * art. 20 N°9).
 *
 * REGLA PURA: no consulta la base y no lee el reloj. La fecha entra por
 * parámetro y los feriados también, porque el sistema tiene una fuente de
 * feriados pero es DATO (`Feriado`, tabla `maestros_feriado`, sembrada desde
 * `data/admin/maestros.ts`) y una regla pura no puede ir a buscarlo: el que
 * llama le pasa las fechas de la comunidad.
 *
 * Por qué existe: la ley dice que, regularizada la deuda, la reposición del
 * servicio corre «al día hábil siguiente». Ese día no se tipea —un viernes no
 * tiene por día hábil siguiente al sábado, y un feriado tampoco es hábil— y por
 * eso se deriva: sábado y domingo no son hábiles, y tampoco lo es la fecha que
 * el maestro de la comunidad declare feriado.
 *
 * Convención de fechas: UTC, igual que el resto de `lib/date-utils.ts` y que
 * `fechaHabilitadaDelCorte`. El resultado es el INICIO (00:00 UTC) del día hábil
 * siguiente, así que el día se compara y se imprime igual en cualquier huso.
 */

/** Milisegundos de un día: el calendario se recorre en días, no en horas. */
const MS_POR_DIA = 24 * 60 * 60 * 1000

/** Sábado y domingo: los dos días que no son hábiles por calendario. */
const DIAS_NO_HABILES = new Set([0, 6])

/**
 * ¿La fecha cae en un día hábil? Sábado y domingo no; una fecha del maestro de
 * feriados tampoco. `feriados` son fechas `AAAA-MM-DD` (la forma de
 * `FeriadoSchema.fecha`), no instantes: comparar el día y no la hora evita que un
 * feriado se pierda por la hora del registro.
 */
export function esDiaHabil(fecha: Date, feriados: readonly string[] = []): boolean {
  if (DIAS_NO_HABILES.has(fecha.getUTCDay())) return false
  return !feriados.includes(fecha.toISOString().slice(0, 10))
}

/**
 * Inicio (00:00 UTC) del día hábil SIGUIENTE a `fecha`.
 *
 * El día de la fecha que entra no cuenta aunque sea hábil: regularizada la deuda
 * un lunes, la reposición es el martes. Se avanza día por día hasta uno hábil, así
 * que un viernes devuelve el lunes y un viernes antes de un feriado devuelve el
 * día hábil posterior a ese feriado.
 *
 * Devuelve una fecha NUEVA: la que entra no se muta.
 */
export function siguienteDiaHabil(fecha: Date, feriados: readonly string[] = []): Date {
  // Se parte del inicio del día de la fecha recibida: la hora del acto
  // administrativo no decide el día de la reposición.
  let dia = new Date(
    Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate())
  )
  do {
    dia = new Date(dia.getTime() + MS_POR_DIA)
  } while (!esDiaHabil(dia, feriados))
  return dia
}
