"use client"

import * as React from "react"
import { useCompassStore, useStoreRehydrated } from "@/lib/store"
import { hexDesdeId } from "@/lib/colors"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@workspace/ui/components/table"
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter
} from "@workspace/ui/components/dialog"
import { 
  IconPalette, 
  IconTags, 
  IconPlus, 
  IconPencil, 
  IconUsers,
  IconReceipt2,
  IconPhoneCall,
  IconUserExclamation,
  IconBuildingBank,
  IconBuildingSkyscraper,
  IconBuildingCottage,
  IconMapPin,
  IconHome,
  IconAlertTriangle
} from "@tabler/icons-react"

const BADGE_OPTIONS = [
  { value: "bg-blue-500 text-white", label: "Azul" },
  { value: "bg-emerald-500 text-white", label: "Verde" },
  { value: "bg-amber-500 text-black", label: "Ámbar" },
  { value: "bg-purple-500 text-white", label: "Morado" },
  { value: "bg-rose-500 text-white", label: "Rojo" },
  { value: "bg-cyan-500 text-white", label: "Cian" },
  { value: "bg-zinc-500 text-white", label: "Gris" },
]

const DEFAULT_BADGE_COLOR = "bg-blue-500 text-white"

const BADGE_COLOR_VALUES = new Set(BADGE_OPTIONS.map(o => o.value))

function normalizeBadgeColor(color?: string): string {
  if (color && BADGE_COLOR_VALUES.has(color)) return color
  if (color) {
    const family = color.match(/bg-([a-z]+)-\d+/)?.[1]
    const canonical = family && BADGE_OPTIONS.find(o => o.value.startsWith(`bg-${family}-`))
    if (canonical) return canonical.value
  }
  return DEFAULT_BADGE_COLOR
}


