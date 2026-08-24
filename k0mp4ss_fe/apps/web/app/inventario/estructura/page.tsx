"use client"

import * as React from "react"
import { 
  MacroSector, 
  MicroSector, 
  Unidad,
} from "@/data/inventario/estructura"
import { useCompassStore, useStoreRehydrated, StoreResult } from "@/lib/store"
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
  DialogDescription,
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select"
import { IconBuilding, IconPlus, IconChevronRight, IconPencil, IconStack2, IconEdit, IconHistory, IconCalendarEvent } from "@tabler/icons-react"
import { FormularioUnidad } from "@/components/inventario/formulario-unidad"
import { EstadosDonut } from "@/components/inventario/estados-donut"

export default function EstructuraFisicaPage() {
  useStoreRehydrated()
  const hasHydrated = useCompassStore(s => s.hasHydrated)
  const macroSectores = useCompassStore(s => s.macroSectores)
  const microSectores = useCompassStore(s => s.microSectores)
  const unidades = useCompassStore(s => s.unidades)
  const saveMacroSector = useCompassStore(s => s.saveMacroSector)
  const saveMicroSector = useCompassStore(s => s.saveMicroSector)
  const saveUnidad = useCompassStore(s => s.saveUnidad)
  const categoriasMacro = useCompassStore(s => s.maestros.categoriasMacro)
  const estadosOcupacion = useCompassStore(s => s.maestros.estadosOcupacion)
  const categoriasMicro = useCompassStore(s => s.maestros.categoriasMicro)
  const categoriasUnidad = useCompassStore(s => s.maestros.categoriasUnidad)
  
  const [selectedMacro, setSelectedMacro] = React.useState<string>("todos")
  const currentMacro = macroSectores.find(m => m.id === selectedMacro)
  const filteredMicros = microSectores.filter(m => m.macroSectorId === selectedMacro)
  
  const [selectedMicro, setSelectedMicro] = React.useState<string>("todos")
  const [isMacroDialogOpen, setIsMacroDialogOpen] = React.useState(false)
  const [isMicroDialogOpen, setIsMicroDialogOpen] = React.useState(false)
  const [editingMacro, setEditingMacro] = React.useState<MacroSector | null>(null)
  const vinculos = useCompassStore(s => s.vinculos)
  const personas = useCompassStore(s => s.personas)
  const [filterStatus, setFilterStatus] = React.useState("todos")
  const [historialSelect, setHistorialSelect] = React.useState<Unidad | null>(null)
  const [errorDialogo, setErrorDialogo] = React.useState<string | null>(null)

  // LÓGICA DE FILTRADO MULTI-ESCALA
  const filteredUnidades = unidades.filter(u => {
    const matchesMacro = selectedMacro === "todos" || 
                        microSectores.find(m => m.id === u.microSectorId)?.macroSectorId === selectedMacro;
    const matchesMicro = selectedMicro === "todos" || u.microSectorId === selectedMicro;
    
    return matchesMacro && matchesMicro;
  })

  const selectedMicroObj = microSectores.find(m => m.id === selectedMicro)
  const scopeLabel = selectedMacro === "todos"
    ? "Vista Global"
    : selectedMicro === "todos"
      ? `${currentMacro?.etiqueta} ${currentMacro?.nombre}`
      : `${currentMacro?.etiqueta} ${currentMacro?.nombre} · ${selectedMicroObj?.etiqueta} ${selectedMicroObj?.nombre}`

  const handleMacroTabChange = (id: string) => {
    setSelectedMacro(id)
    if (id === "todos") {
      setSelectedMicro("todos")
      return
    }
    const micros = microSectores.filter(m => m.macroSectorId === id)
    const microValido = micros.some(m => m.id === selectedMicro)
    if (!microValido) setSelectedMicro("todos")
  }

  const handleSaveMacro = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const data = {
      etiqueta: formData.get("etiqueta") as string,
      nombre: formData.get("nombre") as string,
      descripcion: formData.get("descripcion") as string,
    }
    let resultado: { ok: boolean; error?: string }
    if (editingMacro) {
      resultado = saveMacroSector({ ...editingMacro, ...data })
    } else {
      const nuevoId = `ms-${Date.now()}`
      resultado = saveMacroSector({ id: nuevoId, ...data })
      if (!resultado.ok) {
        setErrorDialogo(resultado.error ?? "No se pudo guardar el macro sector.")
        return
      }
      setSelectedMacro(nuevoId)
      setSelectedMicro("todos")
    }
    if (!resultado.ok) {
      setErrorDialogo(resultado.error ?? "No se pudo guardar el macro sector.")
      return
    }
    setErrorDialogo(null)
    setIsMacroDialogOpen(false)
    setEditingMacro(null)
  }

  const handleSaveMicro = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const nuevo: MicroSector = {
      id: `mic-${Date.now()}`,
      macroSectorId: selectedMacro,
      etiqueta: formData.get("etiqueta") as string,
      nombre: formData.get("nombre") as string,
    }
    const resultado = saveMicroSector(nuevo)
    if (!resultado.ok) {
      setErrorDialogo(resultado.error ?? "No se pudo guardar el sub-sector.")
      return
    }
    setErrorDialogo(null)
    setSelectedMicro(nuevo.id)
    setIsMicroDialogOpen(false)
  }

  const handleSaveUnidad = (data: Partial<Unidad>, existingId?: string): StoreResult => {
    if (existingId) {
      // Edición: Fusión profunda para no perder datos
      const existente = unidades.find(u => u.id === existingId)
      if (existente) return saveUnidad({ ...existente, ...data })
      return { ok: false, error: "La unidad a editar no existe en el inventario." }
    } else {
      // Creación: exigir asociación a un sub-sector válido
      const microSectorId = data.microSectorId
      const microValido = microSectorId && microSectorId !== "todos" &&
        microSectores.some(m => m.id === microSectorId)
      if (!microValido) {
        alert("Debe seleccionar un macro-sector y un sub-sector válidos para la unidad.")
        return { ok: false, error: "Debe seleccionar un macro-sector y un sub-sector válidos para la unidad." }
      }

      const nueva: Unidad = {
        id: `u-${Date.now()}`,
        microSectorId,
        etiqueta: data.etiqueta || categoriasUnidad[0]?.nombre || "",
        numero: data.numero || "",
        tipoUnidadId: data.tipoUnidadId || "",
        metraje: data.metraje || 0,
        prorrateo: data.prorrateo || 0,
        rolSii: data.rolSii || "",
        estadoId: data.estadoId || "vacante",
        servicios: data.servicios || {},
      }
      return saveUnidad(nueva)
    }
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Estructura Física</h1>
          <p className="text-muted-foreground">Gestión de la jerarquía física de la comunidad.</p>
        </div>
        
        <div className="flex gap-2">
          {currentMacro && (
            <Button variant="outline" size="sm" onClick={() => {
              setEditingMacro(currentMacro)
              setErrorDialogo(null)
              setIsMacroDialogOpen(true)
            }}>
              <IconEdit className="size-4 mr-2" />
              Editar {currentMacro.etiqueta}
            </Button>
          )}
          <Button className="gap-2" onClick={() => {
            setEditingMacro(null)
            setErrorDialogo(null)
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
            {errorDialogo && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive font-medium mt-4">
                {errorDialogo}
              </div>
            )}
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Categoría</Label>
                <Select name="etiqueta" defaultValue={editingMacro?.etiqueta || categoriasMacro[0]?.nombre || ""}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categoriasMacro.map(c => (
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

      {macroSectores.length === 0 ? (
        <Card className="p-8 text-center border-dashed">
          <CardHeader>
            <CardTitle className="text-lg">Faltan sectores reales</CardTitle>
            <CardDescription className="space-y-2">
              <p>
                Las categorías que creaste en <strong>Maestros Administrativos</strong> (Torre, Piso…) definen los tipos de sectores, pero todavía no son sectores reales.
              </p>
              <p>
                Para crear una unidad necesitás sectores <strong>concretos</strong> acá: por ejemplo, <em>Torre A</em> y <em>Piso 1</em>.
              </p>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <Button onClick={() => {
              setEditingMacro(null)
              setIsMacroDialogOpen(true)
            }}>
              <IconPlus className="size-4 mr-2" />
              Crear primer Macro-Sector
            </Button>
            <p className="text-[10px] text-muted-foreground">
              Después de crear el macro, agregá al menos un sub-sector y ahí podrás crear la unidad.
            </p>
          </CardContent>
        </Card>
      ) : (
      <Tabs value={selectedMacro} onValueChange={handleMacroTabChange} className="w-full">
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

        <div className="pt-4">
          <EstadosDonut
            estados={filteredUnidades.map(u => u.estadoId)}
            scopeLabel={scopeLabel}
            selectedId={filterStatus === "todos" ? undefined : filterStatus}
            onSelect={(id) => setFilterStatus(filterStatus === id ? "todos" : id)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-6">
          <Card className="md:col-span-1 h-fit">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <IconStack2 className="size-4" />
                Sub-Sectores
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="flex flex-col">
                {selectedMacro === "todos" ? (
                  <div className="p-6 text-center bg-muted/20 border-y border-dashed space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-tighter">Ningún Macro-Sector seleccionado</p>
                    <p className="text-[10px] text-muted-foreground">
                      Seleccioná un sector arriba (ej: Torre A) para crear y ver sus sub-sectores.
                    </p>
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
                    <div className="p-3 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-[10px] font-bold uppercase"
                        onClick={() => { setErrorDialogo(null); setIsMicroDialogOpen(true) }}
                      >
                        <IconPlus className="size-3 mr-1" />
                        Crear Sub-Sector en {currentMacro?.etiqueta} {currentMacro?.nombre}
                      </Button>
                    </div>
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
                  <FormularioUnidad
                    macroSectorId={selectedMacro}
                    microSectorId={selectedMicro}
                    onSave={(data) => handleSaveUnidad(data)}
                  />
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
                    {estadosOcupacion.map(est => (
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
                            <TableHead>Macro Zona</TableHead>
                            <TableHead>Micro Zona</TableHead>
                          </>
                        )}
                        <TableHead>Estado</TableHead>
                        <TableHead>Metraje</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUnidades
                        .filter(u => filterStatus === "todos" || u.estadoId === filterStatus)
                        .map((unidad) => {
                          const configEstado = estadosOcupacion.find(e => e.id === unidad.estadoId);
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
                                  {configEstado?.nombre || unidad.estadoId}
                                </Badge>
                              </TableCell>
                            <TableCell>{unidad.metraje} m²</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <FormularioUnidad 
                                  unidad={unidad} 
                                  onSave={(data) => handleSaveUnidad(data, unidad.id)}
                                  trigger={<Button variant="ghost" size="icon"><IconPencil className="size-4" /></Button>} 
                                />
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className={`h-8 w-8 ${vinculos.some(v => v.unidadId === unidad.id) ? "text-blue-600" : "text-muted-foreground opacity-40"}`}
                                  onClick={() => setHistorialSelect(unidad)}
                                >
                                  <IconHistory className="size-4" />
                                </Button>
                              </div>
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
      )}

      {/* MODAL DE HISTORIAL (TRAZABILIDAD DE UNIDADES) */}
      <Dialog open={!!historialSelect} onOpenChange={() => setHistorialSelect(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconHistory className="size-5 text-primary" />
              Historial de Asignaciones: {historialSelect?.etiqueta} {historialSelect?.numero}
            </DialogTitle>
            <DialogDescription>
              Trazabilidad completa de vínculos de la unidad.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            {(() => {
              const vinculosUnidad = vinculos
                .filter(v => v.unidadId === historialSelect?.id)
                .sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio))
              
              if (vinculosUnidad.length === 0) {
                return (
                  <div className="text-center py-8 text-muted-foreground italic text-sm">
                    No hay registros históricos para esta unidad.
                  </div>
                )
              }

              return (
                <div className="relative border-l-2 border-primary/20 ml-3 space-y-6">
                  {vinculosUnidad.map((v, idx) => {
                    const persona = personas.find(p => p.id === v.personaId)
                    const isActive = !v.fechaFin
                    return (
                      <div key={v.id} className="relative pl-6">
                        <div className="absolute -left-[9px] top-1 size-4 rounded-full bg-primary border-2 border-background shadow-sm" />
                        <div className="space-y-1">
                          <div className="text-sm font-bold text-primary">
                            {persona ? `${persona.nombres} ${persona.apellidos}` : "Persona desconocida"}
                          </div>
                          <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                            {v.rol}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                            <IconCalendarEvent className="size-3" />
                            {v.fechaInicio} — {v.fechaFin || "Actualidad"}
                          </div>
                          {isActive && (
                            <Badge variant="default" className="text-[8px] h-4 mt-1 bg-green-600">Periodo Activo</Badge>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isMicroDialogOpen} onOpenChange={setIsMicroDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSaveMicro}>
            <DialogHeader>
              <DialogTitle>Nuevo Sector en {currentMacro?.nombre}</DialogTitle>
            </DialogHeader>
            {errorDialogo && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive font-medium mt-4">
                {errorDialogo}
              </div>
            )}
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Categoría</Label>
                <Select name="etiqueta" defaultValue={categoriasMicro[0]?.nombre || ""}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categoriasMicro.map(c => (
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
