"use client"

import * as React from "react"
import { TipoUnidad } from "@/data/inventario/estructura"
import { useCompassStore, useStoreRehydrated } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@workspace/ui/components/card"
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
  DialogTitle, 
  DialogTrigger 
} from "@workspace/ui/components/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select"
import { 
  IconPlus, 
  IconPencil, 
  IconEyeOff, 
  IconEye, 
  IconTrendingUp, 
  IconHistory,
  IconCalendarStats
} from "@tabler/icons-react"

export default function TiposUnidadPage() {
  useStoreRehydrated()
  const hasHydrated = useCompassStore(s => s.hasHydrated)
  const data = useCompassStore(s => s.tiposUnidad)
  const unidades = useCompassStore(s => s.unidades)
  const saveTipoUnidad = useCompassStore(s => s.saveTipoUnidad)
  const toggleActivoTipoUnidad = useCompassStore(s => s.toggleActivoTipoUnidad)
  const [editingItem, setEditingItem] = React.useState<TipoUnidad | null>(null)
  const [isDialogOpen, setIsDialogOpen] = React.useState(false)
  const [categoria, setCategoria] = React.useState<TipoUnidad["categoria"]>("Depto")

  // Variables para el calculador de impacto
  const [montoSimulado, setMontoSimulado] = React.useState<number>(0)
  const countUnits = editingItem ? unidades.filter(u => u.tipoUnidadId === editingItem.id).length : 0
  const impact = editingItem ? (montoSimulado - editingItem.montoBaseGc) * countUnits : 0

  const handleOpenEdit = (item: TipoUnidad) => {
    setEditingItem(item)
    setMontoSimulado(item.montoBaseGc)
    setCategoria(item.categoria)
    setIsDialogOpen(true)
  }

  const handleOpenNew = () => {
    setEditingItem(null)
    setMontoSimulado(0)
    setCategoria("Depto")
    setIsDialogOpen(true)
  }

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const nuevoMonto = Number(formData.get("montoBaseGc"))
    const fechaVigencia = formData.get("fechaVigencia") as string

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

      saveTipoUnidad({
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
      saveTipoUnidad(nuevoTipo)
    }
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
        <div className="h-64 w-full rounded-lg bg-muted/30" />
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

      <div className="grid grid-cols-1 gap-4">
        {data.map((item) => {
          const unitsCount = unidades.filter(u => u.tipoUnidadId === item.id).length;
          return (
            <Card key={item.id} className={!item.activo ? "opacity-50 grayscale" : ""}>
              <CardHeader className="flex flex-row items-center justify-between py-4 border-b">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg">{item.nombre}</CardTitle>
                    <Badge variant="outline" className="text-[10px] uppercase">{item.categoria}</Badge>
                    {!item.activo && <Badge variant="destructive" className="text-[8px]">Inactivo</Badge>}
                  </div>
                  <CardDescription>{item.descripcion}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(item)}>
                    <IconPencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => toggleActivo(item.id)}>
                    {item.activo ? <IconEyeOff className="size-4 text-amber-600" /> : <IconEye className="size-4 text-green-600" />}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-4">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Metraje Base</span>
                  <p className="text-xl font-black">{item.metraje} m²</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Monto Base GC</span>
                  <p className="text-xl font-black text-primary">${item.montoBaseGc.toLocaleString("es-CO")}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Unidades Vinculadas</span>
                  <p className="text-xl font-black">{unitsCount} propiedades</p>
                </div>
                <div className="space-y-1 border-l pl-4">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Historial Reciente</span>
                  <div className="flex flex-col gap-1 mt-1">
                    {item.historialTarifas.slice(-2).reverse().map(h => (
                      <div key={h.id} className="text-[10px] flex justify-between border-b pb-1">
                        <span className="font-medium">{h.fechaVigencia}:</span>
                        <span className="font-bold text-primary">${h.monto.toLocaleString("es-CO")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle>{editingItem ? `Editar: ${editingItem.nombre}` : "Nuevo Tipo de Unidad"}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-6 py-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nombre del Tipo</Label>
                  <Input name="nombre" defaultValue={editingItem?.nombre} required />
                </div>
                <div className="space-y-2">
                  <Label>Categoría</Label>
                  <Select value={categoria} onValueChange={(v) => setCategoria(v as TipoUnidad["categoria"])}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Depto">Depto</SelectItem>
                      <SelectItem value="Casa">Casa</SelectItem>
                      <SelectItem value="Local">Local</SelectItem>
                      <SelectItem value="Oficina">Oficina</SelectItem>
                      <SelectItem value="Bodega">Bodega</SelectItem>
                      <SelectItem value="Estacionamiento">Estacionamiento</SelectItem>
                    </SelectContent>
                  </Select>
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
