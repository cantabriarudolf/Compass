"use client"

import * as React from "react"
import { Estacionamiento } from "@/data/inventario/estacionamientos"
import { UBICACIONES_ESTACIONAMIENTO } from "@/data/maestros"
import { useCompassStore, useStoreRehydrated } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@workspace/ui/components/table"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@workspace/ui/components/select"
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
  IconFilter, 
  IconHistory,
  IconPencil,
  IconX,
  IconCalendarEvent,
  IconMapPin
} from "@tabler/icons-react"
import { FormularioEstacionamiento } from "@/components/inventario/formulario-estacionamiento"

export default function EstacionamientosPage() {
  useStoreRehydrated()
  const hasHydrated = useCompassStore(s => s.hasHydrated)
  const data = useCompassStore(s => s.estacionamientos)
  const macroSectores = useCompassStore(s => s.macroSectores)
  const estadosOcupacion = useCompassStore(s => s.maestros.estadosOcupacion)
  const saveEstacionamiento = useCompassStore(s => s.saveEstacionamiento)
  const [busqueda, setBusqueda] = React.useState("")
  const [filtroMacro, setFiltroMacro] = React.useState("all")
  const [filtroUbicacion, setFiltroUbicacion] = React.useState("all")
  const [filtroEstado, setFiltroEstado] = React.useState("all")
  
  const [historialSelect, setHistorialSelect] = React.useState<Estacionamiento | null>(null)

  const limpiarFiltros = () => {
    setBusqueda("")
    setFiltroMacro("all")
    setFiltroUbicacion("all")
    setFiltroEstado("all")
  }

  const filteredData = data.filter(item => {
    const matchesText = item.numero.toLowerCase().includes(busqueda.toLowerCase()) || 
                       item.asignadoA?.toLowerCase().includes(busqueda.toLowerCase()) ||
                       item.ubicacion.toLowerCase().includes(busqueda.toLowerCase());
    
    const matchesMacro = filtroMacro === "all" || item.macroSectorId === filtroMacro;
    
    const matchesUbicacion = filtroUbicacion === "all" || item.ubicacion.toLowerCase().includes(filtroUbicacion.toLowerCase());
    
    const matchesEstado = filtroEstado === "all" || item.estadoId === filtroEstado;

    return matchesText && matchesMacro && matchesUbicacion && matchesEstado;
  })

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
        macroSectorId: newData.macroSectorId,
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
        <div className="h-64 w-full rounded-lg bg-muted/30" />
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

      <Card>
        <CardHeader className="pb-4 border-b bg-muted/20">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <div className="relative w-full">
                <IconSearch className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  className="pl-8 h-9"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                />
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <Select value={filtroMacro} onValueChange={setFiltroMacro}>
                <SelectTrigger className="w-[160px] h-9 text-xs">
                  <IconFilter className="size-3 mr-2" />
                  <SelectValue placeholder="Agrupación" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Ver Todas</SelectItem>
                  {macroSectores.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.etiqueta} {m.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filtroUbicacion} onValueChange={setFiltroUbicacion}>
                <SelectTrigger className="w-[160px] h-9 text-xs">
                  <IconMapPin className="size-3 mr-2" />
                  <SelectValue placeholder="Ubicación" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las Ubicaciones</SelectItem>
                  {UBICACIONES_ESTACIONAMIENTO.map(ub => (
                    <SelectItem key={ub.id} value={ub.nombre}>{ub.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filtroEstado} onValueChange={setFiltroEstado}>
                <SelectTrigger className="w-[130px] h-9 text-xs">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los Estados</SelectItem>
                  {estadosOcupacion.map(est => (
                    <SelectItem key={est.id} value={est.id}>{est.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {(busqueda || filtroMacro !== "all" || filtroUbicacion !== "all" || filtroEstado !== "all") && (
                <Button variant="ghost" size="sm" onClick={limpiarFiltros} className="h-9 px-2 text-amber-600">
                  <IconX className="size-4 mr-1" />
                  Limpiar
                </Button>
              )}
            </div>
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
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
