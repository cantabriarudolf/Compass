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
 */
import useSWR from "swr"

interface TotalesPorFondo {
  saldoInicial?: number
  montoEgresos?: number
  montoIngresos?: number
}

interface RespuestaFi {
  egresos: { total: number }
  ingresos: { total: number }
  fondos: { id: string }[]
  totalesPorFondo: TotalesPorFondo[]
}

export interface ResumenFI {
  montoEgresos: number
  montoIngresos: number
  /** Saldo consolidado de los fondos sumados, si el servidor expone `saldoInicial`. */
  saldoTotal: number | undefined
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
  const conSaldo = totales.every((t) => typeof t.saldoInicial === "number")
  const saldoTotal = conSaldo && totales.length > 0
    ? totales.reduce(
        (suma, t) => suma + (t.saldoInicial ?? 0) + (t.montoIngresos ?? 0) - (t.montoEgresos ?? 0),
        0
      )
    : undefined

  return {
    montoEgresos,
    montoIngresos,
    saldoTotal,
    completo: (data?.fondos.length ?? 0) < 100,
    isLoading,
    error: error ?? null,
  }
}
