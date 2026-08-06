"use client"

import * as React from "react"
import { 
  CATEGORIAS_MACRO as initialMacros, 
  ESTADOS_OCUPACION as initialEstados,
} from "@/data/maestros"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
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
  IconTrash, 
  IconUsers,
  IconReceipt2,
  IconPhoneCall,
  IconUserExclamation,
  IconBuildingBank
} from "@tabler/icons-react"

// MOCKS EXTENDIDOS PARA ESTA FASE
const initialCondiciones = [
  { id: "c-1", nombre: "Electrodependiente", color: "bg-blue-500 text-white" },
  { id: "c-2", nombre: "Movilidad Reducida", color: "bg-amber-500 text-black" },
  { id: "c-3", nombre: "Adulto Mayor Solo", color: "bg-purple-500 text-white" },
]

const initialBancos = [
  { id: "b-1", nombre: "Banco Estado" },
  { id: "b-2", nombre: "Banco de Chile" },
  { id: "b-3", nombre: "Santander" },
]

const initialEmergencias = [
  { id: "e-1", nombre: "Plan Cuadrante", valor: "+56 9 1234 5678" },
  { id: "e-2", nombre: "Bomberos 14va Cia", valor: "132" },
]

export default function MaestrosPage() {
  const [estados, setEstados] = React.useState([...initialEstados])
  const [macros, setMacros] = React.useState([...initialMacros])
  const [condiciones, setCondiciones] = React.useState([...initialCondiciones])
  const [bancos, setBancos] = React.useState([...initialBancos])
  const [emergencias, setEmergencias] = React.useState([...initialEmergencias])
  
  const [editingItem, setEditingItem] = React.useState<any>(null)
  const [isDialogOpen, setIsDialogOpen] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState("inventario")
  const [subTab, setSubTab] = React.useState("estados")

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const nombre = formData.get("nombre") as string
    const valor = formData.get("valor") as string
    const color = formData.get("color") as string
    
    // Lógica de guardado simplificada para el demo
    if (subTab === "estados") {
      if (editingItem) setEstados(estados.map(i => i.id === editingItem.id ? { ...i, nombre, color } : i))
      else setEstados([...estados, { id: Date.now().toString(), nombre, color }])
    } else if (subTab === "condiciones") {
      if (editingItem) setCondiciones(condiciones.map(i => i.id === editingItem.id ? { ...i, nombre, color } : i))
      else setCondiciones([...condiciones, { id: Date.now().toString(), nombre, color }])
    } else if (subTab === "bancos") {
      if (editingItem) setBancos(bancos.map(i => i.id === editingItem.id ? { ...i, nombre } : i))
      else setBancos([...bancos, { id: Date.now().toString(), nombre }])
    } else if (subTab === "emergencias") {
      if (editingItem) setEmergencias(emergencias.map(i => i.id === editingItem.id ? { ...i, nombre, valor } : i))
      else setEmergencias([...emergencias, { id: Date.now().toString(), nombre, valor }])
    }
    
    setIsDialogOpen(false)
    setEditingItem(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Maestros Administrativos</h1>
          <p className="text-muted-foreground">Configuración global de parámetros operativos y humanos.</p>
        </div>
        <Button onClick={() => { setEditingItem(null); setIsDialogOpen(true); }} className="gap-2">
          <IconPlus className="size-4" /> Nuevo Registro
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
              <Button variant={subTab === "estados" ? "default" : "ghost"} className="justify-start gap-2" onClick={() => setSubTab("estados")}>
                <IconPalette className="size-4" /> Estados de Ocupación
              </Button>
              <Button variant={subTab === "macros" ? "default" : "ghost"} className="justify-start gap-2" onClick={() => setSubTab("macros")}>
                <IconTags className="size-4" /> Categorías Macro
              </Button>
            </div>
            
            <Card className="col-span-3">
              <CardHeader>
                <CardTitle>{subTab === "estados" ? "Semántica de Estados" : "Jerarquía de Sectores"}</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      {subTab === "estados" && <TableHead>Vista Previa</TableHead>}
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(subTab === "estados" ? estados : macros).map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-bold">{item.nombre}</TableCell>
                        {subTab === "estados" && (
                          <TableCell>
                            <Badge className={`${"color" in item ? item.color : ""} font-bold uppercase text-[10px]`}>{item.nombre}</Badge>
                          </TableCell>
                        )}
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => { setEditingItem(item); setIsDialogOpen(true); }}>
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
              <Button variant={subTab === "condiciones" ? "default" : "ghost"} className="justify-start gap-2" onClick={() => setSubTab("condiciones")}>
                <IconUserExclamation className="size-4" /> Condiciones Especiales
              </Button>
              <Button variant={subTab === "emergencias" ? "default" : "ghost"} className="justify-start gap-2" onClick={() => setSubTab("emergencias")}>
                <IconPhoneCall className="size-4" /> Directorio de Emergencia
              </Button>
            </div>
            
            <Card className="col-span-3 border-purple-100">
              <CardHeader>
                <CardTitle>{subTab === "condiciones" ? "Etiquetas de Vulnerabilidad" : "Números Críticos"}</CardTitle>
                <CardDescription>Parámetros para la seguridad y bienestar de los residentes.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Identificador</TableHead>
                      <TableHead>{subTab === "condiciones" ? "Badge Visual" : "Número / Contacto"}</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(subTab === "condiciones" ? condiciones : emergencias).map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-bold">{item.nombre}</TableCell>
                        <TableCell>
                          {subTab === "condiciones" ? (
                            <Badge className={`${"color" in item ? item.color : ""} font-black text-[9px]`}>{item.nombre.toUpperCase()}</Badge>
                          ) : (
                            <span className="text-sm font-mono text-blue-600">{"valor" in item ? item.valor : ""}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => { setEditingItem(item); setIsDialogOpen(true); }}>
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
              <Button variant={subTab === "bancos" ? "default" : "ghost"} className="justify-start gap-2" onClick={() => setSubTab("bancos")}>
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
                    {bancos.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-bold">{item.nombre}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => { setEditingItem(item); setIsDialogOpen(true); }}>
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

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle>{editingItem ? "Editar Maestro" : "Añadir Nuevo Maestro"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Nombre / Etiqueta</Label>
                <Input name="nombre" defaultValue={editingItem?.nombre} required />
              </div>
              
              {(subTab === "estados" || subTab === "condiciones") && (
                <div className="space-y-2">
                  <Label>Clase de Color (Tailwind)</Label>
                  <Input name="color" defaultValue={editingItem?.color || "bg-zinc-500 text-white"} required />
                </div>
              )}

              {subTab === "emergencias" && (
                <div className="space-y-2">
                  <Label>Número / Valor</Label>
                  <Input name="valor" defaultValue={editingItem?.valor} required />
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
