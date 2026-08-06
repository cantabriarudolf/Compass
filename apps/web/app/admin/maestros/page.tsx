"use client"

import * as React from "react"
import { 
  CATEGORIAS_MACRO as initialMacro, 
  CATEGORIAS_MICRO as initialMicro, 
  CATEGORIAS_UNIDAD as initialUnidad, 
  ESTADOS_OCUPACION as initialEstados 
} from "@/data/maestros"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { Badge } from "@workspace/ui/components/badge"
import { Table, TableBody, TableCell, TableRow } from "@workspace/ui/components/table"
import { 
  Dialog, 
  DialogContent, 
  DialogFooter,
  DialogHeader, 
  DialogTitle, 
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select"
import { 
  IconInfoCircle, 
  IconPlus, 
  IconEyeOff, 
  IconEye,
  IconPencil
} from "@tabler/icons-react"

export default function MaestrosPage() {
  const [macros, setMacros] = React.useState(initialMacro.map(m => ({ ...m, activo: true })))
  const [micros, setMicros] = React.useState(initialMicro.map(m => ({ ...m, activo: true })))
  const [unidades, setUnidades] = React.useState(initialUnidad.map(m => ({ ...m, activo: true })))
  const [estados, setEstados] = React.useState(initialEstados.map(m => ({ ...m, activo: true })))

  const handleAdd = (list: any[], setList: Function, name: string, color?: string) => {
    const id = name.toLowerCase().replace(/\s/g, "-")
    setList([...list, { id, nombre: name, color: color || "secondary", activo: true }])
  }

  const handleUpdate = (list: any[], setList: Function, id: string, name: string, color?: string) => {
    setList(list.map(item => item.id === id ? { ...item, nombre: name, color } : item))
  }

  const toggleActivo = (list: any[], setList: Function, id: string) => {
    setList(list.map(item => item.id === id ? { ...item, activo: !item.activo } : item))
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 p-4 rounded-lg flex items-start gap-3">
        <IconInfoCircle className="size-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 dark:text-blue-200">
          <p className="font-bold">Personalización de Identidad Visual</p>
          <p>Los colores definidos en los "Estados de Ocupación" se reflejarán automáticamente en el mapa de departamentos y estacionamientos.</p>
        </div>
      </div>

      <Tabs defaultValue="categorias" className="w-full">
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="categorias">Estructura Física</TabsTrigger>
          <TabsTrigger value="estados">Estados de Ocupación</TabsTrigger>
        </TabsList>

        <TabsContent value="categorias" className="space-y-6 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <MaestroTable title="Macro-Sectores" data={macros} onAdd={(n: string) => handleAdd(macros, setMacros, n)} onUpdate={(id: string, n: string) => handleUpdate(macros, setMacros, id, n)} onToggle={(id: string) => toggleActivo(macros, setMacros, id)} />
            <MaestroTable title="Micro-Sectores" data={micros} onAdd={(n: string) => handleAdd(micros, setMicros, n)} onUpdate={(id: string, n: string) => handleUpdate(micros, setMicros, id, n)} onToggle={(id: string) => toggleActivo(micros, setMicros, id)} />
            <MaestroTable title="Categorías Unidad" data={unidades} onAdd={(n: string) => handleAdd(unidades, setUnidades, n)} onUpdate={(id: string, n: string) => handleUpdate(unidades, setUnidades, id, n)} onToggle={(id: string) => toggleActivo(unidades, setUnidades, id)} />
          </div>
        </TabsContent>

        <TabsContent value="estados" className="pt-4">
          <MaestroTable 
            title="Estados de Disponibilidad" 
            data={estados} 
            isStatusTable
            onAdd={(n: string, c: string) => handleAdd(estados, setEstados, n, c)} 
            onUpdate={(id: string, n: string, c: string) => handleUpdate(estados, setEstados, id, n, c)}
            onToggle={(id: string) => toggleActivo(estados, setEstados, id)}
            fullWidth 
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function MaestroTable({ title, data, onAdd, onUpdate, onToggle, fullWidth, isStatusTable }: any) {
  const [editingItem, setEditingItem] = React.useState<any>(null)
  const [isDialogOpen, setIsDialogOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [color, setColor] = React.useState("secondary")

  const handleOpenAdd = () => {
    setEditingItem(null)
    setName("")
    setColor("secondary")
    setIsAddOpen(true)
  }

  const handleOpenEdit = (item: any) => {
    setEditingItem(item)
    setName(item.nombre)
    setColor(item.color || "secondary")
    setIsAddOpen(true)
  }

  const [isAddOpen, setIsAddOpen] = React.useState(false)

  return (
    <Card className={fullWidth ? "w-full" : ""}>
      <CardHeader className="flex flex-row items-center justify-between pb-2 border-b mb-2">
        <CardTitle className="text-lg font-bold">{title}</CardTitle>
        <Button variant="outline" size="icon" className="h-8 w-8 text-primary" onClick={handleOpenAdd}><IconPlus className="size-4" /></Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableBody>
            {data.map((item: any) => (
              <TableRow key={item.id} className={!item.activo ? "opacity-40" : "hover:bg-muted/30"}>
                <TableCell className="pl-6">
                  <div className="flex items-center gap-2">
                    {item.color ? <Badge variant={item.color as any} className="font-bold uppercase text-[10px] tracking-wider">{item.nombre}</Badge> : item.nombre}
                    {!item.activo && <span className="text-[10px] uppercase font-bold text-muted-foreground italic">(Deshabilitado)</span>}
                  </div>
                </TableCell>
                <TableCell className="text-right pr-6 space-x-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpenEdit(item)}>
                    <IconPencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onToggle(item.id)}>
                    {item.activo ? <IconEyeOff className="size-4 text-amber-600" /> : <IconEye className="size-4 text-green-600" />}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? `Editar: ${editingItem.nombre}` : `Añadir a ${title}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del parámetro" />
            </div>
            {isStatusTable && (
              <div className="space-y-2">
                <Label>Color de Etiqueta (Semántica)</Label>
                <Select value={color} onValueChange={setColor}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Azul (Principal)</SelectItem>
                    <SelectItem value="secondary">Gris (Neutral)</SelectItem>
                    <SelectItem value="outline">Blanco (Contorno)</SelectItem>
                    <SelectItem value="destructive">Rojo (Crítico/Alerta)</SelectItem>
                  </SelectContent>
                </Select>
                <div className="pt-2">
                  <Label className="text-[10px] uppercase opacity-60">Previsualización:</Label>
                  <div className="mt-1 p-3 border rounded flex justify-center bg-muted/20">
                    <Badge variant={color as any} className="font-bold">{name || "Texto de ejemplo"}</Badge>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => { 
              if (editingItem) {
                onUpdate(editingItem.id, name, color)
              } else {
                onAdd(name, color)
              }
              setIsAddOpen(false) 
            }}>
              {editingItem ? "Actualizar Cambios" : "Guardar Parámetro"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
