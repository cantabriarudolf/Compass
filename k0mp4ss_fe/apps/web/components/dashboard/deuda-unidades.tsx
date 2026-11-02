"use client"

/**
 * DeudaUnidades — T4 (S4): montos adeudados por las unidades, separados por
 * multas y gastos comunes atrasados.
 *
 * La fuente es la colección de cobros FI; un cobro con `pagos` vacío está
 * impago. La colección se pagina hasta el final (`useColeccionCompleta`) antes
 * de sumar: el libro tiene 501 cobros y la primera página trae 100, así que una
 * suma sobre `items` sin completar las páginas subestimaría la deuda.
 */
import * as React from "react"
import { hoyISO } from "@/lib/date-utils"
import { useCobrosFI } from "@/lib/api/use-cobros-fi"
import { IconGavel } from "@tabler/icons-react"
import { Aviso, CargandoPanel, Cifra, Panel, SinMovimiento, useColeccionCompleta } from "./piezas"
import { clp, deudaDeUnidades } from "./agregados"

export function DeudaUnidades() {
  const hoy = React.useMemo(() => hoyISO(), [])
  const cobros = useCobrosFI()
  const { items, completa, isLoading, error } = useColeccionCompleta(cobros)
  const deuda = React.useMemo(() => deudaDeUnidades(items, hoy), [items, hoy])

  return (
    <Panel
      titulo="Deuda de las unidades"
      descripcion="Cobros impagos: multas y gastos comunes ya vencidos."
      icono={IconGavel}
      href="/finanzas/gastos-comunes"
      textoHref="Ver gastos comunes"
    >
      {isLoading || !completa ? (
        <CargandoPanel filas={4} />
      ) : error ? (
        <Aviso tono="error">No se pudo leer el libro de cobros: {error.message}</Aviso>
      ) : (
        <>
          <Cifra
            etiqueta="Total adeudado"
            valor={clp(deuda.total)}
            detalle={`${deuda.unidades} unidad(es) con deuda · ${
              deuda.multasCobros + deuda.gastosComunesAtrasadosCobros
            } cobros impagos`}
            tono={deuda.total > 0 ? "negativo" : "positivo"}
          />

          <ul className="divide-y divide-muted-foreground/10">
            <li className="flex items-center justify-between gap-3 py-1.5">
              <span className="text-xs text-muted-foreground">
                Multas impagas ({deuda.multasCobros})
              </span>
              <span className="text-xs font-semibold tabular-nums">{clp(deuda.multas)}</span>
            </li>
            <li className="flex items-center justify-between gap-3 py-1.5">
              <span className="text-xs text-muted-foreground">
                Gastos comunes atrasados ({deuda.gastosComunesAtrasadosCobros})
              </span>
              <span className="text-xs font-semibold tabular-nums">
                {clp(deuda.gastosComunesAtrasados)}
              </span>
            </li>
            {deuda.porVencer > 0 && (
              <li className="flex items-center justify-between gap-3 py-1.5">
                <span className="text-xs text-muted-foreground">
                  Aún no vence ({deuda.porVencerCobros})
                </span>
                <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                  {clp(deuda.porVencer)}
                </span>
              </li>
            )}
            {deuda.moras > 0 && (
              <li className="flex items-center justify-between gap-3 py-1.5">
                <span className="text-xs text-muted-foreground">Moras ya acumuladas</span>
                <span className="text-xs font-semibold tabular-nums">{clp(deuda.moras)}</span>
              </li>
            )}
          </ul>

          {deuda.total === 0 && (
            <SinMovimiento>Sin deuda registrada: todas las unidades están al día.</SinMovimiento>
          )}
        </>
      )}
    </Panel>
  )
}
