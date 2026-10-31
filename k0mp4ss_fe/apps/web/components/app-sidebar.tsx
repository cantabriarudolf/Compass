"use client"

import * as React from "react"
import {
  IconLayoutDashboard,
  IconBook,
  IconReceipt,
  IconSpeakerphone,
  IconBuildingSkyscraper,
  IconSettings,
  IconUserHeart,
  IconChevronRight,
  IconCommand,
  IconClock,
} from "@tabler/icons-react"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { useComunidadActual } from "@/lib/api/use-configuracion"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarRail,
} from "@workspace/ui/components/sidebar"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@workspace/ui/components/collapsible"

// Rutas del menú cuyo page.tsx aún no existe — se destacan en el sidebar para
// evitar 404 silenciosos y señalar trabajo pendiente sin ocultar la opción.
// SERIE-MENU-100 P5: todas las rutas pendientes implementadas — Set vacío (menú 100%).
const RUTAS_PENDIENTES = new Set<string>([])

export const SIDEBAR_GROUPS = [
  "Inicio",
  "Operaciones",
  "Finanzas",
  "Comunidad",
  "Inventario",
  "Personas",
  "Sistema",
] as const

const data = {
  navMain: [
    {
      title: "Inicio",
      url: "/dashboard",
      icon: IconLayoutDashboard,
      roles: ["administrador", "conserjeria", "residente", "comite", "mantencion"],
      items: [
        { title: "Resumen", url: "/dashboard" },
      ],
    },
    {
      title: "Operaciones",
      url: "/operaciones",
      icon: IconBook,
      roles: ["administrador", "conserjeria", "residente", "mantencion"],
      items: [
        { title: "Bitácora Diaria", url: "/operaciones/bitacora" },
        { title: "Accesos y Visitas", url: "/operaciones/accesos" },
        { title: "Encomiendas", url: "/operaciones/paqueteria" },
        { title: "Reservas y Amenities", url: "/operaciones/reservas" },
        { title: "Solicitudes", url: "/operaciones/solicitudes" },
        { title: "Proveedores y Servicios", url: "/operaciones/proveedores" },
      ],
    },
    {
      title: "Finanzas",
      url: "/finanzas",
      icon: IconReceipt,
      roles: ["administrador", "residente", "comite"],
      items: [
        { title: "Gastos Comunes", url: "/finanzas/gastos-comunes" },
        { title: "Recaudación", url: "/finanzas/pagos" },
        { title: "Multas", url: "/finanzas/multas" },
        { title: "Remuneraciones", url: "/finanzas/remuneraciones", roles: ["administrador"] },
      ],
    },
    {
      title: "Comunidad",
      url: "/comunidad",
      icon: IconSpeakerphone,
      roles: ["administrador", "residente", "comite"],
      items: [
        { title: "Directorio de Personas", url: "/comunidad/personas" },
        { title: "Comunicación", url: "/comunidad/comunicacion" },
        { title: "Visor de Mensajes", url: "/comunidad/visor" },
        { title: "Directiva", url: "/comunidad/directiva" },
        { title: "Certificados", url: "/comunidad/certificados" },
        { title: "Portal Inmobiliario", url: "/comunidad/portal" },
      ],
    },
    {
      title: "Inventario",
      url: "/inventario",
      icon: IconBuildingSkyscraper,
      roles: ["administrador", "mantencion"],
      items: [
        { title: "Estructura Física", url: "/inventario/estructura", roles: ["administrador"] },
        { title: "Tipos de Unidad", url: "/inventario/tipos", roles: ["administrador"] },
        { title: "Recursos y EPP", url: "/inventario/recursos", roles: ["administrador", "mantencion"] },
        { title: "Mantenimiento", url: "/inventario/proyectos", roles: ["administrador", "mantencion"] },
      ],
    },
    {
      title: "Personas",
      url: "/personas",
      icon: IconUserHeart,
      roles: ["administrador"],
      items: [
        { title: "Residentes", url: "/personas/residentes" },
        { title: "Personal", url: "/personas/personal" },
      ],
    },
    {
      title: "Sistema",
      url: "/admin",
      icon: IconSettings,
      roles: ["administrador", "comite"],
      items: [
        { title: "Reportería y Dashboards", url: "/admin/reporteria", roles: ["administrador", "comite"] },
        { title: "Auditoría y Métricas", url: "/admin/metricas", roles: ["administrador"] },
        { title: "Gestión Administrativa", url: "/admin/gestion", roles: ["administrador"] },
        { title: "Maestros Administrativos", url: "/admin/maestros", roles: ["administrador"] },
        { title: "Configuración", url: "/admin/configuracion", roles: ["administrador"] },
        { title: "Permisos", url: "/admin/permisos", roles: ["administrador"] },
        { title: "Logs de Auditoría", url: "/admin/logs", roles: ["administrador"] },
        { title: "Carga inicial", url: "/admin/carga-inicial", roles: ["administrador"] },
      ],
    },
  ],
}

