"use client"

/**
 * Portada operativa del residente (D1): `residente` no ve la gestión financiera
 * de la comunidad —`/api/fi` la reserva a administración y comité— pero sí su
 * propia cuenta y sus reservas.
 *
 * - Estado de cuenta: cobros de SUS unidades (la ruta `/api/cobros-fi` filtra por
 *   vínculo vigente con ABAC, así que acá no hay totales de la comunidad).
 * - Reservas: amenidades disponibles y reservas confirmadas por venir.
 *
 * No se montan acá los paneles de Operaciones porque sus rutas PE no otorgan
 * `pe` al residente: pedirlos devolvería 403 y no aportaría nada a la portada.
 */
import * as React from "react"
import { hoyISO } from "@/lib/date-utils"
import { useCobrosFI } from "@/lib/api/use-cobros-fi"
import { useElementosRA, useReservasRA } from "@/lib/api/use-ra"
import { IconCalendarEvent, IconReceipt } from "@tabler/icons-react"
import { Aviso, CargandoPanel, Cifra, Panel, SinMovimiento, useColeccionCompleta } from "./piezas"
import { clp, cuentaPropia, fechaCorta, reservasProximas } from "./agregados"

export function MiEstadoDeCuenta() {
  const dia = React.useMemo(() => hoyISO(), [])
  const cobros = useCobrosFI()
  const { items, completa, isLoading, error } = useColeccionCompleta(cobros)
  const cuenta = React.useMemo(() => cuentaPropia(items, dia), [items, dia])

  return (
    <Panel
      titulo="Mi estado de cuenta"
      descripcion="Tus cobros pendientes en la comunidad."
      icono={IconReceipt}
    >
      {isLoading || !completa ? (
        <CargandoPanel filas={4} />
      ) : error ? (
        <Aviso tono="error">No se pudo leer tu estado de cuenta: {error.message}</Aviso>
      ) : (
        <>
          <Cifra
            etiqueta="Saldo pendiente"
            valor={clp(cuenta.pendiente)}
            detalle={`${cuenta.cobros} cobro(s) impago(s)`}
            tono={cuenta.pendiente > 0 ? "atencion" : "positivo"}
          />
          <ul className="divide-y divide-muted-foreground/10">
            <li className="flex items-center justify-between gap-3 py-1.5">
              <span className="text-xs text-muted-foreground">Cobros vencidos</span>
              <span className="text-xs font-semibold tabular-nums">{cuenta.vencidos}</span>
            </li>
            <li className="flex items-center justify-between gap-3 py-1.5">
              <span className="text-xs text-muted-foreground">Próximo vencimiento</span>
              <span className="text-xs font-semibold tabular-nums">
                {cuenta.proximoVencimiento ? fechaCorta(cuenta.proximoVencimiento) : "—"}
              </span>
            </li>
          </ul>
          {cuenta.cobros === 0 && (
            <SinMovimiento>No tienes cobros pendientes: tu cuenta está al día.</SinMovimiento>
          )}
        </>
      )}
    </Panel>
  )
}

export function MisReservas() {
  const dia = React.useMemo(() => hoyISO(), [])
  const reservas = useReservasRA()
  const elementos = useElementosRA()
  const proximas = React.useMemo(
    () => reservasProximas(reservas.items, dia),
    [reservas.items, dia]
  )
  const disponibles = elementos.items.filter((elemento) => elemento.activo).length
  const cargando = reservas.isLoading || elementos.isLoading
  const error = reservas.error ?? elementos.error

  return (
    <Panel
      titulo="Reservas y amenities"
      descripcion="Espacios comunes disponibles y reservas confirmadas por venir."
      icono={IconCalendarEvent}
      href="/operaciones/reservas"
      textoHref="Reservar"
    >
      {cargando ? (
        <CargandoPanel filas={3} />
      ) : error ? (
        <Aviso tono="error">No se pudieron leer las reservas: {error.message}</Aviso>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Cifra
              etiqueta="Confirmadas"
              valor={proximas}
              detalle="Reservas por venir"
              tono={proximas > 0 ? "positivo" : "neutro"}
            />
            <Cifra etiqueta="Amenities activos" valor={disponibles} detalle="Espacios reservables" />
          </div>
          {proximas === 0 && (
            <SinMovimiento>Sin reservas confirmadas por venir.</SinMovimiento>
          )}
        </>
      )}
    </Panel>
  )
}
