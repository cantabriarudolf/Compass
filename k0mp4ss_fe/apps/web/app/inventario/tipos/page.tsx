"use client"

import * as React from "react"
import { TipoUnidad } from "@/data/inventario/estructura"
import { useCompassStore, useStoreRehydrated } from "@/lib/store"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { ScrollArea, ScrollBar } from "@workspace/ui/components/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { 
  Dialog, 
  DialogContent, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@workspace/ui/components/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select"
import { 
  IconPlus, 
  IconPencil, 
  IconEyeOff, 
  IconEye, 
  IconHistory,
  IconCalendarStats,
  IconHome,
  IconStack2
} from "@tabler/icons-react"
import { EstadosDonut } from "@/components/inventario/estados-donut"

export default function TiposUnidadPage() {
  useStoreRehydrated()
  const hasHydrated = useCompassStore(s => s.hasHydrated)
  const data = useCompassStore(s => s.tiposUnidad)
  const unidades = useCompassStore(s => s.unidades)
  const microSectores = useCompassStore(s => s.microSectores)
  const macroSectores = useCompassStore(s => s.macroSectores)
  const estadosOcupacion = useCompassStore(s => s.maestros.estadosOcupacion)
  const saveTipoUnidad = useCompassStore(s => s.saveTipoUnidad)
  const toggleActivoTipoUnidad = useCompassStore(s => s.toggleActivoTipoUnidad)
  const categoriasUnidad = useCompassStore(s => s.maestros.categoriasUnidad)

  const [selectedTipo, setSelectedTipo] = React.useState<string>("todos")
  const [filtroEstado, setFiltroEstado] = React.useState<string>("todos")
  const [editingItem, setEditingItem] = React.useState<TipoUnidad | null>(null)
  const [isDialogOpen, setIsDialogOpen] = React.useState(false)
  const [historialSelect, setHistorialSelect] = React.useState<TipoUnidad | null>(null)
  const [categoria, setCategoria] = React.useState<string>(categoriasUnidad[0]?.nombre ?? "")
  const [errorGuardado, setErrorGuardado] = React.useState<string | null>(null)

  const filteredData = data.filter(t =>
    selectedTipo === "todos" || t.id === selectedTipo
  )

  const unidadesVisibles = selectedTipo === "todos"
    ? unidades.filter(u => data.some(t => t.id === u.tipoUnidadId))
    : unidades.filter(u => u.tipoUnidadId === selectedTipo)

  const scopeLabel = selectedTipo === "todos"
    ? "Vista Global"
    : data.find(t => t.id === selectedTipo)?.nombre || "Tipo"

  const [montoSimulado, setMontoSimulado] = React.useState<number>(0)
  const countUnits = editingItem ? unidades.filter(u => u.tipoUnidadId === editingItem.id).length : 0
  const impact = editingItem ? (montoSimulado - editingItem.montoBaseGc) * countUnits : 0

  const handleOpenEdit = (item: TipoUnidad) => {
    setEditingItem(item)
    setMontoSimulado(item.montoBaseGc)
    setCategoria(item.categoria)
    setErrorGuardado(null)
    setIsDialogOpen(true)
  }

  const handleOpenNew = () => {
    setEditingItem(null)
    setMontoSimulado(0)
    setCategoria(categoriasUnidad[0]?.nombre ?? "")
    setErrorGuardado(null)
    setIsDialogOpen(true)
  }

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const nuevoMonto = Number(formData.get("montoBaseGc"))
    const fechaVigencia = formData.get("fechaVigencia") as string
    const nombreTrim = ((formData.get("nombre") as string) ?? "").trim()
    if (nombreTrim) {
      const existeDuplicado = data.some(
        (t) => t.id !== (editingItem?.id ?? "") && t.nombre.trim().toLowerCase() === nombreTrim.toLowerCase()
      )
      if (existeDuplicado) {
        const confirmar = window.confirm(
          "Ya existe un tipo de unidad con ese nombre. ¿Deseas continuar? (D5: repetidos permitidos, es solo un aviso)"
        )
        if (!confirmar) {
          setErrorGuardado("Guardado cancelado: duplicado detectado (D5: repetidos permitidos).")
          return
        }
      }
    }

    let resultado: { ok: boolean; error?: string } | null = null
    if (editingItem) {
      const actualizoMonto = nuevoMonto !== editingItem.montoBaseGc
      const nuevoHistorial = [...editingItem.historialTarifas]
      
      if (actualizoMonto) {
        nuevoHistorial.push({
          id: `t-${Date.now()}`,
          monto: nuevoMonto,
          fechaVigencia: fechaVigencia || new Date().toISOString().split('T')[0] || "",
          creadoEn: new Date().toISOString().split('T')[0] || ""
        })
      }

      resultado = saveTipoUnidad({
        ...editingItem,
        nombre: formData.get("nombre") as string,
        categoria,
        metraje: Number(formData.get("metraje")),
        montoBaseGc: nuevoMonto,
        descripcion: formData.get("descripcion") as string,
        historialTarifas: nuevoHistorial
      })
    } else {
      const nuevoTipo: TipoUnidad = {
        id: `tipo-${Date.now()}`,
        nombre: formData.get("nombre") as string,
        categoria: categoria,
        metraje: Number(formData.get("metraje")),
        montoBaseGc: nuevoMonto,
        descripcion: formData.get("descripcion") as string,
        activo: true,
        historialTarifas: [{
          id: `t-${Date.now()}`,
          monto: nuevoMonto,
          fechaVigencia: fechaVigencia || new Date().toISOString().split('T')[0] || "",
          creadoEn: new Date().toISOString().split('T')[0] || ""
        }]
      }
      resultado = saveTipoUnidad(nuevoTipo)
    }
    if (!resultado.ok) {
      setErrorGuardado(resultado.error ?? "No se pudo guardar el tipo de unidad.")
      return
    }
    setErrorGuardado(null)
    setIsDialogOpen(false)
  }

  const toggleActivo = (id: string) => {
    toggleActivoTipoUnidad(id)
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
          <h1 className="text-3xl font-bold tracking-tight">Tipos de Unidad</h1>
          <p className="text-muted-foreground">Gestión de plantillas técnicas y tarifarios base.</p>
        </div>
        <Button onClick={handleOpenNew}>
          <IconPlus className="size-4 mr-2" /> Nuevo Tipo
        </Button>
      </div>

      <Tabs value={selectedTipo} onValueChange={setSelectedTipo} className="w-full">
        <ScrollArea className="w-full whitespace-nowrap rounded-md border bg-muted/50 p-1 mb-2">
          <TabsList className="inline-flex w-max">
            <TabsTrigger value="todos" className="gap-2 font-black text-primary uppercase text-[10px] tracking-widest">
              <IconStack2 className="size-4" />
              Vista Global
            </TabsTrigger>
            {data.map((tipo) => (
              <TabsTrigger key={tipo.id} value={tipo.id} className="gap-2 uppercase text-[10px] font-bold">
                <IconHome className="size-4" />
                {tipo.nombre}
              </TabsTrigger>
            ))}
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <div className="pt-2">
          <EstadosDonut
            estados={unidadesVisibles.map(u => u.estadoId)}
            scopeLabel={scopeLabel}
            selectedId={filtroEstado === "todos" ? undefined : filtroEstado}
            onSelect={selectedTipo !== "todos" ? (id) => setFiltroEstado(filtroEstado === id ? "todos" : id) : undefined}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 pt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b bg-muted/20">
              <div>
                <CardTitle>
                  {selectedTipo === "todos" ? "Plantillas Técnicas" : `Unidades: ${data.find(t => t.id === selectedTipo)?.nombre}`}
                </CardTitle>
                <CardDescription>
                  {selectedTipo === "todos"
                    ? `${filteredData.length} tipos de unidad.`
                    : `${unidades.filter(u => u.tipoUnidadId === selectedTipo).length} unidades vinculadas a este tipo.`
                  }
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {selectedTipo === "todos" ? (
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="pl-6">Tipo</TableHead>
                      <TableHead>Metraje Base</TableHead>
                      <TableHead>Monto Base GC</TableHead>
                      <TableHead>Unidades</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right pr-6">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredData.map((item) => {
                      const unitsCount = unidades.filter(u => u.tipoUnidadId === item.id).length;
                      const ultimaTarifa = item.historialTarifas[item.historialTarifas.length - 1];
                      return (
                        <TableRow key={item.id} className={`hover:bg-muted/30 ${!item.activo ? "opacity-60" : ""}`}>
                          <TableCell className="pl-6">
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold">{item.nombre}</span>
                                <Badge variant="outline" className="text-[9px] uppercase px-1.5">{item.categoria}</Badge>
                              </div>
                              {item.descripcion && (
                                <span className="text-[11px] text-muted-foreground">{item.descripcion}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">{item.metraje} m²</TableCell>
                          <TableCell>
                            <span className="font-bold text-primary">${item.montoBaseGc.toLocaleString("es-CO")}</span>
                            <span className="block text-[10px] text-muted-foreground uppercase">
                              vig. {ultimaTarifa?.fechaVigencia || "—"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="font-medium">{unitsCount}</span>
                            <span className="text-[10px] text-muted-foreground uppercase"> propiedades</span>
                          </TableCell>
                          <TableCell>
                            {item.activo ? (
                              <Badge className="bg-emerald-600 font-bold uppercase text-[9px] px-2 py-0.5 rounded-md border-none">
                                Activo
                              </Badge>
                            ) : (
                              <Badge className="bg-zinc-200 text-zinc-700 font-bold uppercase text-[9px] px-2 py-0.5 rounded-md border-none">
                                Inactivo
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right pr-6">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-blue-600"
                                onClick={() => setHistorialSelect(item)}
                              >
                                <IconHistory className="size-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenEdit(item)}>
                                <IconPencil className="size-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleActivo(item.id)}>
                                {item.activo ? <IconEyeOff className="size-4 text-amber-600" /> : <IconEye className="size-4 text-green-600" />}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filteredData.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                          No hay tipos de unidad en esta categoría.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              ) : (
                (() => {
                  const unidadesFiltradas = unidades
                    .filter(u => u.tipoUnidadId === selectedTipo)
                    .filter(u => filtroEstado === "todos" || u.estadoId === filtroEstado)
                  return (
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          <TableHead className="pl-6">N° Unidad</TableHead>
                          <TableHead>Macro Zona</TableHead>
                          <TableHead>Micro Zona</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead>Metraje</TableHead>
                          <TableHead>Prorrateo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {unidadesFiltradas.map((unidad) => {
                          const micro = microSectores.find(m => m.id === unidad.microSectorId)
                          const macro = macroSectores.find(m => m.id === micro?.macroSectorId)
                          const est = estadosOcupacion.find(e => e.id === unidad.estadoId)
                          return (
                            <TableRow key={unidad.id} className="hover:bg-muted/30">
                              <TableCell className="font-bold pl-6">
                                <div className="flex items-center gap-2 text-xs">
                                  <IconHome className="size-4 text-primary" />
                                  {unidad.etiqueta} {unidad.numero}
                                </div>
                              </TableCell>
                              <TableCell className="text-[10px] font-medium uppercase opacity-70">
                                {macro ? `${macro.etiqueta} ${macro.nombre}` : "---"}
                              </TableCell>
                              <TableCell className="text-[10px] font-medium uppercase opacity-70">
                                {micro ? `${micro.etiqueta} ${micro.nombre}` : "---"}
                              </TableCell>
                              <TableCell>
                                <Badge className={`${est?.color || "bg-zinc-100 text-zinc-800"} font-bold uppercase text-[9px] px-2 py-0.5 rounded-md border-none`}>
                                  {est?.nombre || "Sin Estado"}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-medium">{unidad.metraje} m²</TableCell>
                              <TableCell className="text-muted-foreground">{unidad.prorrateo}</TableCell>
                            </TableRow>
                          )
                        })}
                        {unidadesFiltradas.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                              No hay unidades asociadas a este tipo de unidad.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  )
                })()
              )}
            </CardContent>
          </Card>
        </div>
      </Tabs>

      <Dialog open={!!historialSelect} onOpenChange={() => setHistorialSelect(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconHistory className="size-5 text-primary" />
              Historial de Tarifas: {historialSelect?.nombre}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {historialSelect && historialSelect.historialTarifas.length > 0 ? (
              <div className="relative border-l-2 border-primary/20 ml-3 space-y-6">
                {[...historialSelect.historialTarifas].reverse().map((h) => (
                  <div key={h.id} className="relative pl-6">
                    <div className="absolute -left-[9px] top-1 size-4 rounded-full bg-primary border-2 border-background shadow-sm" />
                    <div className="space-y-0.5">
                      <div className="text-sm font-bold text-primary">${h.monto.toLocaleString("es-CO")}</div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                        <IconCalendarStats className="size-3" />
                        Vigencia: {h.fechaVigencia}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground italic text-sm">
                No hay registros de tarifas para este tipo de unidad.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle>{editingItem ? `Editar: ${editingItem.nombre}` : "Nuevo Tipo de Unidad"}</DialogTitle>
            </DialogHeader>
            {errorGuardado && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive font-medium mt-4">
                {errorGuardado}
              </div>
            )}
            <div className="grid grid-cols-2 gap-6 py-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nombre del Tipo</Label>
                  <Input name="nombre" defaultValue={editingItem?.nombre} required />
                </div>
                <div className="space-y-2">
                  <Label>Categoría</Label>
                  <Select value={categoria} onValueChange={(v) => setCategoria(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categoriasUnidad.map(c => (
                        <SelectItem key={c.id} value={c.nombre}>{c.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground italic">
                    Se administra en Maestros Administrativos → Categorías de Unidad.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Metraje (m²)</Label>
                    <Input name="metraje" type="number" step="0.01" defaultValue={editingItem?.metraje} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Monto Base GC ($)</Label>
                    <Input 
                      name="montoBaseGc" 
                      type="number" 
                      value={montoSimulado} 
                      onChange={(e) => setMontoSimulado(Number(e.target.value))} 
                      required 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Fecha de Vigencia</Label>
                  <Input name="fechaVigencia" type="date" defaultValue={new Date().toISOString().split('T')[0]} required />
                </div>
                <div className="space-y-2">
                  <Label>Descripción</Label>
                  <Input name="descripcion" defaultValue={editingItem?.descripcion} />
                </div>
              </div>

              <div className="bg-muted/30 p-4 rounded-lg border border-dashed flex flex-col gap-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <IconCalendarStats className="size-4" /> Calculador de Impacto
                </h3>
                
                {editingItem ? (
                  <>
                    <div className="bg-white dark:bg-zinc-900 p-3 rounded border shadow-sm space-y-2">
                      <div className="flex justify-between items-center text-sm">
                        <span>Unidades Afectadas:</span>
                        <span className="font-bold">{countUnits}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span>Variación Unitaria:</span>
                        <span className={`font-bold ${impact >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {impact >= 0 ? "+" : ""}${(montoSimulado - editingItem.montoBaseGc).toLocaleString("es-CO")}
                        </span>
                      </div>
                      <div className="border-t pt-2 space-y-3">
                        <div>
                          <p className="text-[10px] font-black uppercase text-muted-foreground">Impacto Mensual Total</p>
                          <p className={`text-xl font-black ${impact >= 0 ? "text-green-600" : "text-rose-600"}`}>
                            {impact >= 0 ? "+" : ""}${impact.toLocaleString("es-CO")}
                          </p>
                        </div>
                        <div className="pt-2 border-t border-dashed">
                          <p className="text-[10px] font-black uppercase text-muted-foreground">Proyección Anual (Ponderado)</p>
                          <p className={`text-xl font-black ${impact >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                            {impact >= 0 ? "+" : ""}${(impact * 12).toLocaleString("es-CO")}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground leading-relaxed italic">
                      * Al guardar, el nuevo valor quedará programado para la fecha de vigencia. El módulo de Finanzas (FI) usará este dato para el reajuste retroactivo de morosos.
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-center p-6 text-muted-foreground text-xs italic">
                    Guarda el tipo primero para habilitar el calculador de impacto sobre unidades reales.
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="submit">Actualizar Tarifario</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