export function AppSidebar({ roles = [], ...props }: React.ComponentProps<typeof Sidebar> & { roles?: string[] }) {
  const pathname = usePathname()
  // Marca desde la proyección /api/comunidad-actual (cualquier rol la consulta):
  // mientras carga o si falla, cae al fallback "GECOS" + ícono sin romper la navegación.
  const { nombre: nombreComunidad, logoUrl } = useComunidadActual()
  const hasBrand = Boolean(logoUrl)

  // Roles reales de la sesión (unión de membresías vía Auth.js jwt/session callbacks, lib/auth.ts).
  // Filtrado por intersección: grupo/item visible si algún rol del usuario está en roles declarados.
  // Items sin `roles` heredan visibilidad del grupo.
  const userRoles = roles

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg bg-primary text-primary-foreground">
                  {hasBrand ? (
                    <Image
                      src={logoUrl!}
                      alt={nombreComunidad}
                      width={32}
                      height={32}
                      unoptimized
                      className="size-full object-contain"
                    />
                  ) : (
                    <IconCommand className="size-4" />
                  )}
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">
                    {nombreComunidad || "GECOS"}
                  </span>
                  <span className="truncate text-xs">Administración</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {data.navMain
          .filter((group) => group.roles.some((r: string) => userRoles.includes(r)))
          .map((group) => {
            const isGroupActive = pathname.startsWith(group.url)
            return (
              <SidebarGroup key={group.title}>
                <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
                <SidebarMenu>
                  <Collapsible asChild defaultOpen={isGroupActive} className="group/collapsible">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip={group.title} isActive={isGroupActive}>
                          {group.icon && <group.icon />}
                          <span>{group.title}</span>
                          <IconChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {group.items
                            ?.filter((subItem: { roles?: string[] }) => !subItem.roles || subItem.roles.some((r) => userRoles.includes(r)))
                            .map((subItem) => {
                            const isPendiente = RUTAS_PENDIENTES.has(subItem.url)
                            return (
                              <SidebarMenuSubItem key={subItem.title}>
                                {isPendiente ? (
                                  <SidebarMenuSubButton
                                    aria-disabled
                                    isActive={false}
                                    title="Próximamente — ruta aún no implementada"
                                    className="cursor-not-allowed opacity-60 border border-dashed border-amber-500/30 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-500/20"
                                  >
                                    <span className="flex w-full items-center gap-2">
                                      <span className="truncate">{subItem.title}</span>
                                      <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/30 bg-amber-100 px-1.5 py-0 text-[10px] font-medium leading-none text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-500/30">
                                        <IconClock className="size-3" />
                                        Próximamente
                                      </span>
                                    </span>
                                  </SidebarMenuSubButton>
                                ) : (
                                  <SidebarMenuSubButton asChild isActive={pathname === subItem.url}>
                                    <a href={subItem.url}>
                                      <span>{subItem.title}</span>
                                    </a>
                                  </SidebarMenuSubButton>
                                )}
                              </SidebarMenuSubItem>
                            )
                          })}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                </SidebarMenu>
              </SidebarGroup>
            )
          })}
      </SidebarContent>
      <SidebarFooter>
        <div className="p-4 text-xs text-muted-foreground text-center">
          v1.1.0 - Modular Architecture
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
