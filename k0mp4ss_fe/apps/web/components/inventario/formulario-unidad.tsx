"use client"

import * as React from "react"
import { 
  Unidad, 
  tiposUnidad
} from "@/data/inventario/estructura"
import { ESTADOS_OCUPACION, CATEGORIAS_UNIDAD } from "@/data/maestros"
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@workspace/ui/components/select"
import { IconDroplet, IconBolt, IconFlame, IconInfoCircle } from "@tabler/icons-react"

interface FormularioUnidadProps {
  unidad?: Unidad;
  trigger?: React.ReactNode;
  onSave?: (data: Partial<Unidad>) => void;
}

export function FormularioUnidad({ unidad, trigger, onSave }: FormularioUnidadProps) {
  const isEditing = !!unidad;
  const [isOpen, setIsOpen] = React.useState(false)
  
  // Estados para manejo dinámico de herencia
  const [tipoId, setTipoId] = React.useState(unidad?.tipoUnidadId || "")
  const [categoria, setCategoria] = React.useState(unidad?.etiqueta || "Depto")
  const [metraje, setMetraje] = React.useState(unidad?.metraje || 0)
  const [prorrateo, setProrrateo] = React.useState((unidad?.prorrateo || 0) * 100)

  const handleTipoChange = (id: string) => {
    setTipoId(id)
    const tipoEncontrado = tiposUnidad.find(t => t.id === id)
    if (tipoEncontrado) {
      setMetraje(tipoEncontrado.metraje)
      setCategoria(tipoEncontrado.categoria)
    }
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    
    const data: Partial<Unidad> = {
      tipoUnidadId: tipoId,
      etiqueta: categoria as any,
      numero: formData.get("numero") as string,
      metraje: Number(metraje),
      prorrateo: Number(prorrateo) / 100,
      rolSii: formData.get("rolSii") as string,
      estado: formData.get("estado") as any,
      servicios: {
        agua: { cliente: formData.get("agua_cliente") as string, medidor: formData.get("agua_medidor") as string },
        luz: { cliente: formData.get("luz_cliente") as string, medidor: formData.get("luz_medidor") as string },
        gas: { cliente: formData.get("gas_cliente") as string, medidor: formData.get("gas_medidor") as string },
      }
    }
    onSave?.(data)
    setIsOpen(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || <Button size="sm">Nueva Unidad</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconInfoCircle className="size-5 text-primary" />
              {isEditing ? "Ficha Técnica: " + unidad?.numero : "Alta de Nueva Unidad"}
            </DialogTitle>
            <DialogDescription>
              Complete los datos técnicos, tributarios y de servicios básicos de la propiedad.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-4">
            {/* Sección 1: Identificación y Categoría Física */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg border">
              <div className="space-y-2">
                <Label className="text-xs font-bold">Categoría Física (Plantilla)</Label>
                <Select value={tipoId} onValueChange={handleTipoChange}>
                  <SelectTrigger><SelectValue placeholder="Seleccione modelo..." /></SelectTrigger>
                  <SelectContent>
                    {tiposUnidad.filter(t => t.activo).map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground italic">
                  Define el modelo base, metraje y cobros.
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold">Número / Identificador</Label>
                <Input name="numero" defaultValue={unidad?.numero} placeholder="Ej: 101, 14-B" required />
              </div>
            </div>

            {/* Sección 2: Datos Técnicos y SII */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold">Metraje (m²)</Label>
                <Input 
                  type="number" 
                  value={metraje} 
                  readOnly 
                  className="bg-muted font-medium cursor-not-allowed"
                />
                <p className="text-[9px] text-muted-foreground italic">
                  * Bloqueado: Se define en el maestro de Categoría Física.
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold">Prorrateo (%)</Label>
                <Input type="number" step="0.0001" value={prorrateo} onChange={(e) => setProrrateo(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold">Rol Avalúo (SII)</Label>
                <Input name="rolSii" defaultValue={unidad?.rolSii} placeholder="123-45" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold">Estado de Ocupación</Label>
              <Select name="estado" defaultValue={unidad?.estado || "Vacante"}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ESTADOS_OCUPACION.map(e => (
                    <SelectItem key={e.id} value={e.nombre}>{e.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sección 3: Servicios Básicos (Agua, Luz, Gas) */}
            <div className="space-y-3">
              <h4 className="text-sm font-bold flex items-center gap-2 border-b pb-2">
                Lectura de Medidores y Servicios
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Agua */}
                <div className="p-3 border rounded-lg bg-blue-50/30 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/50">
                  <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-xs mb-3">
                    <IconDroplet className="size-4" /> AGUA POTABLE
                  </div>
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase opacity-70">N° Cliente</Label>
                      <Input name="agua_cliente" className="h-8 text-xs" defaultValue={unidad?.servicios.agua?.cliente} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase opacity-70">N° Medidor</Label>
                      <Input name="agua_medidor" className="h-8 text-xs" defaultValue={unidad?.servicios.agua?.medidor} />
                    </div>
                  </div>
                </div>

                {/* Luz */}
                <div className="p-3 border rounded-lg bg-yellow-50/30 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-900/50">
                  <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400 font-bold text-xs mb-3">
                    <IconBolt className="size-4" /> ENERGÍA ELÉCTRICA
                  </div>
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase opacity-70">N° Cliente</Label>
                      <Input name="luz_cliente" className="h-8 text-xs" defaultValue={unidad?.servicios.luz?.cliente} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase opacity-70">N° Medidor</Label>
                      <Input name="luz_medidor" className="h-8 text-xs" defaultValue={unidad?.servicios.luz?.medidor} />
                    </div>
                  </div>
                </div>

                {/* Gas */}
                <div className="p-3 border rounded-lg bg-orange-50/30 dark:bg-orange-900/10 border-orange-200 dark:border-orange-900/50">
                  <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 font-bold text-xs mb-3">
                    <IconFlame className="size-4" /> GAS NATURAL / LÍQ.
                  </div>
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase opacity-70">N° Cliente</Label>
                      <Input name="gas_cliente" className="h-8 text-xs" defaultValue={unidad?.servicios.gas?.cliente} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase opacity-70">N° Medidor</Label>
                      <Input name="gas_medidor" className="h-8 text-xs" defaultValue={unidad?.servicios.gas?.medidor} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t pt-4">
            <Button variant="ghost" type="button" onClick={() => setIsOpen(false)}>Cancelar</Button>
            <Button type="submit" className="gap-2">
              {isEditing ? "Actualizar Ficha" : "Registrar Unidad"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
