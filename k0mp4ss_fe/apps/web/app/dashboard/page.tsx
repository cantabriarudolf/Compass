"use client"

import * as React from "react"
import Link from "next/link"
import { useUnidades } from "@/lib/api/use-unidades"
import { usePersonas } from "@/lib/api/use-personas"
import { useVinculos } from "@/lib/api/use-vinculos"
import { useTiposUnidad } from "@/lib/api/use-tipos-unidad"
import { useMacroSectores } from "@/lib/api/use-macro-sectores"
import { useMicroSectores } from "@/lib/api/use-micro-sectores"
import { useMaestros } from "@/lib/api/use-maestros"
import { useFondosFI } from "@/lib/api/use-fondos-fi"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import {
  IconLayoutDashboard,
  IconBuildingSkyscraper,
  IconUsers,
  IconUserCheck,
  IconCategory,
  IconMapPin,
  IconSettings,
  IconArrowRight,
  IconClipboardList,
  IconReceipt,
  IconBook,
  IconChartBar,
} from "@tabler/icons-react"

function KpiCard({
  label,
  value,
  sub,
  href,
  icon: Icon,
}: {
  label: string
  value: string | number
  sub: string
  href: string
  icon: React.ElementType
}) {
  return (
    <Link href={href} className="block">
      <Card className="shadow-none border-muted-foreground/10 hover:border-primary/30 hover:bg-muted/40 transition-colors h-full">
        <CardContent className="pt-5 space-y-2">
          <div className="flex items-center gap-2 text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
            <Icon className="size-3.5" />
            {label}
          </div>
          <p className="text-2xl font-black tracking-tight">{value}</p>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            {sub} <IconArrowRight className="size-3" />
          </p>
        </CardContent>
      </Card>
    </Link>
  )
}

function QuickLink({
  title,
  description,
  href,
  icon: Icon,
}: {
  title: string
  description: string
  href: string
  icon: React.ElementType
}) {
  return (
    <Link href={href} className="block">
      <Card className="shadow-none border-muted-foreground/10 hover:border-primary/30 hover:bg-muted/40 transition-colors h-full">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="size-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-none">{title}</p>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{description}</p>
          </div>
          <IconArrowRight className="size-4 text-muted-foreground shrink-0" />
        </CardContent>
      </Card>
    </Link>
  )
}

export default function DashboardPage() {
  const { items: unidades, isLoading: cargandoUnidades } = useUnidades()
  const { personas, isLoading: cargandoPersonas } = usePersonas()
  const { vinculos, isLoading: cargandoVinculos } = useVinculos()
  const { items: tiposUnidad, isLoading: cargandoTipos } = useTiposUnidad()
  const { items: macroSectores, isLoading: cargandoMacro } = useMacroSectores()
  const { items: microSectores, isLoading: cargandoMicro } = useMicroSectores()
  const { data: estadosOcupacion, isLoading: cargandoEstados } = useMaestros("estados-ocupacion")
  const { items: fondosFI, isLoading: cargandoFondos } = useFondosFI()
  const isLoading =
    cargandoUnidades ||
    cargandoPersonas ||
    cargandoVinculos ||
    cargandoTipos ||
    cargandoMacro ||
    cargandoMicro ||
    cargandoEstados ||
    cargandoFondos

  const vinculosVigentes = React.useMemo(
    () => vinculos.filter((v) => !v.fechaFin && (v.rol === "propietario" || v.rol === "arrendatario")),
    [vinculos]
  )

  const residentesIds = React.useMemo(
    () => new Set(vinculosVigentes.map((v) => v.personaId)),
    [vinculosVigentes]
  )

  const residentesCount = residentesIds.size
  const unidadesOcupadas = React.useMemo(
    () => unidades.filter((u) => u.estadoId === "en-uso").length,
    [unidades]
  )
  const unidadesVacantes = React.useMemo(
    () => unidades.filter((u) => u.estadoId === "vacante").length,
    [unidades]
  )

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="h-9 w-72 rounded bg-muted/40" />
        <div className="h-4 w-96 max-w-full rounded bg-muted/30" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-28 rounded-lg bg-muted/30" />
          <div className="h-28 rounded-lg bg-muted/30" />
          <div className="h-28 rounded-lg bg-muted/30" />
          <div className="h-28 rounded-lg bg-muted/30" />
          <div className="h-28 rounded-lg bg-muted/30" />
          <div className="h-28 rounded-lg bg-muted/30" />
        </div>
        <div className="h-64 w-full rounded-lg bg-muted/30" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <IconLayoutDashboard className="size-7" />
            Resumen
          </h1>
          <p className="text-muted-foreground">Vista gerencial — indicadores clave y accesos rápidos.</p>
        </div>
        <Badge variant="secondary" className="text-xs">
          {unidades.length} unidades · {personas.length} personas
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Unidades totales"
          value={unidades.length}
          sub={`${unidadesOcupadas} ocupadas · ${unidadesVacantes} vacantes`}
          href="/inventario/estructura"
          icon={IconBuildingSkyscraper}
        />
        <KpiCard
          label="Personas registradas"
          value={personas.length}
          sub={`${residentesCount} residentes vigentes`}
          href="/comunidad/personas"
          icon={IconUsers}
        />
        <KpiCard
          label="Residentes vigentes"
          value={residentesCount}
          sub="Propietarios y arrendatarios"
          href="/personas/residentes"
          icon={IconUserCheck}
        />
        <KpiCard
          label="Tipos de unidad"
          value={tiposUnidad.length}
          sub="Plantillas tarifarias activas"
          href="/inventario/tipos"
          icon={IconCategory}
        />
        <KpiCard
          label="Sectores"
          value={macroSectores.length + microSectores.length}
          sub={`${macroSectores.length} macro · ${microSectores.length} micro`}
          href="/inventario/estructura"
          icon={IconMapPin}
        />
        <KpiCard
          label="Estados ocupación"
          value={estadosOcupacion.length}
          sub="Parámetros MA configurados"
          href="/admin/maestros"
          icon={IconSettings}
        />
        <KpiCard
          label="Fondos FI"
          value={fondosFI.length}
          sub="Cajas financieras activas"
          href="/finanzas/gastos-comunes"
          icon={IconReceipt}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <IconClipboardList className="size-5" />
            Accesos rápidos
          </CardTitle>
          <CardDescription>Navega a los módulos principales de la plataforma.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <QuickLink
              title="Estructura Física"
              description="Unidades, torres y sectores"
              href="/inventario/estructura"
              icon={IconBuildingSkyscraper}
            />
            <QuickLink
              title="Residentes"
              description="Directorio filtrado por vínculo vigente"
              href="/personas/residentes"
              icon={IconUserCheck}
            />
            <QuickLink
              title="Bitácora Diaria"
              description="Operaciones y eventos del día"
              href="/operaciones/bitacora"
              icon={IconBook}
            />
            <QuickLink
              title="Finanzas"
              description="Gastos comunes y recaudación"
              href="/finanzas/gastos-comunes"
              icon={IconReceipt}
            />
            <QuickLink
              title="Métricas"
              description="Auditoría y métricas por módulo"
              href="/admin/metricas"
              icon={IconChartBar}
            />
            <QuickLink
              title="Personas"
              description="Directorio maestro de comunidad"
              href="/comunidad/personas"
              icon={IconUsers}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
