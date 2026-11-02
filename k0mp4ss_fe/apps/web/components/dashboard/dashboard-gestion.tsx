"use client"

/**
 * DashboardGestion — portada de `administrador` y `comite` (T1, D1/S9).
 *
 * El comité es el receptor legal de la rendición de cuentas (art. 21 Ley
 * 21.442), así que comparte el panel de gestión completo: la foto del día de
 * Operaciones (S1), el bloque financiero (S3), la deuda de las unidades (S4), la
 * provisión del mes (S5), las nóminas por pagar (S6), los gastos estimados por
 * servicio y las mantenciones preventivas (S6/S7) y las visitas técnicas (S8).
 *
 * La única diferencia entre ambos roles es la nómina: `GET /api/liquidaciones`
 * exige `pl`, que solo tiene administración, y el panel lo declara restringido
 * en vez de fallar (no se toca la ruta en esta unidad).
 */
import { Badge } from "@workspace/ui/components/badge"
import { IconLayoutDashboard } from "@tabler/icons-react"
import { AccesosRapidos } from "./accesos-rapidos"
import { BloqueFinanciero } from "./bloque-financiero"
import { DeudaUnidades } from "./deuda-unidades"
import { FotoDelDia } from "./foto-del-dia"
import { GastosEstimados } from "./gastos-estimados"
import { MantencionesPreventivas } from "./mantenciones-preventivas"
import { NominasPorPagar } from "./nominas-por-pagar"
import { ProvisionMes } from "./provision-mes"
import { VisitasTecnicas } from "./visitas-tecnicas"

export function DashboardGestion({ roles }: { roles: string[] }) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <IconLayoutDashboard className="size-7" />
            Panel de gestión
          </h1>
          <p className="text-muted-foreground">
            Foto operativa y financiera de la comunidad: lo del día, la caja, la deuda y los
            compromisos del mes.
          </p>
        </div>
        <Badge variant="secondary" className="text-xs">
          {roles.includes("administrador") ? "Administración" : "Comité"} · gestión
        </Badge>
      </header>

      <FotoDelDia />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BloqueFinanciero />
        <DeudaUnidades />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ProvisionMes />
        <NominasPorPagar roles={roles} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GastosEstimados />
        <MantencionesPreventivas />
      </div>

      <VisitasTecnicas />

      <AccesosRapidos roles={roles} />
    </div>
  )
}
