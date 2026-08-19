"use client"

import * as React from "react"
import { Estacionamiento } from "@/data/inventario/estacionamientos"
import { useCompassStore, useStoreRehydrated } from "@/lib/store"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
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
  DialogHeader, 
  DialogTitle,
  DialogDescription 
} from "@workspace/ui/components/dialog"
import { 
  IconParkingCircle, 
  IconSearch, 
  IconHistory,
  IconPencil,
  IconCalendarEvent,
  IconMapPin,
  IconStack2
} from "@tabler/icons-react"
import { FormularioEstacionamiento } from "@/components/inventario/formulario-estacionamiento"
import { EstadosDonut } from "@/components/inventario/estados-donut"

export default function EstacionamientosPage() {
  useStoreRehydrated()
  const hasHydrated = useCompassStore(s => s.hasHydrated)
  const data = useCompassStore(s => s.estacionamientos)
  const macroSectores = useCompassStore(s => s.macroSectores)
  const estadosOcupacion = useCompassStore(s => s.maestros.estadosOcupacion)
  const ubicacionesEstacionamiento = useCompassStore(s => s.maestros.ubicacionesEstacionamiento)
  const saveEstacionamiento = useCompassStore(s => s.saveEstacionamiento)

  const [selectedUbicacion, setSelectedUbicacion] = React.useState<string>("todos")
  const [filtroEstado, setFiltroEstado] = React.useState<string>("todos")
  const [busqueda, setBusqueda] = React.useState("")

  const [historialSelect, setHistorialSelect] = React.useState<Estacionamiento | null>(null)

  const scopeLabel = selectedUbicacion === "todos"
    ? "Vista Global"
    : selectedUbicacion

  const filteredData = data.filter(item => {
    const matchesUbicacion = selectedUbicacion === "todos" || item.ubicacion.toLowerCase().includes(selectedUbicacion.toLowerCase())
    const matchesEstado = filtroEstado === "todos" || item.estadoId === filtroEstado
    const matchesText = !busqueda ||
      item.numero.toLowerCase().includes(busqueda.toLowerCase()) ||
      item.asignadoA?.toLowerCase().includes(busqueda.toLowerCase()) ||
      item.ubicacion.toLowerCase().includes(busqueda.toLowerCase())
    return matchesUbicacion && matchesEstado && matchesText
  })

  const handleUbicacionTabChange = (id: string) => {
    setSelectedUbicacion(id)
    setFiltroEstado("todos")
    setBusqueda("")
  }

  const handleSave = (newData: Partial<Estacionamiento>, existingId?: string) => {
    if (existingId) {
      const existente = data.find(item => item.id === existingId)
      if (existente) saveEstacionamiento({ ...existente, ...newData })
    } else {
      const nuevo: Estacionamiento = {
        id: `es-${Date.now()}`,
        numero: newData.numero || "",
        ubicacion: newData.ubicacion || "Sin detalle",
        metraje: newData.metraje || 0,
        prorrateo: newData.prorrateo || 0,
        unidadId: newData.unidadId,
        macroSectorId: newData.macroSectorId || "",
        asignadoA: newData.asignadoA || "Disponible",
        estadoId: newData.estadoId || "vacante",
        historial: newData.historial || []
      }
      saveEstacionamiento(nuevo)
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
          <h1 className="text-3xl font-bold tracking-tight">Estacionamientos</h1>
          <p className="text-muted-foreground">
            Inventario técnico y asignación de plazas con trazabilidad histórica.
          </p>
        </div>
        <FormularioEstacionamiento onSave={(data) => handleSave(data)} />
      </div>

      <Tabs value={selectedUbicacion} onValueChange={handleUbicacionTabChange} className="w-full">
        <ScrollArea className="w-full whitespace-nowrap rounded-md border bg-muted/50 p-1 mb-2">
          <TabsList className="inline-flex w-max">
            <TabsTrigger value="todos" className="gap-2 font-black text-primary uppercase text-[10px] tracking-widest">
              <IconStack2 className="size-4" />
              Vista Global
            </TabsTrigger>
            {ubicacionesEstacionamiento.map((ub) => (
              <TabsTrigger key={ub.id} value={ub.nombre} className="gap-2 uppercase text-[10px] font-bold">
                <IconMapPin className="size-4" />
                {ub.nombre}
              </TabsTrigger>
            ))}
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <div className="pt-2">
          <EstadosDonut
            estados={filteredData.map(e => e.estadoId)}
            scopeLabel={scopeLabel}
            selectedId={filtroEstado === "todos" ? undefined : filtroEstado}
            onSelect={(id) => setFiltroEstado(filtroEstado === id ? "todos" : id)}
          />
        </div>

        {filtroEstado !== "todos" && (
          <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                Distribución por Agrupación — {estadosOcupacion.find(e => e.id === filtroEstado)?.nombre}
              </CardTitle>
              <CardDescription>
                {filteredData.length} plazas con este estado en el ámbito seleccionado.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {macroSectores.map((macro) => {
                  const count = filteredData.filter(e => e.macroSectorId === macro.id).length
                  const total = filteredData.length
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0
                  return (
                    <div key={macro.id} className={`rounded-lg border p-3 text-center ${count > 0 ? "border-primary bg-primary/5" : ""}`}>
                      <p className="text-[10px] uppercase font-bold text-muted-foreground">{macro.etiqueta} {macro.nombre}</p>
                      <p className={`text-xl font-black mt-1 ${count > 0 ? "text-primary" : "text-muted-foreground"}`}>{count}</p>
                      <p className="text-[10px] text-muted-foreground">{pct}%</p>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-6 pt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b bg-muted/20">
              <div>
                <CardTitle>Plazas</CardTitle>
                <CardDescription>
                  {filteredData.length} plazas en este ámbito.
                </CardDescription>
              </div>
              <div className="relative w-64">
                <IconSearch className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar plaza o asignatario..."
                  className="pl-8 h-9"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="w-[120px] pl-6">N° Plaza</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Agrupación</TableHead>
                    <TableHead>Asignado A</TableHead>
                    <TableHead className="text-right pr-6">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((item) => {
                    const macro = macroSectores.find(m => m.id === item.macroSectorId);
                    return (
                    <TableRow key={item.id} className="hover:bg-muted/30">
                      <TableCell className="font-bold pl-6">
                        <div className="flex items-center gap-2 text-xs">
                          <IconParkingCircle className="size-4 text-primary" />
                          {item.numero}
                        </div>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const est = estadosOcupacion.find(e => e.id === item.estadoId);
                          return (
                            <Badge className={`${est?.color || "bg-zinc-100 text-zinc-800"} font-bold uppercase text-[9px] px-2 py-0.5 rounded-md border-none`}>
                              {est?.nombre || "Sin Estado"}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-[10px] font-medium uppercase opacity-70">
                        {macro ? `${macro.etiqueta} ${macro.nombre}` : "---"}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs font-medium ${item.unidadId ? "text-primary" : "text-muted-foreground italic"}`}>
                          {item.asignadoA}
                        </span>
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <div className="flex justify-end gap-1">
                          <FormularioEstacionamiento 
                            estacionamiento={item}
                            onSave={(newData) => handleSave(newData, item.id)}
                            trigger={
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <IconPencil className="size-4" />
                              </Button>
                            }
                          />
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className={`h-8 w-8 ${item.historial.length > 0 ? "text-blue-600" : "text-muted-foreground opacity-40"}`}
                            onClick={() => setHistorialSelect(item)}
                          >
                            <IconHistory className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )})}
                  {filteredData.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        No hay plazas que coincidan con los filtros seleccionados.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </Tabs>

      {/* MODAL DE HISTORIAL (TRAZABILIDAD) */}
      <Dialog open={!!historialSelect} onOpenChange={() => setHistorialSelect(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconHistory className="size-5 text-primary" />
              Historial de Asignaciones: {historialSelect?.numero}
            </DialogTitle>
            <DialogDescription>
              Trazabilidad completa de ocupación del estacionamiento.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            {historialSelect?.historial && historialSelect.historial.length > 0 ? (
              <div className="relative border-l-2 border-primary/20 ml-3 space-y-6">
                {historialSelect.historial.map((h, idx) => (
                  <div key={h.id} className="relative pl-6">
                    <div className="absolute -left-[9px] top-1 size-4 rounded-full bg-primary border-2 border-background shadow-sm" />
                    <div className="space-y-1">
                      <div className="text-sm font-bold text-primary">{h.asignadoA}</div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                        <IconCalendarEvent className="size-3" />
                        {h.fechaInicio} — {h.fechaFin || "Actualidad"}
                      </div>
                      {idx === historialSelect.historial.length - 1 && !h.fechaFin && (
                        <Badge variant="default" className="text-[8px] h-4 mt-1 bg-green-600">Periodo Activo</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground italic text-sm">
                No hay registros históricos para este estacionamiento.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