export default function MaestrosPage() {
  useStoreRehydrated()
  const hasHydrated = useCompassStore(s => s.hasHydrated)
  const estados = useCompassStore(s => s.maestros.estadosOcupacion)
  const macros = useCompassStore(s => s.maestros.categoriasMacro)
  const micros = useCompassStore(s => s.maestros.categoriasMicro)
  const tiposPropiedad = useCompassStore(s => s.maestros.categoriasUnidad)
  const ubicaciones = useCompassStore(s => s.maestros.ubicacionesEstacionamiento)
  const estadosInmobiliarios = useCompassStore(s => s.maestros.estadosInmobiliarios)
  const condiciones = useCompassStore(s => s.maestros.condicionesEspeciales)
  const bancos = useCompassStore(s => s.maestros.bancos)
  const emergencias = useCompassStore(s => s.maestros.contactosEmergencia)
  const saveMaestro = useCompassStore(s => s.saveMaestro)
  
  const [editingItem, setEditingItem] = React.useState<any>(null)
  const [isDialogOpen, setIsDialogOpen] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState("inventario")
  const [subTab, setSubTab] = React.useState<string | null>(null)
  const [duplicateError, setDuplicateError] = React.useState<string | null>(null)

  const TAB_SUBTABS: Record<string, string[]> = {
    inventario: ["estados", "macros", "micros", "tipos", "ubicaciones"],
    personas: ["condiciones", "estadosInmobiliarios", "emergencias"],
    finanzas: ["bancos"],
  }
  const isValidSubTab = TAB_SUBTABS[activeTab]?.includes(subTab ?? "")

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    setSubTab(null)
  }

  const handleSubTabChange = (tab: string) => {
    setSubTab(tab)
    setDuplicateError(null)
  }

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const nombre = (formData.get("nombre") as string)?.trim()
    const valor = formData.get("telefono") as string
    const color = formData.get("color") as string

    if (!nombre || !subTab) return

    const collections: Record<string, { nombre: string; id: string }[]> = {
      estados, macros, micros, tipos: tiposPropiedad, ubicaciones,
      condiciones, estadosInmobiliarios, bancos, emergencias,
    }
    const currentCollection = collections[subTab] ?? []
    const duplicate = currentCollection.find(
      (item: { nombre: string; id: string }) => item.nombre.toLowerCase() === nombre.toLowerCase() && item.id !== editingItem?.id
    )
    if (duplicate) {
      setDuplicateError(`Ya existe un registro con el nombre "${nombre}".`)
      return
    }
    setDuplicateError(null)
    
    if (subTab === "estados") {
      const id = editingItem?.id ?? `est-${Date.now()}`
      saveMaestro("estadosOcupacion", { id, nombre, color, hex: editingItem?.hex ?? hexDesdeId(id) })
    } else if (subTab === "macros") {
      if (editingItem) saveMaestro("categoriasMacro", { ...editingItem, nombre })
      else saveMaestro("categoriasMacro", { id: Date.now().toString(), nombre })
    } else if (subTab === "micros") {
      if (editingItem) saveMaestro("categoriasMicro", { ...editingItem, nombre })
      else saveMaestro("categoriasMicro", { id: Date.now().toString(), nombre })
    } else if (subTab === "tipos") {
      if (editingItem) saveMaestro("categoriasUnidad", { ...editingItem, nombre })
      else saveMaestro("categoriasUnidad", { id: Date.now().toString(), nombre })
    } else if (subTab === "ubicaciones") {
      if (editingItem) saveMaestro("ubicacionesEstacionamiento", { ...editingItem, nombre })
      else saveMaestro("ubicacionesEstacionamiento", { id: Date.now().toString(), nombre })
    } else if (subTab === "estadosInmobiliarios") {
      if (editingItem) saveMaestro("estadosInmobiliarios", { ...editingItem, nombre, color })
      else saveMaestro("estadosInmobiliarios", { id: Date.now().toString(), nombre, color })
    } else if (subTab === "condiciones") {
      if (editingItem) saveMaestro("condicionesEspeciales", { ...editingItem, nombre, color })
      else saveMaestro("condicionesEspeciales", { id: Date.now().toString(), nombre, color })
    } else if (subTab === "bancos") {
      if (editingItem) saveMaestro("bancos", { ...editingItem, nombre })
      else saveMaestro("bancos", { id: Date.now().toString(), nombre })
    } else if (subTab === "emergencias") {
      if (editingItem) saveMaestro("contactosEmergencia", { ...editingItem, nombre, telefono: valor })
      else saveMaestro("contactosEmergencia", { id: Date.now().toString(), nombre, telefono: valor })
    }
    
    setIsDialogOpen(false)
    setEditingItem(null)
  }

  if (!hasHydrated) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="h-9 w-72 rounded bg-muted/40" />
        <div className="h-4 w-96 max-w-full rounded bg-muted/30" />
        <div className="h-64 w-full rounded-lg bg-muted/30" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Maestros Administrativos</h1>
          <p className="text-muted-foreground">Acá se cargan las categorías que el sistema usa en toda la comunidad: tipos de sectores (Torre, Piso…), categorías de unidades, estados de ocupación, etc. Lo que crees acá aparece como opción en los formularios de Inventario, Estructura Física y demás módulos.</p>
        </div>
        <Button disabled={!isValidSubTab} onClick={() => { setEditingItem(null); setDuplicateError(null); setIsDialogOpen(true); }} className="gap-2" title={!isValidSubTab ? "Seleccioná una categoría de la izquierda primero" : undefined}>
          <IconPlus className="size-4" /> Nuevo Registro
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="bg-muted/50 p-1 mb-8">
          <TabsTrigger value="inventario" className="gap-2">
            <IconTags className="size-4" /> Estructura e Inventario
          </TabsTrigger>
          <TabsTrigger value="personas" className="gap-2">
            <IconUsers className="size-4" /> Personas y Comunidad
          </TabsTrigger>
          <TabsTrigger value="finanzas" className="gap-2">
            <IconReceipt2 className="size-4" /> Finanzas y RRHH
          </TabsTrigger>
        </TabsList>

        {/* --- TABS DE INVENTARIO --- */}
        <TabsContent value="inventario">
          <div className="grid grid-cols-4 gap-6">
            <div className="flex flex-col gap-2">
              <Button variant={subTab === "estados" ? "default" : "ghost"} className="justify-start gap-2" onClick={() => handleSubTabChange("estados")}>
                <IconPalette className="size-4" /> Estados de Ocupación
              </Button>
              <Button variant={subTab === "macros" ? "default" : "ghost"} className="justify-start gap-2" onClick={() => handleSubTabChange("macros")}>
                <IconTags className="size-4" /> Categorías Macro Sectores
              </Button>
              <Button variant={subTab === "micros" ? "default" : "ghost"} className="justify-start gap-2" onClick={() => handleSubTabChange("micros")}>
                <IconBuildingSkyscraper className="size-4" /> Categorías Micro Sectores
              </Button>
              <Button variant={subTab === "tipos" ? "default" : "ghost"} className="justify-start gap-2" onClick={() => handleSubTabChange("tipos")}>
                <IconBuildingCottage className="size-4" /> Categorías de Unidad
              </Button>
              <Button variant={subTab === "ubicaciones" ? "default" : "ghost"} className="justify-start gap-2" onClick={() => handleSubTabChange("ubicaciones")}>
                <IconMapPin className="size-4" /> Ubicaciones de Estacionamiento
              </Button>
            </div>
            
            <Card className="col-span-3">
              <CardHeader>
                <CardTitle>
                  {!subTab
                    ? "Seleccioná una categoría"
                    : subTab === "estados"
                      ? "Semántica de Estados"
                      : subTab === "macros"
                        ? "Categorías Macro Sectores"
                        : subTab === "micros"
                          ? "Categorías Micro Sectores"
                          : subTab === "tipos"
                            ? "Categorías de Unidad"
                            : subTab === "ubicaciones"
                              ? "Ubicaciones de Estacionamiento"
                              : "Jerarquía de Sectores"}
                </CardTitle>
                <CardDescription>
                  {!subTab
                    ? "Elegí una categoría del menú de la izquierda para ver y administrar sus registros."
                    : subTab === "estados"
                      ? <>Estos estados definen la condición de ocupación de cada unidad y se reflejan automáticamente en el mapa de departamentos y estacionamientos.</>
                      : subTab === "tipos"
                        ? <>Estas categorías alimentan el campo <strong>Categoría</strong> del módulo <strong>Tipos de Unidad (TU)</strong> y la etiqueta de las unidades en <strong>Estructura Física</strong>.</>
                        : subTab === "ubicaciones"
                          ? <>Estas ubicaciones permiten sectorizar los estacionamientos de la comunidad (Superficie, Subterráneo, Sector Visitas…) para poder ubicar y agrupar las plazas en el módulo <strong>Estacionamientos (ES)</strong>.</>
                          : subTab === "macros"
                            ? <>Son los distintos tipos de Macro-Sectores que puede tener la comunidad. El sector concreto (ej: Torre A) se crea luego en <strong>Inventario → Estructura Física</strong>.</>
                            : <>Son los distintos tipos de Micro-Sectores que puede tener un Macro-Sector. El sector concreto (ej: Piso 1) se crea luego en <strong>Inventario → Estructura Física</strong>.</>}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      {subTab === "estados" && <TableHead>Badge Visual</TableHead>}
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!subTab ? (
                      <TableRow>
                        <TableCell colSpan={subTab === "estados" ? 3 : 2} className="text-center text-muted-foreground py-8">
                          Seleccioná una categoría de la izquierda para ver los registros.
                        </TableCell>
                      </TableRow>
                    ) : (subTab === "estados"
                      ? estados
                      : subTab === "micros"
                        ? micros
                        : subTab === "tipos"
                          ? tiposPropiedad
                          : subTab === "ubicaciones"
                            ? ubicaciones
                            : macros
                    ).map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-bold">{item.nombre}</TableCell>
                        {subTab === "estados" && (
                          <TableCell>
                            <Badge className={`${"color" in item && item.color ? item.color : DEFAULT_BADGE_COLOR} font-bold uppercase text-[10px]`}>{item.nombre}</Badge>
                          </TableCell>
                        )}
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => { setEditingItem(item); setDuplicateError(null); setIsDialogOpen(true); }}>
                            <IconPencil className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* --- TABS DE PERSONAS --- */}
        <TabsContent value="personas">
          <div className="grid grid-cols-4 gap-6">
            <div className="flex flex-col gap-2">
              <Button variant={subTab === "condiciones" ? "default" : "ghost"} className="justify-start gap-2" onClick={() => handleSubTabChange("condiciones")}>
                <IconUserExclamation className="size-4" /> Condiciones Especiales
              </Button>
              <Button variant={subTab === "estadosInmobiliarios" ? "default" : "ghost"} className="justify-start gap-2" onClick={() => handleSubTabChange("estadosInmobiliarios")}>
                <IconHome className="size-4" /> Estados Inmobiliarios
              </Button>
              <Button variant={subTab === "emergencias" ? "default" : "ghost"} className="justify-start gap-2" onClick={() => handleSubTabChange("emergencias")}>
                <IconPhoneCall className="size-4" /> Directorio de Emergencia
              </Button>
            </div>
            
            <Card className="col-span-3 border-purple-100">
              <CardHeader>
                <CardTitle>
                  {!subTab
                    ? "Seleccioná una categoría"
                    : subTab === "condiciones" ? "Etiquetas de Vulnerabilidad" : subTab === "estadosInmobiliarios" ? "Estados Inmobiliarios" : "Números Críticos"}
                </CardTitle>
                <CardDescription>
                  {!subTab
                    ? "Elegí una categoría del menú de la izquierda para ver y administrar sus registros."
                    : subTab === "estadosInmobiliarios"
                      ? <>Estados de ocupación de la propiedad usados en el módulo <strong>Vinculación de Unidades (VU)</strong>.</>
                      : "Parámetros para la seguridad y bienestar de los residentes."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Identificador</TableHead>
                      <TableHead>{subTab === "condiciones" || subTab === "estadosInmobiliarios" ? "Badge Visual" : "Número / Contacto"}</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!subTab ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                          Seleccioná una categoría de la izquierda para ver los registros.
                        </TableCell>
                      </TableRow>
                    ) : (subTab === "condiciones" ? condiciones : subTab === "estadosInmobiliarios" ? estadosInmobiliarios : emergencias).map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-bold">{item.nombre}</TableCell>
                        <TableCell>
                          {subTab === "condiciones" || subTab === "estadosInmobiliarios" ? (
                            <Badge className={`${"color" in item ? item.color || DEFAULT_BADGE_COLOR : DEFAULT_BADGE_COLOR} font-black text-[9px]`}>{item.nombre.toUpperCase()}</Badge>
                          ) : subTab === "emergencias" ? (
                            <span className="text-sm font-mono text-blue-600">{(item as { telefono?: string }).telefono}</span>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => { setEditingItem(item); setDuplicateError(null); setIsDialogOpen(true); }}>
                            <IconPencil className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* --- TABS DE FINANZAS --- */}
        <TabsContent value="finanzas">
          <div className="grid grid-cols-4 gap-6">
            <div className="flex flex-col gap-2">
              <Button variant={subTab === "bancos" ? "default" : "ghost"} className="justify-start gap-2" onClick={() => handleSubTabChange("bancos")}>
                <IconBuildingBank className="size-4" /> Instituciones Bancarias
              </Button>
            </div>
            
            <Card className="col-span-3 border-emerald-100">
              <CardHeader>
                <CardTitle>Bancos Permitidos</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre Banco</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!subTab ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                          Seleccioná una categoría de la izquierda para ver los registros.
                        </TableCell>
                      </TableRow>
                    ) : bancos.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-bold">{item.nombre}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => { setEditingItem(item); setDuplicateError(null); setIsDialogOpen(true); }}>
                            <IconPencil className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setDuplicateError(null); }}>
        <DialogContent>
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle>{editingItem ? "Editar Maestro" : "Añadir Nuevo Maestro"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Nombre / Categoría</Label>
                <Input name="nombre" defaultValue={editingItem?.nombre} required />
                {duplicateError && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <IconAlertTriangle className="size-3.5 shrink-0" /> {duplicateError}
                  </p>
                )}
              </div>
              
              {(subTab === "estados" || subTab === "condiciones" || subTab === "estadosInmobiliarios") && (
                <div className="space-y-2">
                  <Label>Badge Visual</Label>
                  <Select name="color" defaultValue={normalizeBadgeColor(editingItem?.color)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Elegí un estilo" />
                    </SelectTrigger>
                    <SelectContent>
                      {BADGE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <Badge className={`${option.value} font-bold text-[10px]`}>{option.label}</Badge>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {subTab === "emergencias" && (
                <div className="space-y-2">
                  <Label>Número / Valor</Label>
                  <Input name="telefono" defaultValue={editingItem?.telefono} required />
                </div>
              )}
            </div>
            <DialogFooter><Button type="submit">Guardar</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
