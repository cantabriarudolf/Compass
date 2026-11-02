"use client"

/**
 * GastosEstimados — T7 (S6): gasto mensual estimado por servicio.
 *
 * Fuente: los egresos recurrentes/periódicos del libro (luz, agua, internet,
 * telefonía, mantenciones y las demás categorías de gasto). La estimación es el
 * promedio mensual de lo efectivamente registrado (total del servicio / meses
 * con registro), no un presupuesto inventado.
 *
 * La colección de egresos se pagina hasta el final antes de agrupar
 * (`useColeccionCompleta`): con 182 egresos, la primera página son 100.
 */
import * as React from "react"
import { useEgresosFI } from "@/lib/api/use-egresos-fi"
import { Badge } from "@workspace/ui/components/badge"
import { IconReceipt2 } from "@tabler/icons-react"
import { Aviso, CargandoPanel, Panel, SinMovimiento, useColeccionCompleta } from "./piezas"
import { clp, gastosMensualesPorServicio } from "./agregados"

export function GastosEstimados() {
  const egresos = useEgresosFI()
  const { items, completa, isLoading, error } = useColeccionCompleta(egresos)
  const gastos = React.useMemo(() => gastosMensualesPorServicio(items), [items])

  return (
    <Panel
      titulo="Gastos mensuales estimados"
      descripcion="Promedio mensual por servicio según el libro de egresos."
      icono={IconReceipt2}
      href="/finanzas/gastos-comunes"
      textoHref="Ver libro"
    >
      {isLoading || !completa ? (
        <CargandoPanel filas={6} />
      ) : error ? (
        <Aviso tono="error">No se pudo leer el libro de egresos: {error.message}</Aviso>
      ) : gastos.grupos.length === 0 ? (
        <SinMovimiento>Sin egresos registrados en el libro.</SinMovimiento>
      ) : (
        <>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-muted-foreground/10 text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="pb-1 text-left font-bold">Servicio</th>
                <th className="pb-1 text-right font-bold">Estimado mes</th>
                <th className="w-16 pb-1 text-right font-bold">Base</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-muted-foreground/10">
              {gastos.grupos.map((grupo) => (
                <tr key={grupo.servicio}>
                  <td className="py-1.5">
                    <span className="flex items-center gap-1.5">
                      {grupo.servicio}
                      {grupo.recurrente && (
                        <Badge variant="secondary" className="px-1 py-0 text-[9px]">
                          fijo
                        </Badge>
                      )}
                    </span>
                  </td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">
                    {clp(grupo.mensual)}
                  </td>
                  <td className="py-1.5 text-right text-muted-foreground tabular-nums">
                    {grupo.egresos} egr.
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-muted-foreground/20">
                <td className="pt-1.5 font-bold">Total estimado</td>
                <td className="pt-1.5 text-right font-black tabular-nums">
                  {clp(gastos.totalMensual)}
                </td>
                <td className="pt-1.5 text-right text-muted-foreground">—</td>
              </tr>
            </tfoot>
          </table>
          <p className="text-[11px] text-muted-foreground">
            Promedio sobre {gastos.meses} mes(es) de libro. Luz, agua, internet y telefonía se
            registran hoy en una sola línea de servicios básicos: el libro no los separa por
            cuenta.
          </p>
        </>
      )}
    </Panel>
  )
}
