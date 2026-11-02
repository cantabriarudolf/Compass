"use client"

/**
 * AccesosRapidos — navegación corta de la portada, recortada por permiso.
 *
 * Cada enlace declara el recurso que exige su página; se filtra con la matriz RP
 * (`perfiles.puedeVer`), así que a nadie se le ofrece una puerta que el servidor
 * le va a cerrar. No reemplaza al sidebar: es el atajo de la foto del día.
 */
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import {
  IconArrowRight,
  IconBuildingFactory2,
  IconCalendarEvent,
  IconCertificate,
  IconClipboardList,
  IconDoorEnter,
  IconReceipt,
  IconUserDollar,
} from "@tabler/icons-react"
import { puedeVer } from "./perfiles"

interface EnlaceDashboard {
  titulo: string
  descripcion: string
  href: string
  icono: React.ElementType
  accion: string
  recurso: string
}

const ENLACES: EnlaceDashboard[] = [
  {
    titulo: "Accesos y visitas",
    descripcion: "La puerta de la comunidad, día por día",
    href: "/operaciones/accesos",
    icono: IconDoorEnter,
    accion: "ver",
    recurso: "pe",
  },
  {
    titulo: "Proveedores y servicios",
    descripcion: "Empresas, mantenciones y visitas técnicas",
    href: "/operaciones/proveedores",
    icono: IconBuildingFactory2,
    accion: "ver",
    recurso: "pe",
  },
  {
    titulo: "Gastos comunes",
    descripcion: "Emisiones, cobros y recaudación",
    href: "/finanzas/gastos-comunes",
    icono: IconReceipt,
    accion: "ver",
    recurso: "fi",
  },
  {
    titulo: "Remuneraciones",
    descripcion: "Liquidaciones y adelantos del personal",
    href: "/finanzas/remuneraciones",
    icono: IconUserDollar,
    accion: "ver",
    recurso: "pl",
  },
  {
    titulo: "Reservas y amenities",
    descripcion: "Espacios comunes y reservas",
    href: "/operaciones/reservas",
    icono: IconCalendarEvent,
    accion: "ver",
    recurso: "ra",
  },
  {
    titulo: "Certificados",
    descripcion: "Certificados de la comunidad",
    href: "/comunidad/certificados",
    icono: IconCertificate,
    accion: "ver",
    recurso: "ct",
  },
  {
    titulo: "Solicitudes",
    descripcion: "Requerimientos de mantenimiento",
    href: "/operaciones/solicitudes",
    icono: IconClipboardList,
    accion: "ver",
    recurso: "ir:mantenimiento",
  },
]

export function AccesosRapidos({ roles }: { roles: string[] }) {
  const visibles = ENLACES.filter((enlace) => puedeVer(roles, enlace.accion, enlace.recurso))
  if (visibles.length === 0) return null

  return (
    <Card className="shadow-none border-muted-foreground/10">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <IconClipboardList className="size-5 text-primary" />
          Accesos rápidos
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibles.map((enlace) => (
            <Link key={enlace.href} href={enlace.href} className="block">
              <div className="flex items-center gap-3 rounded-lg border border-muted-foreground/10 p-3 transition-colors hover:border-primary/30 hover:bg-muted/40">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <enlace.icono className="size-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-none">{enlace.titulo}</p>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    {enlace.descripcion}
                  </p>
                </div>
                <IconArrowRight className="size-4 shrink-0 text-muted-foreground" />
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
