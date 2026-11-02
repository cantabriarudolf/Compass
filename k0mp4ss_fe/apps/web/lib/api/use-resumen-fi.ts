"use client"

/**
 * use-resumen-fi — agregados del libro financiero para la portada de /finanzas.
 *
 * Los hooks de colección (`useEgresosFI`, `useIngresosFI`) traen la página 1
 * (`pageSize=100`), así que sumar sus `items` en el cliente mentiría sobre un
 * libro de 182 egresos. `GET /api/fi` ya calcula los totales por fondo en el
 * servidor; este hook los expone como un resumen listo para tarjetas.
 *
 * `pageSize=100` a propósito: el envelope también pagina la lista de fondos, y
 * con un pageSize chico los agregados cubrirían sólo esa página. `completo`
 * avisa si el libro tiene más fondos que los sumados, para no mostrar un total
 * silenciosamente recortado.
 *
 * `porFondo` (dashboard-operativo T3) expone el desglose por caja tal como lo
 * devuelve el servidor: `GET /api/fi` ya calcula `saldo` por fondo, así que el
 * dashboard no lo deduce de las listas paginadas de egresos e ingresos (D4).
 */
import useSWR from "swr"

interface TotalesPorFondo {
  fondoId?: string
  nombre?: string
  saldoInicial?: number
  montoEgresos?: number
  montoIngresos?: number
  /** Saldo del fondo calculado en el servidor (saldoInicial + ingresos − egresos). */
  saldo?: number
}

interface RespuestaFi {
  egresos: { total: number }
  ingresos: { total: number }
  fondos: { id: string }[]
  totalesPorFondo: TotalesPorFondo[]
}

/** Una caja (fondo) con sus totales tal como los calcula `GET /api/fi`. */
export interface ResumenFondoFI {
  id: string
  nombre: string
  saldoInicial: number
  montoIngresos: number
  montoEgresos: number
  /** Saldo del fondo según el servidor: nunca se recalcula en el navegador. */
  saldo: number
}

export interface ResumenFI {
  montoEgresos: number
  montoIngresos: number
  /** Saldo consolidado de los fondos sumados, si el servidor expone `saldoInicial`. */
  saldoTotal: number | undefined
  /**
   * Caja por fondo (D4, `dashboard-operativo` T3): el servidor ya devuelve
   * `saldo` por fondo, así que el desglose no se deduce de las listas paginadas.
   */
  porFondo: ResumenFondoFI[]
  /** `false` cuando el libro tiene más fondos que los que entraron en la suma. */
  completo: boolean
  isLoading: boolean
  error: Error | null
}

async function fetcher(url: string): Promise<RespuestaFi> {
  const res = await fetch(url, { headers: { accept: "application/json" } })
  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(cuerpo?.error ?? `Error ${res.status} al consultar ${url}.`)
  }
  return (await res.json()) as RespuestaFi
}

export function useResumenFI(): ResumenFI {
  const { data, error, isLoading } = useSWR<RespuestaFi, Error>(
    "/api/fi?pageSize=100",
    fetcher,
    { revalidateOnFocus: true }
  )

  const totales = data?.totalesPorFondo ?? []
  const montoEgresos = totales.reduce((suma, t) => suma + (t.montoEgresos ?? 0), 0)
  const montoIngresos = totales.reduce((suma, t) => suma + (t.montoIngresos ?? 0), 0)
  // El servidor gana (D4): su `saldo` ya es saldoInicial + ingresos − egresos por
  // fondo. La fórmula local queda solo como respaldo de un envelope más viejo.
  const conSaldoServidor =
    totales.length > 0 && totales.every((t) => typeof t.saldo === "number")
  const conSaldo = totales.every((t) => typeof t.saldoInicial === "number")
  const saldoTotal = conSaldoServidor
    ? totales.reduce((suma, t) => suma + (t.saldo ?? 0), 0)
    : conSaldo && totales.length > 0
      ? totales.reduce(
          (suma, t) => suma + (t.saldoInicial ?? 0) + (t.montoIngresos ?? 0) - (t.montoEgresos ?? 0),
          0
        )
      : undefined
  const porFondo: ResumenFondoFI[] = totales
    .filter((t): t is TotalesPorFondo & { fondoId: string; saldo: number } =>
      typeof t.fondoId === "string" && typeof t.saldo === "number"
    )
    .map((t) => ({
      id: t.fondoId,
      nombre: t.nombre ?? t.fondoId,
      saldoInicial: t.saldoInicial ?? 0,
      montoIngresos: t.montoIngresos ?? 0,
      montoEgresos: t.montoEgresos ?? 0,
      saldo: t.saldo,
    }))

  return {
    montoEgresos,
    montoIngresos,
    saldoTotal,
    porFondo,
    completo: (data?.fondos.length ?? 0) < 100,
    isLoading,
    error: error ?? null,
  }
}
