"use client"

/**
 * ProvisionMes — T5 (S5): la provisión del mes.
 *
 * «Lo que debiera tener eventualmente provisionado para ese mes si los gastos
 * comunes están al día»: la última emisión de gasto común y su `gastoTotal`.
 * El monto NO se recalcula desde las líneas ni desde los cobros: es el total
 * emitido por el servidor.
 */
import { useEmisionesGC } from "@/lib/api/use-emisiones-gc"
import { IconPigMoney } from "@tabler/icons-react"
import { Aviso, CargandoPanel, Cifra, Panel, SinMovimiento } from "./piezas"
import { clp, fechaCorta, provisionDelMes } from "./agregados"

export function ProvisionMes() {
  const emisiones = useEmisionesGC()
  const provision = provisionDelMes(emisiones.items)

  return (
    <Panel
      titulo="Provisión del mes"
      descripcion="Lo que debiera estar provisionado si los gastos comunes del período están al día."
      icono={IconPigMoney}
      href="/finanzas/gastos-comunes"
      textoHref="Ver emisiones"
    >
      {emisiones.isLoading ? (
        <CargandoPanel filas={3} />
      ) : emisiones.error ? (
        <Aviso tono="error">No se pudieron leer las emisiones: {emisiones.error.message}</Aviso>
      ) : !provision ? (
        <SinMovimiento>Sin emisiones de gasto común registradas.</SinMovimiento>
      ) : (
        <>
          <Cifra
            etiqueta={`Período ${provision.periodo}`}
            valor={clp(provision.gastoTotal)}
            detalle={`Emitida el ${fechaCorta(provision.fechaEmision)} · ${provision.unidades} unidades`}
          />
          <p className="text-[11px] text-muted-foreground">
            Total emitido en la última emisión de gasto común de la comunidad.
          </p>
        </>
      )}
    </Panel>
  )
}
