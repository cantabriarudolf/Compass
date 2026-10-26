"use client"

/**
 * Portada del módulo Finanzas. Tras retirar el panel espejo (fi-espejo-bd),
 * esta página quedó vacía: hoy resume el estado financiero leído directo de
 * la base (vía los hooks CRUD existentes) y da acceso a las cuatro subpáginas.
 *
 * Sobre los montos: los hooks exponen el `total` de filas que reporta el
 * servidor, pero no sumas de `monto` ni saldo por fondo (los `items` llegan
 * truncados a pageSize=100, así que sumarlos en el cliente no cuadraría; y el
 * saldo canónico de fondo lo calcula `saldoFondo` en la subpágina considerando
 * cobros y emisiones). Donde el hook no sostiene el número se muestra «—».
 */
import * as React from "react"
import Link from "next/link"
import { Card, CardContent } from "@workspace/ui/components/card"
import {
  IconCoins,
  IconCash,
  IconGavel,
  IconWallet,
  IconArrowRight,
  IconAlertTriangle,
} from "@tabler/icons-react"
import { useFondosFI } from "@/lib/api/use-fondos-fi"
import { useEgresosFI } from "@/lib/api/use-egresos-fi"
import { useIngresosFI } from "@/lib/api/use-ingresos-fi"
import { useResumenFI } from "@/lib/api/use-resumen-fi"

function KpiCard({
  label,
  value,
  detalle,
  href,
  icon: Icon,
}: {
  label: string
  value: string | number
  detalle: React.ReactNode
  href: string
  icon: React.ElementType
}) {
  return (
    <Link href={href} className="block">
      <Card className="shadow-none border-muted-foreground/10 transition-colors hover:border-primary/30 hover:bg-muted/40">
        <CardContent className="space-y-2 pt-5">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <Icon className="size-3.5" />
            {label}
          </div>
          <p className="text-2xl font-black tracking-tight tabular-nums">{value}</p>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {detalle} <IconArrowRight className="size-3" />
          </p>
        </CardContent>
      </Card>
    </Link>
  )
}

function AccesoCard({
  titulo,
  descripcion,
  href,
  icon: Icon,
}: {
  titulo: string
  descripcion: string
  href: string
  icon: React.ElementType
}) {
  return (
    <Link href={href} className="block">
      <Card className="h-full shadow-none border-muted-foreground/10 transition-colors hover:border-primary/30 hover:bg-muted/40">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="size-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-none">{titulo}</p>
            <p className="mt-1 text-xs text-muted-foreground">{descripcion}</p>
          </div>
          <IconArrowRight className="size-4 shrink-0 text-muted-foreground" />
        </CardContent>
      </Card>
    </Link>
  )
}

const ACCESOS = [
  {
    titulo: "Gastos Comunes",
    descripcion: "Fondos, egresos categorizados y emisión mensual del gasto común.",
    href: "/finanzas/gastos-comunes",
    icon: IconCoins,
  },
  {
    titulo: "Recaudación",
    descripcion: "Cobros por unidad, pagos recibidos y gestión de morosidad.",
    href: "/finanzas/pagos",
    icon: IconCash,
  },
  {
    titulo: "Multas",
    descripcion: "Infracciones y multas con su estado de cobro.",
    href: "/finanzas/multas",
    icon: IconGavel,
  },
  {
    titulo: "Remuneraciones",
    descripcion: "Liquidaciones y adelantos del personal de la comunidad.",
    href: "/finanzas/remuneraciones",
    icon: IconWallet,
  },
]

export default function FinanzasPage() {
  const { items: fondos, total: totalFondos, isLoading: cargandoFondos, error: errorFondos } = useFondosFI()
  const { total: totalEgresos, isLoading: cargandoEgresos, error: errorEgresos } = useEgresosFI()
  const { total: totalIngresos, isLoading: cargandoIngresos, error: errorIngresos } = useIngresosFI()
  // Agregados del servidor (GET /api/fi): los montos no se suman en el cliente
  // porque los hooks de colección traen sólo la página 1 del libro.
  const resumen = useResumenFI()

  const clp = (n: number) =>
    n.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 })
  const monto = (n: number) => (resumen.isLoading || resumen.error ? "—" : clp(n))
  const saldoTotal =
    resumen.saldoTotal === undefined || resumen.isLoading || resumen.error
      ? "—"
      : clp(resumen.saldoTotal)

  const cargando = cargandoFondos || cargandoEgresos || cargandoIngresos
  const errores = [errorFondos, errorEgresos, errorIngresos].filter(
    (e): e is Error => e !== null
  )

  // Los fondos son una colección chica de configuración: el conteo de activos
  // sobre los items cargados es fiel (la lista no se recorta en la práctica).
  const fondosActivos = fondos.filter((f) => f.activo).length

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Finanzas</h1>
        <p className="text-sm text-muted-foreground">
          Histórico financiero de la comunidad, servido desde la base de datos.
        </p>
      </div>

      {cargando && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Cargando datos de la base…</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="h-24 w-full animate-pulse rounded-lg bg-muted" />
            <div className="h-24 w-full animate-pulse rounded-lg bg-muted" />
            <div className="h-24 w-full animate-pulse rounded-lg bg-muted" />
          </div>
        </div>
      )}

      {!cargando && errores.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <div className="flex items-center gap-2 font-medium">
            <IconAlertTriangle className="size-4" />
            No se pudo leer el estado financiero desde la base.
          </div>
          <ul className="mt-1 list-inside list-disc text-xs">
            {errores.map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs">Verifica tu sesión y reintenta recargando la página.</p>
        </div>
      )}

      {!cargando && errores.length === 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <KpiCard
            label="Egresos registrados"
            value={totalEgresos.toLocaleString("es-CL")}
            detalle={
              <>
                Monto acumulado: <span className="font-medium">{monto(resumen.montoEgresos)}</span>{" "}
                (detalle en Gastos Comunes)
              </>
            }
            href="/finanzas/gastos-comunes"
            icon={IconCoins}
          />
          <KpiCard
            label="Ingresos a fondo"
            value={totalIngresos.toLocaleString("es-CL")}
            detalle={
              <>
                Monto acumulado: <span className="font-medium">{monto(resumen.montoIngresos)}</span>{" "}
                (detalle en Gastos Comunes)
              </>
            }
            href="/finanzas/gastos-comunes"
            icon={IconCash}
          />
          <KpiCard
            label="Fondos activos"
            value={fondosActivos.toLocaleString("es-CL")}
            detalle={
              <>
                De {totalFondos.toLocaleString("es-CL")} fondos · Saldo:{" "}
                <span className="font-medium">{saldoTotal}</span>
                {!resumen.completo && " (suma de los primeros 100 fondos)"}
              </>
            }
            href="/finanzas/gastos-comunes"
            icon={IconWallet}
          />
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Secciones del módulo
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {ACCESOS.map((a) => (
            <AccesoCard
              key={a.href}
              titulo={a.titulo}
              descripcion={a.descripcion}
              href={a.href}
              icon={a.icon}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
