"use client"

import * as React from "react"
import {
  IconLayoutDashboard,
  IconBook,
  IconUserCheck,
  IconPackage,
  IconCalendarEvent,
  IconClipboardList,
  IconReceipt,
  IconWallet,
  IconGavel,
  IconCash,
  IconSpeakerphone,
  IconUsersGroup,
  IconCertificate,
  IconSmartHome,
  IconBuildingSkyscraper,
  IconTool,
  IconSettings,
  IconUserHeart,
  IconUserStar,
  IconAdjustments,
  IconLock,
  IconHistory,
  IconChevronRight,
  IconCommand,
} from "@tabler/icons-react"

import Image from "next/image"
import { usePathname } from "next/navigation"

import { useCompassStore, useStoreRehydrated } from "@/lib/store"
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

const data = {
  navMain: [
    {
      title: "Inicio",
      url: "/dashboard",
      icon: IconLayoutDashboard,
      roles: ["admin", "conserje", "residente"],
      items: [
        { title: "Resumen", url: "/dashboard" },
      ],
    },
    {
      title: "Operaciones",
      url: "/operaciones",
      icon: IconBook,
      roles: ["admin", "conserje", "residente"],
      items: [
        { title: "Bitácora Diaria", url: "/operaciones/bitacora" },
        { title: "Accesos y Visitas", url: "/operaciones/accesos" },
        { title: "Encomiendas", url: "/operaciones/paqueteria" },
        { title: "Reservas y Amenities", url: "/operaciones/reservas" },
        { title: "Solicitudes", url: "/operaciones/solicitudes" },
      ],
    },
    {
      title: "Finanzas",
      url: "/finanzas",
      icon: IconReceipt,
      roles: ["admin", "residente"],
      items: [
        { title: "Gastos Comunes", url: "/finanzas/gastos-comunes" },
        { title: "Recaudación", url: "/finanzas/pagos" },
        { title: "Multas", url: "/finanzas/multas" },
        { title: "Remuneraciones", url: "/finanzas/remuneraciones", roles: ["admin"] },
      ],
    },
    {
      title: "Comunidad",
      url: "/comunidad",
      icon: IconSpeakerphone,
      roles: ["admin", "residente"],
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
      roles: ["admin"],
      items: [
        { title: "Estructura Física", url: "/inventario/estructura" },
        { title: "Tipos de Unidad", url: "/inventario/tipos" },
        { title: "Recursos y EPP", url: "/inventario/recursos" },
        { title: "Mantenimiento", url: "/inventario/proyectos" },
      ],
    },
    {
      title: "Personas",
      url: "/personas",
      icon: IconUserHeart,
      roles: ["admin"],
      items: [
        { title: "Residentes", url: "/personas/residentes" },
        { title: "Personal", url: "/personas/personal" },
      ],
    },
    {
      title: "Desarrollo AI",
      url: "/admin/dev-dashboard",
      icon: IconAdjustments,
      roles: ["admin"],
      items: [
        { title: "Dashboard OpenSpec", url: "/admin/dev-dashboard" },
        { title: "Laboratorio QA", url: "/admin/qa-lab" },
        { title: "Mantenimiento", url: "/admin/mantenimiento" },
      ],
    },
    {
      title: "Sistema",
      url: "/admin",
      icon: IconSettings,
      roles: ["admin"],
      items: [
        { title: "Auditoría y Métricas", url: "/admin/metricas" },
        { title: "Gestión Administrativa", url: "/admin/gestion" },
        { title: "Maestros Administrativos", url: "/admin/maestros" },
        { title: "Configuración", url: "/admin/configuracion" },
        { title: "Permisos", url: "/admin/permisos" },
        { title: "Logs de Auditoría", url: "/admin/logs" },
      ],
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  useStoreRehydrated()
  const pathname = usePathname()
  const hasHydrated = useCompassStore((s) => s.hasHydrated)
  const configuracion = useCompassStore((s) => s.configuracion)

  // Placeholder para el rol actual (en el futuro vendrá de un AuthContext)
  const currentRole = "admin"

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="/">
                <div className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg bg-primary text-primary-foreground">
                  {hasHydrated && configuracion.logoUrl ? (
                    <Image
                      src={configuracion.logoUrl}
                      alt={configuracion.nombreComunidad}
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
                    {hasHydrated ? configuracion.nombreComunidad : "GECOS"}
                  </span>
                  <span className="truncate text-xs">Administración</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {data.navMain
          .filter(group => group.roles.includes(currentRole))
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
                          {group.items?.map((subItem) => (
                            <SidebarMenuSubItem key={subItem.title}>
                              <SidebarMenuSubButton asChild isActive={pathname === subItem.url}>
                                <a href={subItem.url}>
                                  <span>{subItem.title}</span>
                                </a>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
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
