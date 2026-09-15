"use client"

import * as React from "react"
import { useCompassStore, useStoreRehydrated, StoreResult } from "@/lib/store"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@workspace/ui/components/card"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { Input } from "@workspace/ui/components/input"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { ScrollArea, ScrollBar } from "@workspace/ui/components/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  IconSearch,
  IconPlus,
  IconAlertTriangleFilled,
  IconUserCircle,
  IconUsers,
  IconBuildingSkyscraper,
  IconBriefcase,
  IconGavel,
  IconTool,
  IconPencil,
} from "@tabler/icons-react"
import Link from "next/link"

import { Persona } from "@/data/comunidad/personas"
import { FormularioPersona } from "@/components/comunidad/formulario-persona"
import { RolesDonut } from "@/components/comunidad/roles-donut"

const ROLES_TAB_CONFIG: { id: string; label: string; icon: React.ReactNode }[] = [
  { id: "todos", label: "TODOS", icon: <IconUsers className="size-4" /> },
  { id: "propietario", label: "PROPIETARIOS", icon: <IconBuildingSkyscraper className="size-4" /> },
  { id: "residente", label: "RESIDENTES", icon: <IconBuildingSkyscraper className="size-4" /> },
  { id: "personal", label: "PERSONAL", icon: <IconBriefcase className="size-4" /> },
  { id: "directiva", label: "DIRECTIVA", icon: <IconGavel className="size-4" /> },
  { id: "contratista", label: "CONTRATISTAS", icon: <IconTool className="size-4" /> },
]

const ESTADOS_CUENTA = ["activos", "inactivos", "bloqueados"] as const

const getRoleBadgeVariant = (rol: string) => {
  switch (rol) {
    case "propietario": return "default" // indigo
    case "residente": return "destructive" // emerald-like via destructive variant with custom class
    case "personal": return "default"
    case "directiva": return "default"
    case "contratista": return "secondary"
    default: return "outline"
  }
}

const getRoleBadgeClass = (rol: string) => {
  switch (rol) {
    case "residente": return "bg-emerald-600 hover:bg-emerald-700 text-white"
    case "personal": return "bg-slate-600 hover:bg-slate-700 text-white"
    case "directiva": return "bg-amber-600 hover:bg-amber-700 text-white"
    case "contratista": return "bg-gray-600 hover:bg-gray-700 text-white"
    default: return ""
  }
}

