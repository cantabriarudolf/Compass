"use client"

/**
 * MantencionesPreventivas — T7 (S7): el calendario preventivo del maestro de
 * proveedores (`/operaciones/proveedores` → mantenciones), visible desde el
 * dashboard sin tener que entrar al módulo.
 *
 * La alerta NO se reinicia acá: se usa `alertasMantencionesVencidas`, el mismo
 * criterio del panel de proveedores (activa y dentro de `alertaDiasAntes`), así
 * que el badge del dashboard y el del módulo dicen lo mismo.
 */
import * as React from "react"
import { hoyISO } from "@/lib/date-utils"
import { useMantencionesPE, useProveedoresPE } from "@/lib/api/use-pe"
import { alertasMantencionesVencidas } from "@/lib/personal-utils"
import { Badge } from "@workspace/ui/components/badge"
import { IconCalendarRepeat } from "@tabler/icons-react"
import { Aviso, CargandoPanel, Panel, SinMovimiento } from "./piezas"
import { diasHasta, fechaCorta } from "./agregados"

/** Cuántas mantenciones se listan; el resto vive en el módulo de proveedores. */
const FILAS_VISIBLES = 6

export function MantencionesPreventivas() {
  const hoy = React.useMemo(() => hoyISO(), [])
  const mantenciones = useMantencionesPE()
  const proveedores = useProveedoresPE()

  const enAlerta = React.useMemo(() => {
    const mapa = new Map<string, number>()
    for (const alerta of alertasMantencionesVencidas(mantenciones.items, hoy)) {
      mapa.set(alerta.mantencion.id, alerta.diasRestantes)
    }
    return mapa
  }, [mantenciones.items, hoy])

  const proveedorDe = React.useCallback(
    (proveedorId: string) =>
      proveedores.items.find((proveedor) => proveedor.id === proveedorId)?.nombre ?? proveedorId,
    [proveedores.items]
  )

  const ordenadas = React.useMemo(
    () =>
      [...mantenciones.items]
        .filter((mantencion) => mantencion.activo)
        .sort((a, b) => a.proximaFecha.localeCompare(b.proximaFecha)),
    [mantenciones.items]
  )

  const cargando = mantenciones.isLoading || proveedores.isLoading
  const error = mantenciones.error ?? proveedores.error

  return (
    <Panel
      titulo="Mantenciones preventivas"
      descripcion="Próximas visitas programadas de las empresas del maestro de proveedores."
      icono={IconCalendarRepeat}
      href="/operaciones/proveedores"
      textoHref="Administrar"
    >
      {cargando ? (
        <CargandoPanel filas={5} />
      ) : error ? (
        <Aviso tono="error">No se pudo leer el maestro de proveedores: {error.message}</Aviso>
      ) : ordenadas.length === 0 ? (
        <SinMovimiento>Sin mantenciones preventivas activas en el maestro.</SinMovimiento>
      ) : (
        <ul className="divide-y divide-muted-foreground/10">
          {ordenadas.slice(0, FILAS_VISIBLES).map((mantencion) => {
            const dias = enAlerta.get(mantencion.id)
            const faltan = diasHasta(mantencion.proximaFecha, hoy)
            return (
              <li key={mantencion.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">{mantencion.descripcion}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {proveedorDe(mantencion.proveedorId)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[11px] font-medium tabular-nums">
                    {fechaCorta(mantencion.proximaFecha)}
                  </p>
                  {dias !== undefined ? (
                    <Badge variant={faltan < 0 ? "destructive" : "secondary"} className="mt-0.5 text-[9px]">
                      {faltan < 0
                        ? `Vencida hace ${Math.abs(faltan)} d`
                        : faltan === 0
                          ? "Vence hoy"
                          : `En alerta · ${faltan} d`}
                    </Badge>
                  ) : (
                    <p className="text-[10px] text-muted-foreground">en {faltan} d</p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
