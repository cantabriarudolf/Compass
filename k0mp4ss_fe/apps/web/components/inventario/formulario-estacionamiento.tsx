"use client"

import * as React from "react"
import { Estacionamiento } from "@/data/inventario/estacionamientos"
import { useCompassStore } from "@/lib/store"
import { 
  Dialog, 
  DialogContent, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select"
import { IconParkingCircle, IconLink, IconMapPin } from "@tabler/icons-react"

interface FormularioEstacionamientoProps {
  estacionamiento?: Estacionamiento;
  trigger?: React.ReactNode;
  onSave?: (data: Partial<Estacionamiento>) => void;
}

export function FormularioEstacionamiento({ estacionamiento, trigger, onSave }: FormularioEstacionamientoProps) {
  const tiposUnidad = useCompassStore(s => s.tiposUnidad)
  const unidades = useCompassStore(s => s.unidades)
  const macroSectores = useCompassStore(s => s.macroSectores)
  const microSectores = useCompassStore(s => s.microSectores)
  const estadosOcupacion = useCompassStore(s => s.maestros.estadosOcupacion)
  const isEditing = !!estacionamiento;
  const [isOpen, setIsOpen] = React.useState(false)
  
  const [macroId, setMacroId] = React.useState("")
  const [microId, setMicroId] = React.useState("")
  const [unidadId, setUnidadId] = React.useState(estacionamiento?.unidadId || "")
  const [tipoId, setTipoId] = React.useState("")
  const [estadoId, setEstadoId] = React.useState(estacionamiento?.estadoId || "vacante")
  const [metraje, setMetraje] = React.useState(estacionamiento?.metraje || 0)

  const handleOpenChange = (open: boolean) => {
    if (open) {
      if (!isEditing) {
        setMacroId("")
        setMicroId("")
        setUnidadId("")
        setTipoId("")
        setMetraje(0)
        setEstadoId("vacante")
      } else {
        setUnidadId(estacionamiento?.unidadId || "")
        setMetraje(estacionamiento?.metraje || 0)
        setEstadoId(estacionamiento?.estadoId || "vacante")
      }
    }
    setIsOpen(open)
  }

  const todosLosTiposActivos = tiposUnidad.filter(t => t.activo);

  const microsFiltrados = microSectores.filter(m => m.macroSectorId === macroId)
  const unidadesFiltradas = unidades.filter(u => u.microSectorId === microId)

  const handleTipoChange = (id: string) => {
    setTipoId(id)
    const tipoEncontrado = todosLosTiposActivos.find(t => t.id === id)
    if (tipoEncontrado) setMetraje(tipoEncontrado.metraje)
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    
    // Validar ID de unidad de forma estricta (evitar strings vacíos que rompen la lógica)
    const targetUnidadId = (unidadId && unidadId !== "" && unidadId !== "none") ? unidadId : undefined;

    // Buscar el nombre de la unidad para el label visual
    const unidadSeleccionada = unidades.find(u => u.id === targetUnidadId)
    const labelAsignado = unidadSeleccionada 
      ? `${unidadSeleccionada.etiqueta} ${unidadSeleccionada.numero}` 
      : (targetUnidadId ? "Unidad Vinculada" : "Disponible")

    const data: Partial<Estacionamiento> = {
      numero: formData.get("numero") as string,
      ubicacion: formData.get("ubicacion") as string,
      metraje: Number(metraje),
      prorrateo: Number(formData.get("prorrateo")) / 100,
      unidadId: targetUnidadId,
      macroSectorId: macroId,
      asignadoA: labelAsignado,
      estadoId: estadoId
    }

    // Lógica de Historial (Trazabilidad)
    if (estacionamiento) {
      const actualUnidadId = estacionamiento.unidadId;
      if (actualUnidadId !== targetUnidadId) {
        const nuevoHistorial = [...(estacionamiento.historial || [])];
        const hoy = new Date().toISOString().split('T')[0] || "";

        // 1. Cerrar tramo anterior si existe
        if (nuevoHistorial.length > 0) {
          const ultimoTramo = nuevoHistorial[nuevoHistorial.length - 1];
          if (ultimoTramo && !ultimoTramo.fechaFin) {
            ultimoTramo.fechaFin = hoy;
          }
        }

        // 2. Abrir nuevo tramo si hay una nueva unidad
        if (targetUnidadId) {
          nuevoHistorial.push({
            id: `h-${Date.now()}`,
            unidadId: targetUnidadId,
            asignadoA: labelAsignado,
            fechaInicio: hoy
          });
        }
        data.historial = nuevoHistorial;
      }
    } else {
      // Es un registro nuevo
      if (targetUnidadId) {
        data.historial = [{
          id: `h-${Date.now()}`,
          unidadId: targetUnidadId,
          asignadoA: labelAsignado,
          fechaInicio: new Date().toISOString().split('T')[0] || ""
        }];
      } else {
        data.historial = [];
      }
    }
    
    onSave?.(data)
    setIsOpen(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || <Button className="gap-2"><IconParkingCircle className="size-4" /> Nueva Plaza</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[550px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEditing ? "Editar Plaza" : "Añadir Estacionamiento"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Número de Plaza</Label>
                <Input name="numero" defaultValue={estacionamiento?.numero} placeholder="Ej: E-10" required />
              </div>
              <div className="space-y-2">
                <Label>Categoría Física</Label>
                <Select value={tipoId} onValueChange={handleTipoChange}>
                  <SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                  <SelectContent>
                    {todosLosTiposActivos.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-xs font-bold">
                <IconMapPin className="size-4 text-primary" /> UBICACIÓN DETALLADA
              </Label>
              <Input name="ubicacion" defaultValue={estacionamiento?.ubicacion} placeholder="Ej: Subterráneo -1, Sector Norte..." />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Metraje (m²)</Label>
                <Input type="number" value={metraje} readOnly className="bg-muted font-medium cursor-not-allowed" />
              </div>
              <div className="space-y-2">
                <Label>Prorrateo Propio (%)</Label>
                <Input name="prorrateo" type="number" defaultValue={(estacionamiento?.prorrateo || 0) * 100} placeholder="0.000" />
              </div>
            </div>

            <div className="space-y-2 p-3 bg-muted/30 rounded-lg border border-dashed">
              <Label className="text-[10px] font-black uppercase text-muted-foreground">Estado de Ocupación / Operativo</Label>
              <Select value={estadoId} onValueChange={setEstadoId}>
                <SelectTrigger className="h-8 text-xs bg-background">
                  <SelectValue placeholder="Seleccione Estado" />
                </SelectTrigger>
                <SelectContent>
                  {estadosOcupacion.map(est => (
                    <SelectItem key={est.id} value={est.id}>
                      <div className="flex items-center gap-2">
                        <div className={`size-2 rounded-full ${est.color.split(' ')[0]}`} />
                        {est.nombre}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider">
                <IconLink className="size-4" /> Vinculación con Propiedad
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Select value={macroId} onValueChange={(val) => { setMacroId(val); setMicroId(""); setUnidadId(""); }}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Torre..." /></SelectTrigger>
                  <SelectContent>
                    {macroSectores.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.etiqueta} {m.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={microId} onValueChange={(val) => { setMicroId(val); setUnidadId(""); }} disabled={!macroId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Piso..." /></SelectTrigger>
                  <SelectContent>
                    {microsFiltrados.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.etiqueta} {m.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={unidadId} onValueChange={setUnidadId} disabled={!microId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Unidad..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ninguna</SelectItem>
                    {unidadesFiltradas.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.etiqueta} {u.numero}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit">{isEditing ? "Guardar Cambios" : "Registrar Plaza"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