export default function DirectorioPersonasPage() {
  useStoreRehydrated()
  const hasHydrated = useCompassStore(s => s.hasHydrated)
  const listaPersonas = useCompassStore(s => s.personas)
  const savePersona = useCompassStore(s => s.savePersona)

  const [searchTerm, setSearchTerm] = React.useState("")
  const [isModalOpen, setIsModalOpen] = React.useState(false)
  const [editingPersona, setEditingPersona] = React.useState<Persona | null>(null)

  // Tab state (por rol)
  const [selectedRole, setSelectedRole] = React.useState("todos")

  // Sidebar state (por estado de cuenta)
  const [selectedEstado, setSelectedEstado] = React.useState<string>("todos")

  // Donut filter (por rol, sincronizado con tabs)
  const [donutRole, setDonutRole] = React.useState<string | undefined>(undefined)

  // Contadores por rol
  const countByRole = React.useMemo(() => {
    const counts: Record<string, number> = { todos: listaPersonas.length }
    for (const p of listaPersonas) {
      for (const r of p.roles) {
        counts[r] = (counts[r] || 0) + 1
      }
    }
    return counts
  }, [listaPersonas])

  // Contadores por estado
  const countByEstado = React.useMemo(() => {
    const counts: Record<string, number> = { todos: listaPersonas.length }
    for (const p of listaPersonas) {
      counts[p.estadoCuenta] = (counts[p.estadoCuenta] || 0) + 1
    }
    return counts
  }, [listaPersonas])

  // Filtrado multi-escala
  const personasFiltradas = React.useMemo(() => {
    let result = listaPersonas

    // Filtro por rol (tab o donut)
    const activeRoleFilter = donutRole || (selectedRole !== "todos" ? selectedRole : undefined)
    if (activeRoleFilter) {
      result = result.filter(p => p.roles.map(r => String(r)).includes(String(activeRoleFilter)))
    }

    // Filtro por estado (sidebar)
    if (selectedEstado !== "todos") {
      result = result.filter(p => p.estadoCuenta === selectedEstado)
    }

    // Búsqueda por nombre o RUT
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase()
      result = result.filter(p =>
        p.nombreCompleto.toLowerCase().includes(q) ||
        p.rut.includes(searchTerm)
      )
    }

    return result
  }, [listaPersonas, selectedRole, selectedEstado, searchTerm, donutRole])

  const scopeLabel = selectedRole === "todos"
    ? "Vista Global"
    : ROLES_TAB_CONFIG.find(r => r.id === selectedRole)?.label || selectedRole

  const handleRoleTabChange = (id: string) => {
    setSelectedRole(id)
    setDonutRole(undefined)
  }

  const handleDonutSelect = (roleId: string) => {
    if (donutRole === roleId) {
      setDonutRole(undefined)
      setSelectedRole("todos")
    } else {
      setDonutRole(roleId)
      setSelectedRole(roleId)
    }
  }

  const abrirEditar = (persona: Persona) => {
    setEditingPersona(persona)
    setIsModalOpen(true)
  }

  const abrirCrear = () => {
    setEditingPersona(null)
    setIsModalOpen(true)
  }

  const handleSave = (data: Partial<Persona>): StoreResult => {
    const resultado = savePersona(data as Persona)
    if (resultado.ok) {
      setIsModalOpen(false)
      setEditingPersona(null)
    }
    return resultado
  }

  if (!hasHydrated) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="h-9 w-72 rounded bg-muted/40" />
        <div className="h-4 w-96 max-w-full rounded bg-muted/30" />
        <div className="h-10 w-full rounded-md bg-muted/30" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="h-80 rounded-lg bg-muted/30 md:col-span-1" />
          <div className="h-80 rounded-lg bg-muted/30 md:col-span-3" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Directorio de Comunidad</h1>
          <p className="text-muted-foreground">
            Gestión centralizada de propietarios, residentes y personal de la comunidad.
          </p>
        </div>
        <Button className="gap-2" onClick={abrirCrear}>
          <IconPlus className="size-4" /> Nuevo Registro
        </Button>
      </div>

      {/* MODAL CREAR / EDITAR */}
      <Dialog open={isModalOpen} onOpenChange={(open) => {
        setIsModalOpen(open)
        if (!open) setEditingPersona(null)
      }}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>{editingPersona ? "Editar Identidad" : "Nueva Identidad"}</DialogTitle>
            <DialogDescription>
              {editingPersona
                ? "Modifica los datos de esta persona en el sistema."
                : "Registra una nueva persona en el sistema y asígnale sus roles correspondientes."}
            </DialogDescription>
          </DialogHeader>
          <FormularioPersona
            persona={editingPersona ?? undefined}
            onSave={handleSave}
            onCancel={() => { setIsModalOpen(false); setEditingPersona(null) }}
          />
        </DialogContent>
      </Dialog>

      {/* TABS SCROLLABLES POR ROL */}
      {listaPersonas.length > 0 && (
        <Tabs value={selectedRole} onValueChange={handleRoleTabChange} className="w-full">
          <ScrollArea className="w-full whitespace-nowrap rounded-md border bg-muted/50 p-1 mb-2">
            <TabsList className="inline-flex w-max">
              {ROLES_TAB_CONFIG.map(tab => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="gap-2 uppercase text-[10px] font-bold"
                >
                  {tab.icon}
                  {tab.label}
                  {tab.id !== "todos" && (
                    <Badge variant="secondary" className="ml-1 text-[8px] h-4 px-1">
                      {countByRole[tab.id] || 0}
                    </Badge>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>

          {/* DONUT CHART */}
          <div className="pt-2">
            <RolesDonut
              roles={listaPersonas.flatMap(p => p.roles)}
              scopeLabel={scopeLabel}
              selectedId={donutRole}
              onSelect={handleDonutSelect}
            />
          </div>

          {/* LAYOUT DOS COLUMNAS: SIDEBAR + TABLA */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-6">
            {/* SIDEBAR: Subcategorías por estado */}
            <Card className="md:col-span-1 h-fit">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <IconUsers className="size-4" />
                  Estado Cuenta
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="flex flex-col">
                  <button
                    onClick={() => setSelectedEstado("todos")}
                    className={`flex items-center justify-between px-4 py-3 text-xs transition-colors hover:bg-muted ${
                      selectedEstado === "todos"
                        ? "bg-muted font-bold border-l-4 border-primary"
                        : "border-l-4 border-transparent opacity-70"
                    }`}
                  >
                    VER TODOS
                    <span className="text-[9px] font-bold text-muted-foreground tabular-nums">
                      {countByEstado.todos}
                    </span>
                  </button>
                  {ESTADOS_CUENTA.map(estado => (
                    <button
                      key={estado}
                      onClick={() => setSelectedEstado(estado)}
                      className={`flex items-center justify-between px-4 py-3 text-xs transition-colors hover:bg-muted ${
                        selectedEstado === estado
                          ? "bg-muted font-medium border-l-4 border-primary"
                          : "border-l-4 border-transparent opacity-70"
                      }`}
                    >
                      {estado.toUpperCase()}
                      <span className="text-[9px] font-bold text-muted-foreground tabular-nums">
                        {countByEstado[estado] || 0}
                      </span>
                    </button>
                  ))}
                  <div className="p-3 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-[10px] font-bold uppercase"
                      onClick={abrirCrear}
                    >
                      <IconPlus className="size-3 mr-1" />
                      Crear Nueva Persona
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* TABLA PRINCIPAL */}
            <Card className="md:col-span-3">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Personas</CardTitle>
                  <CardDescription>
                    {personasFiltradas.length} personas en este filtro.
                  </CardDescription>
                </div>
                <div className="relative w-64">
                  <IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Buscar por nombre o RUT..."
                    className="pl-8 h-9 text-xs"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </CardHeader>
              <CardContent>
                {/* FILTROS RÁPIDOS POR ESTADO */}
                <div className="flex items-center gap-2 mb-4 bg-muted/30 p-2 rounded-md border border-dashed overflow-x-auto no-scrollbar">
                  <span className="text-[9px] font-black text-muted-foreground uppercase px-2 shrink-0">Filtro Rápido:</span>
                  <Button
                    variant={selectedEstado === "todos" ? "default" : "ghost"}
                    size="sm"
                    className="h-6 text-[9px] font-bold px-2"
                    onClick={() => setSelectedEstado("todos")}
                  >
                    TODOS
                  </Button>
                  {ESTADOS_CUENTA.map(estado => (
                    <Button
                      key={estado}
                      variant={selectedEstado === estado ? "default" : "ghost"}
                      size="sm"
                      className={`h-6 text-[9px] font-bold px-2 ${selectedEstado === estado ? "" : "text-muted-foreground hover:text-foreground"}`}
                      onClick={() => setSelectedEstado(estado)}
                    >
                      {estado.toUpperCase()}
                    </Button>
                  ))}
                </div>

                {/* TABLA */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[300px]">Identidad</TableHead>
                      <TableHead>Contacto</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {personasFiltradas.map((persona) => (
                      <TableRow key={persona.id} className="group">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="size-10 rounded-full bg-muted flex items-center justify-center border-2 border-transparent group-hover:border-primary/20 transition-colors">
                              <IconUserCircle className="size-6 text-muted-foreground" />
                            </div>
                            <div className="flex flex-col">
                              <span className="font-bold flex items-center gap-1.5">
                                {persona.nombreCompleto}
                                {persona.condicionesEspecialesIds.length > 0 && (
                                  <IconAlertTriangleFilled className="size-4 text-amber-500" title="Condición Especial Registrada" />
                                )}
                              </span>
                              <span className="text-xs font-mono text-muted-foreground">{persona.rut}</span>
<div className="flex flex-wrap gap-1 mt-1">
                                {persona.roles.map(rol => (
                                  <Badge key={rol} variant={getRoleBadgeVariant(rol)} className={`${getRoleBadgeClass(rol)} text-[9px] uppercase font-bold px-1.5 py-0`}>
                                    {rol}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-xs font-medium">{persona.telefonoMovil}</span>
                            <span className="text-[10px] text-muted-foreground">{persona.email}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={persona.estadoCuenta === "activa" ? "outline" : "destructive"} className="text-[10px] uppercase font-bold">
                            {persona.estadoCuenta}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" aria-label={`Editar ${persona.nombres} ${persona.apellidos}`} onClick={() => abrirEditar(persona)}>
                              <IconPencil className="size-4" />
                            </Button>
                            <Button variant="secondary" size="sm" asChild className="text-xs font-bold">
                              <Link href={`/comunidad/personas/${persona.id}`}>
                                Ver Ficha
                              </Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}

                    {personasFiltradas.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4}>
                          <div className="py-12 text-center border border-dashed rounded-md bg-muted/20 space-y-3">
                            <IconUsers className="size-10 mx-auto text-muted-foreground/40" />
                            <div>
                              <p className="font-semibold text-sm">Sin resultados</p>
                              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                                No se encontraron personas con los filtros seleccionados.
                                Probá cambiando el rol en las pestañas o el estado en el panel lateral.
                              </p>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => {
                              setSelectedRole("todos")
                              setSelectedEstado("todos")
                              setDonutRole(undefined)
                              setSearchTerm("")
                            }}>
                              Limpiar Filtros
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </Tabs>
      )}

      {/* EMPTY STATE: Sin personas creadas */}
      {listaPersonas.length === 0 && (
        <Card className="p-8 text-center border-dashed">
          <CardHeader>
            <CardTitle className="text-lg">Faltan personas registradas</CardTitle>
            <CardDescription className="space-y-2">
              <p>
                Aún no hay personas en el sistema. Creá la primera persona para comenzar a gestionar
                propietarios, residentes y personal de la comunidad.
              </p>
              <p>
                Cada persona puede tener múltiples <strong>roles</strong> que determinan qué extensiones
                y datos se muestran en su ficha.
              </p>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <Button onClick={abrirCrear}>
              <IconPlus className="size-4 mr-2" />
              Crear primera persona
            </Button>
            <p className="text-[10px] text-muted-foreground">
              Después de crear la persona, podés vincularla a unidades del inventario físico.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
