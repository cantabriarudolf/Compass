"use client"

/**
 * NominasPorPagar — T6 (S6): las nóminas todavía no pagadas.
 *
 * «Nóminas por pagar» = liquidaciones PL en estado `borrador` (devengadas, sin
 * egreso sincronizado). Suma `liquidoAPagar`, que es lo que efectivamente sale
 * de caja al confirmarlas.
 *
 * Permiso: `GET /api/liquidaciones` exige `ver` sobre `pl`, que la matriz RP
 * reserva a administración (el comité no ve sueldos). Por eso el panel se
 * declara restringido en vez de mostrar un error de la API: la ruta no se toca
 * en esta unidad.
 */
import { useLiquidaciones } from "@/lib/api/use-liquidaciones"
import { puedeVer } from "./perfiles"
import { IconUserDollar } from "@tabler/icons-react"
import { Aviso, CargandoPanel, Cifra, Panel, SinMovimiento } from "./piezas"
import { clp, nominasEnBorrador } from "./agregados"

export function NominasPorPagar({ roles }: { roles: string[] }) {
  if (!puedeVer(roles, "ver", "pl")) {
    return (
      <Panel
        titulo="Nóminas por pagar"
        descripcion="Sueldos devengados que aún no se pagan."
        icono={IconUserDollar}
      >
        <SinMovimiento>
          Información restringida: el detalle de remuneraciones es de administración.
        </SinMovimiento>
      </Panel>
    )
  }
  return <NominasAdmin />
}

function NominasAdmin() {
  const liquidaciones = useLiquidaciones()
  const nominas = nominasEnBorrador(liquidaciones.liquidaciones)

  return (
    <Panel
      titulo="Nóminas por pagar"
      descripcion="Liquidaciones en borrador: devengadas, todavía sin pago."
      icono={IconUserDollar}
      href="/finanzas/remuneraciones"
      textoHref="Ver remuneraciones"
    >
      {liquidaciones.isLoading ? (
        <CargandoPanel filas={4} />
      ) : liquidaciones.error ? (
        <Aviso tono="error">No se pudieron leer las liquidaciones: {liquidaciones.error.message}</Aviso>
      ) : nominas.cantidad === 0 ? (
        <SinMovimiento>Sin nóminas en borrador: las liquidaciones del período están confirmadas.</SinMovimiento>
      ) : (
        <>
          <Cifra
            etiqueta={`Por pagar${nominas.periodo ? ` · ${nominas.periodo}` : ""}`}
            valor={clp(nominas.total)}
            detalle={`${nominas.cantidad} nómina(s) en borrador`}
            tono="atencion"
          />
          <ul className="divide-y divide-muted-foreground/10">
            {nominas.folios.map((folio) => (
              <li key={folio} className="py-1 text-xs text-muted-foreground">
                {folio}
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  )
}
