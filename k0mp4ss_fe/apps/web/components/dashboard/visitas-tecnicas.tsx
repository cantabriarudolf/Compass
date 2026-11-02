"use client"

/**
 * VisitasTecnicas — T8 (S8): las visitas técnicas del período.
 *
 * S8 las separa a propósito de la foto operativa: la foto del día es el día a
 * día de la COMUNIDAD (visitas de vecinos, paquetes, contratistas de la puerta) y
 * esto es el día a día del EDIFICIO (las empresas del maestro de proveedores con
 * su técnico y el trabajo realizado). Conviven, no se reemplazan.
 *
 * El período es una ventana de 90 días hacia atrás (`DIAS_PERIODO_VISITAS`): el
 * libro de visitas técnicas se agenda cuando el proveedor puede, no cuando se
 * emite el gasto común, así que el período del gasto común no aplica.
 */
import * as React from "react"
import { hoyISO } from "@/lib/date-utils"
import { useProveedoresPE, useVisitasTecnicasPE } from "@/lib/api/use-pe"
import { IconTool } from "@tabler/icons-react"
import { Aviso, CargandoPanel, Panel, SinMovimiento } from "./piezas"
import { DIAS_PERIODO_VISITAS, fechaCorta, visitasTecnicasDelPeriodo } from "./agregados"

export function VisitasTecnicas() {
  const hoy = React.useMemo(() => hoyISO(), [])
  const visitas = useVisitasTecnicasPE()
  const proveedores = useProveedoresPE()
  const periodo = React.useMemo(() => visitasTecnicasDelPeriodo(visitas.items, hoy), [visitas.items, hoy])

  const proveedorDe = React.useCallback(
    (proveedorId: string) =>
      proveedores.items.find((proveedor) => proveedor.id === proveedorId)?.nombre ?? proveedorId,
    [proveedores.items]
  )

  const cargando = visitas.isLoading || proveedores.isLoading
  const error = visitas.error ?? proveedores.error

  return (
    <Panel
      titulo="Visitas técnicas del período"
      descripcion={`El día a día del edificio: técnicos de proveedores con su trabajo realizado (últimos ${DIAS_PERIODO_VISITAS} días).`}
      icono={IconTool}
      href="/operaciones/proveedores"
      textoHref="Ver libro de visitas"
    >
      {cargando ? (
        <CargandoPanel filas={5} />
      ) : error ? (
        <Aviso tono="error">No se pudo leer el libro de visitas técnicas: {error.message}</Aviso>
      ) : periodo.visitas.length === 0 ? (
        <SinMovimiento>
          Sin visitas técnicas desde el {fechaCorta(periodo.desde)}: el edificio no registra
          intervenciones de proveedores en el período.
        </SinMovimiento>
      ) : (
        <ul className="divide-y divide-muted-foreground/10">
          {periodo.visitas.map((visita) => (
            <li key={visita.id} className="space-y-0.5 py-2">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-xs font-semibold">{proveedorDe(visita.proveedorId)}</p>
                <p className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {fechaCorta(visita.fecha)}
                </p>
              </div>
              <p className="text-[11px] text-muted-foreground">Técnico: {visita.tecnicoNombre}</p>
              <p className="text-[11px]">{visita.trabajoRealizado}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
