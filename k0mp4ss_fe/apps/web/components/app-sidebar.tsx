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
        // Los registros de acceso (visitas, encomiendas y trabajos) viven en un solo módulo:
        // /operaciones/accesos ya muestra la lista consolidada del día, así que el menú deja
        // una única entrada para todos ellos. Las páginas /operaciones/bitacora y
        // /operaciones/paqueteria quedaron retiradas y redirigen en el servidor a esta ruta,
        // así que tampoco se listan acá para no duplicar el registro.
        { title: "Accesos", url: "/operaciones/accesos" },
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
      // El grupo se declara también para conserjería y mantención porque el
      // directorio de emergencias (`pe:directorio` ver) es de TODOS los roles: si
      // el grupo no incluyera a esos dos, la única entrada que les corresponde
      // quedaría invisible. Para que eso no les abra el resto de Comunidad, cada
      // ítem de abajo lleva sus propios roles (antes heredaban del grupo).
      roles: ["administrador", "conserjeria", "residente", "comite", "mantencion"],
      items: [
        {
          title: "Directorio de Emergencias",
          url: "/comunidad/directorio",
          // Mismos roles que el permiso `pe:directorio` ver en la matriz RP
          // (`lib/authz.ts`) + el comodín del administrador. El page.tsx además
          // exige sesión y ese permiso en el servidor.
          roles: ["administrador", "conserjeria", "residente", "comite", "mantencion"],
        },
        { title: "Directorio de Personas", url: "/comunidad/personas", roles: ["administrador", "residente", "comite"] },
        { title: "Comunicación", url: "/comunidad/comunicacion", roles: ["administrador", "residente", "comite"] },
        {
          // F35 serie A: el archivo de documentos de la comunidad (Ley 21.442
          // art. 9). Mismos roles que la clave `doc` ver: administración,
          // comité y residente. El page.tsx además exige el permiso y la sesión
          // en el servidor, y la API valida cada lectura y escritura.
          title: "Archivo",
          url: "/comunidad/archivo",
          roles: ["administrador", "residente", "comite"],
        },
        { title: "Visor de Mensajes", url: "/comunidad/visor", roles: ["administrador", "residente", "comite"] },
        { title: "Directiva", url: "/comunidad/directiva", roles: ["administrador", "residente", "comite"] },
        // Acuerdos del comité: el registro expone quién votó qué, así que la
        // pantalla no se le ofrece al residente aunque `gd:ver` lo tendría para
        // el acta. El portón real está en la página y en el GET.
        {
          title: "Acuerdos",
          url: "/comunidad/directiva/acuerdos",
          roles: ["administrador", "comite"],
        },
        { title: "Certificados", url: "/comunidad/certificados", roles: ["administrador", "residente", "comite"] },
        {
          // F27: el aviso de cobro con el que se cobra. Mismos roles que la
          // lectura de la ruta: el residente ve el de sus unidades
          // (`fi:aviso:propio`), administración y comité los de la comunidad
          // (`fi:gasto_comun`).
          title: "Avisos de Cobro",
          url: "/comunidad/avisos-cobro",
          roles: ["administrador", "residente", "comite"],
        },
        {
          // La deuda PROPIA del residente, siempre y solo la suya. Mismos roles
          // que la compuerta de la ruta (`fi:aviso:propio` ver): el residente y
          // el comodín de la administración. La bandera `residenteVeMorosidad`
          // NO interviene (decisión del owner 2026-11-08): lo que garantiza el
          // alcance es el filtro por fila de la API, no un interruptor. El
          // comité no entra porque la clave está vacía para su rol, y el menú
          // no puede ofrecer una pantalla que el servidor va a rechazar.
          title: "Mi Estado de Cuenta",
          url: "/comunidad/mi-estado-cuenta",
          roles: ["administrador", "residente"],
        },
        {
          // T10 de la serie «Permisos por objeto»: la liquidación de sueldo de su
          // persona. Mismos roles que la lectura de la ruta: conserjería por
          // `pl:propia` ver (el trabajador) y la administración por `pl` ver (y su
          // comodín). El page.tsx además exige el permiso en el servidor.
          title: "Mis Liquidaciones",
          url: "/comunidad/mis-liquidaciones",
          roles: ["administrador", "conserjeria"],
        },
        { title: "Portal Inmobiliario", url: "/comunidad/portal", roles: ["administrador", "residente", "comite"] },
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
        // El calendario preventivo vivía dentro de /operaciones/proveedores; el owner
        // lo separó a un panel propio, así que la entrada va en Sistema (grupo del
        // administrador) y no en Operaciones. El page.tsx del panel además exige rol
        // administrador en el servidor.
        { title: "Mantenciones Preventivas", url: "/admin/mantenciones", roles: ["administrador"] },
        // Los elementos reservables se creaban dentro de la pestaña "Elementos" de
        // /operaciones/reservas; el owner pidió esa misma opción en el menú del
        // administrador. Acá se administra el catálogo de amenities (crear, editar,
        // habilitar/deshabilitar) y las reservas de los residentes siguen en
        // Operaciones. El page.tsx del panel además exige rol administrador en el servidor.
        { title: "Elementos", url: "/admin/elementos", roles: ["administrador"] },
        // Alerta de reservas: la cola de autorización del administrador. Va junto a
        // Elementos porque es la otra mitad del mismo módulo (el dueño del pedido: la
        // lista de reservas de Operaciones no dice qué autorizar). El page.tsx del panel
        // exige rol administrador en el servidor y la API de la cola exige `editar` en RA.
        { title: "Alerta de reservas", url: "/admin/reservas", roles: ["administrador"] },
        { title: "Gestión Administrativa", url: "/admin/gestion", roles: ["administrador"] },
        // Vigencia del Registro de Copropietarios (Ley 21.442 art. 9): la ley
        // obliga a la administración a requerir la actualización cada año y el
        // Comité debe ver el estado. La entrada refleja la matriz (`ad` + `editar`),
        // no la amplía: el portón real está en la página y en las cuatro rutas.
        {
          title: "Vigencia del Registro",
          url: "/admin/gestion/vigencia-registro",
          roles: ["administrador", "comite"],
        },
        {
          title: "Convenios de Pago",
          url: "/admin/gestion/convenios",
          roles: ["administrador", "comite"],
        },
        {
          title: "Conciliación Bancaria",
          url: "/admin/gestion/conciliacion",
          roles: ["administrador", "comite"],
        },
        {
          title: "Presupuesto por Partidas",
          url: "/admin/gestion/presupuestos",
          roles: ["administrador", "comite"],
        },
        {
          title: "Reparto por Sector",
          url: "/admin/gestion/repartos-sector",
          roles: ["administrador", "comite"],
        },
        { title: "Maestros Administrativos", url: "/admin/maestros", roles: ["administrador"] },
        { title: "Configuración", url: "/admin/configuracion", roles: ["administrador"] },
        {
          title: "Credencial de correo",
          url: "/admin/configuracion/correo",
          roles: ["administrador", "comite"],
        },
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
