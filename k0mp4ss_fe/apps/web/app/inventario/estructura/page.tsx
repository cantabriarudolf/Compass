"use client"

import * as React from "react"
import { 
  macroSectores as initialMacros, 
  microSectores as initialMicros, 
  unidades as initialUnidades, 
  MacroSector, 
  MicroSector, 
  Unidad,
} from "@/data/inventario/estructura"
import { CATEGORIAS_MACRO, CATEGORIAS_MICRO, ESTADOS_OCUPACION } from "@/data/maestros"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { ScrollArea, ScrollBar } from "@workspace/ui/components/scroll-area"
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
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select"
import { IconBuilding, IconPlus, IconChevronRight, IconPencil, IconStack2, IconEdit } from "@tabler/icons-react"
import { FormularioUnidad } from "@/components/inventario/formulario-unidad"

export default function EstructuraFisicaPage() {
  const [macroSectores, setMacroSectores] = React.useState(initialMacros)
  const [microSectores, setMicroSectores] = React.useState(initialMicros)
  const [unidades, setUnidades] = React.useState(initialUnidades)
  
  const [selectedMacro, setSelectedMacro] = React.useState<string>("todos")
  const currentMacro = macroSectores.find(m => m.id === selectedMacro)
  const filteredMicros = microSectores.filter(m => m.macroSectorId === selectedMacro)
  
  const [selectedMicro, setSelectedMicro] = React.useState<string>("todos")
  const [isMacroDialogOpen, setIsMacroDialogOpen] = React.useState(false)
  const [isMicroDialogOpen, setIsMicroDialogOpen] = React.useState(false)
  const [editingMacro, setEditingMacro] = React.useState<MacroSector | null>(null)
  const [filterStatus, setFilterStatus] = React.useState("todos")

  React.useEffect(() => {
    if (selectedMacro === "todos") {
      setSelectedMicro("todos")
      return
    }
    const micros = microSectores.filter(m => m.macroSectorId === selectedMacro)
    setSelectedMicro("todos") // Al cambiar de macro, por defecto vemos "todo" el macro
  }, [selectedMacro, microSectores])

  // LÓGICA DE FILTRADO MULTI-ESCALA
  const filteredUnidades = unidades.filter(u => {
    const matchesMacro = selectedMacro === "todos" || 
                        microSectores.find(m => m.id === u.microSectorId)?.macroSectorId === selectedMacro;
    const matchesMicro = selectedMicro === "todos" || u.microSectorId === selectedMicro;
    
    return matchesMacro && matchesMicro;
  })

  const handleSaveMacro = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const data = {
      etiqueta: formData.get("etiqueta") as any,
      nombre: formData.get("nombre") as string,
      descripcion: formData.get("descripcion") as string,
    }
    if (editingMacro) {
      setMacroSectores(macroSectores.map(m => m.id === editingMacro.id ? { ...m, ...data } : m))
    } else {
      const nuevoId = `ms-${Date.now()}`
      setMacroSectores([...macroSectores, { id: nuevoId, ...data }])
      setSelectedMacro(nuevoId)
    }
    setIsMacroDialogOpen(false)
    setEditingMacro(null)
  }

  const handleSaveMicro = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const nuevo: MicroSector = {
      id: `mic-${Date.now()}`,
      macroSectorId: selectedMacro,
      etiqueta: formData.get("etiqueta") as any,
      nombre: formData.get("nombre") as string,
    }
    setMicroSectores([...microSectores, nuevo])
    setSelectedMicro(nuevo.id)
    setIsMicroDialogOpen(false)
  }

  const handleSaveUnidad = (data: Partial<Unidad>, existingId?: string) => {
    if (existingId) {
      // Edición: Fusión profunda para no perder datos
      setUnidades(unidades.map(u => u.id === existingId ? { ...u, ...data } : u))
    } else {
      // Creación: Pasar los servicios capturados en el formulario
      const nueva: Unidad = {
        id: `u-${Date.now()}`,
        microSectorId: selectedMicro,
        etiqueta: data.etiqueta || "Depto",
        numero: data.numero || "",
        tipoUnidadId: data.tipoUnidadId || "",
        metraje: data.metraje || 0,
        prorrateo: data.prorrateo || 0,
        rolSii: data.rolSii || "",
        estado: data.estado || "Vacante",
        servicios: data.servicios || {},
      }
      setUnidades([...unidades, nueva])
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Estructura Física</h1>
          <p className="text-muted-foreground">Gestión de la jerarquía física del condominio.</p>
        </div>
        
        <div className="flex gap-2">
          {currentMacro && (
            <Button variant="outline" size="sm" onClick={() => {
              setEditingMacro(currentMacro)
              setIsMacroDialogOpen(true)
            }}>
              <IconEdit className="size-4 mr-2" />
              Editar {currentMacro.etiqueta}
            </Button>
          )}
          <Button className="gap-2" onClick={() => {
            setEditingMacro(null)
            setIsMacroDialogOpen(true)
          }}>
            <IconPlus className="size-4" />
            Nuevo Macro-Sector
          </Button>
        </div>
      </div>

      <Dialog open={isMacroDialogOpen} onOpenChange={setIsMacroDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSaveMacro}>
            <DialogHeader>
              <DialogTitle>{editingMacro ? "Editar" : "Nuevo"} Macro-Sector</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Categoría</Label>
                <Select name="etiqueta" defaultValue={editingMacro?.etiqueta || "Torre"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS_MACRO.map(c => (
                      <SelectItem key={c.id} value={c.nombre}>{c.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input name="nombre" defaultValue={editingMacro?.nombre} required />
              </div>
              <div className="space-y-2">
                <Label>Descripción</Label>
                <Input name="descripcion" defaultValue={editingMacro?.descripcion} />
              </div>
            </div>
            <DialogFooter><Button type="submit">Guardar</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Tabs value={selectedMacro} onValueChange={setSelectedMacro} className="w-full">
        <ScrollArea className="w-full whitespace-nowrap rounded-md border bg-muted/50 p-1 mb-6">
          <TabsList className="inline-flex w-max">
            <TabsTrigger value="todos" className="gap-2 font-black text-primary uppercase text-[10px] tracking-widest">
              <IconStack2 className="size-4" />
              Vista Global
            </TabsTrigger>
            {macroSectores.map((macro) => (
              <TabsTrigger key={macro.id} value={macro.id} className="gap-2 uppercase text-[10px] font-bold">
                <IconBuilding className="size-4" />
                {macro.etiqueta} {macro.nombre}
              </TabsTrigger>
            ))}
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-4">
          <Card className="md:col-span-1 h-fit">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <IconStack2 className="size-4" />
                Sub-Sectores
              </CardTitle>
              {selectedMacro !== "todos" && (
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsMicroDialogOpen(true)}>
                  <IconPlus className="size-4" />
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div className="flex flex-col">
                {selectedMacro === "todos" ? (
                  <div className="p-8 text-center bg-muted/20 border-y border-dashed opacity-50">
                    <p className="text-[10px] font-bold uppercase tracking-tighter">Consolidado Activo</p>
                    <p className="text-[8px] italic">Filtre por torre para ver pisos</p>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => setSelectedMicro("todos")}
                      className={`flex items-center justify-between px-4 py-3 text-xs transition-colors hover:bg-muted ${
                        selectedMicro === "todos" ? "bg-muted font-bold border-l-4 border-primary" : "border-l-4 border-transparent opacity-70"
                      }`}
                    >
                      VER TODO EL SECTOR
                      <IconChevronRight className="size-4 opacity-50" />
                    </button>
                    {filteredMicros.map((micro) => (
                      <button
                        key={micro.id}
                        onClick={() => setSelectedMicro(micro.id)}
                        className={`flex items-center justify-between px-4 py-3 text-xs transition-colors hover:bg-muted ${
                          selectedMicro === micro.id ? "bg-muted font-medium border-l-4 border-primary" : "border-l-4 border-transparent opacity-70"
                        }`}
                      >
                        {micro.etiqueta} {micro.nombre}
                        <IconChevronRight className="size-4 opacity-50" />
                      </button>
                    ))}
                  </>
                )}
              </div>
            </CardContent>
          </Card>

              <Card className="md:col-span-3">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle>Unidades</CardTitle>
                    <CardDescription>
                      {filteredUnidades.length} unidades en este sector.
                    </CardDescription>
                  </div>
                  <FormularioUnidad onSave={(data) => handleSaveUnidad(data)} />
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 mb-4 bg-muted/30 p-2 rounded-md border border-dashed overflow-x-auto no-scrollbar">
                    <span className="text-[9px] font-black text-muted-foreground uppercase px-2 shrink-0">Filtro Rápido:</span>
                    <Button 
                      variant={filterStatus === "todos" ? "default" : "ghost"} 
                      size="sm" 
                      className="h-6 text-[9px] font-bold px-2"
                      onClick={() => setFilterStatus("todos")}
                    >
                      TODOS
                    </Button>
                    {ESTADOS_OCUPACION.map(est => (
                      <Button 
                        key={est.id}
                        variant={filterStatus === est.id ? "default" : "ghost"} 
                        size="sm" 
                        className={`h-6 text-[9px] font-bold px-2 ${filterStatus === est.id ? "" : "text-muted-foreground hover:text-foreground"}`}
                        onClick={() => setFilterStatus(est.id)}
                      >
                        {est.nombre.toUpperCase()}
                      </Button>
                    ))}
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>N° Unidad</TableHead>
                        {(selectedMacro === "todos" || selectedMicro === "todos") && (
                          <>
                            <TableHead>Sector</TableHead>
                            <TableHead>Piso/Nivel</TableHead>
                          </>
                        )}
                        <TableHead>Estado</TableHead>
                        <TableHead>Metraje</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUnidades
                        .filter(u => filterStatus === "todos" || 
                          ESTADOS_OCUPACION.find(e => e.id === filterStatus)?.nombre === u.estado
                        )
                        .map((unidad) => {
                          const configEstado = ESTADOS_OCUPACION.find(e => e.nombre === unidad.estado);
                          const customClasses = configEstado?.color || "bg-zinc-100 text-zinc-800";
                          
                          const micro = microSectores.find(m => m.id === unidad.microSectorId);
                          const macro = macroSectores.find(m => m.id === micro?.macroSectorId);

                          return (
                            <TableRow key={unidad.id}>
                              <TableCell className="font-medium">{unidad.etiqueta} {unidad.numero}</TableCell>
                              {(selectedMacro === "todos" || selectedMicro === "todos") && (
                                <>
                                  <TableCell className="text-[10px] uppercase font-bold text-muted-foreground">
                                    {macro?.nombre || "---"}
                                  </TableCell>
                                  <TableCell className="text-[10px] uppercase font-bold text-muted-foreground">
                                    {micro?.nombre || "---"}
                                  </TableCell>
                                </>
                              )}
                              <TableCell>
                                <Badge className={`${customClasses} font-bold uppercase text-[9px] px-2 py-0.5 rounded-md`}>
                                  {unidad.estado}
                                </Badge>
                              </TableCell>
                            <TableCell>{unidad.metraje} m²</TableCell>
                            <TableCell className="text-right">
                              <FormularioUnidad 
                                unidad={unidad} 
                                onSave={(data) => handleSaveUnidad(data, unidad.id)}
                                trigger={<Button variant="ghost" size="icon"><IconPencil className="size-4" /></Button>} 
                              />
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
      </Tabs>

      <Dialog open={isMicroDialogOpen} onOpenChange={setIsMicroDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSaveMicro}>
            <DialogHeader>
              <DialogTitle>Nuevo Sector en {currentMacro?.nombre}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Categoría</Label>
                <Select name="etiqueta" defaultValue="Piso">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS_MICRO.map(c => (
                      <SelectItem key={c.id} value={c.nombre}>{c.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Nombre / Número</Label>
                <Input name="nombre" placeholder="Ej: 1, 2, Norte" required />
              </div>
            </div>
            <DialogFooter><Button type="submit">Crear Sector</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
