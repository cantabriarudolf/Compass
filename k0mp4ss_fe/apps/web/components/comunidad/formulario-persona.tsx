"use client"

import * as React from "react"
import { Persona } from "@/data/comunidad/personas"
import { useCompassStore } from "@/lib/store"
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
import { Checkbox } from "@workspace/ui/components/checkbox"
import { ScrollArea } from "@workspace/ui/components/scroll-area"

interface FormularioPersonaProps {
  persona?: Persona;
  onSave: (personaData: Partial<Persona>) => void;
  onCancel: () => void;
}

export function FormularioPersona({ persona, onSave, onCancel }: FormularioPersonaProps) {
  const isEditing = !!persona
  const condicionesEspeciales = useCompassStore(s => s.maestros.condicionesEspeciales)
  
  // Estados del formulario
  const [rut, setRut] = React.useState(persona?.rut || "")
  const [nombres, setNombres] = React.useState(persona?.nombres || "")
  const [apellidos, setApellidos] = React.useState(persona?.apellidos || "")
  const [email, setEmail] = React.useState(persona?.email || "")
  const [telefonoMovil, setTelefonoMovil] = React.useState(persona?.telefonoMovil || "")
  const [estadoCuenta, setEstadoCuenta] = React.useState(persona?.estadoCuenta || "activa")
  
  // Roles y Condiciones (Arrays)
  const [roles, setRoles] = React.useState<string[]>(persona?.roles || [])
  const [condiciones, setCondiciones] = React.useState<string[]>(persona?.condicionesEspecialesIds || [])

  const toggleRole = (role: string) => {
    setRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role])
  }

  const toggleCondicion = (id: string) => {
    setCondiciones(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const nuevaPersona: Partial<Persona> = {
      id: persona?.id || `p-${Date.now()}`,
      rut,
      nombreCompleto: `${nombres} ${apellidos}`,
      nombres,
      apellidos,
      email,
      telefonoMovil,
      estadoCuenta: estadoCuenta as "activa" | "inactiva" | "bloqueada",
      roles: roles as any,
      condicionesEspecialesIds: condiciones,
      vinculosUnidad: persona?.vinculosUnidad || []
    }
    
    onSave(nuevaPersona)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full max-h-[80vh]">
      <ScrollArea className="flex-1 pr-4">
        <div className="grid gap-6 py-4">
          
          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-widest border-b pb-2">Identidad Base</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rut">RUT o Pasaporte *</Label>
                <Input id="rut" value={rut} onChange={e => setRut(e.target.value)} placeholder="Ej: 15.123.456-7" required />
              </div>
              <div className="space-y-2">
                <Label>Estado de la Cuenta</Label>
                <Select value={estadoCuenta} onValueChange={(v) => setEstadoCuenta(v as "activa" | "inactiva" | "bloqueada")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="activa">Activa (Vigente)</SelectItem>
                    <SelectItem value="inactiva">Inactiva (Archivada)</SelectItem>
                    <SelectItem value="bloqueada">Bloqueada (Morosidad/Conflicto)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="nombres">Nombres *</Label>
                <Input id="nombres" value={nombres} onChange={e => setNombres(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apellidos">Apellidos *</Label>
                <Input id="apellidos" value={apellidos} onChange={e => setApellidos(e.target.value)} required />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-widest border-b pb-2">Contacto Oficial</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Correo Electrónico *</Label>
                <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@ejemplo.com" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tel">Teléfono Móvil *</Label>
                <Input id="tel" value={telefonoMovil} onChange={e => setTelefonoMovil(e.target.value)} placeholder="+56 9 0000 0000" required />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-widest border-b pb-2">Configuración de Roles</h3>
            <p className="text-xs text-muted-foreground mb-2">Selecciona qué extensiones o accesos tendrá este usuario.</p>
            <div className="grid grid-cols-2 gap-3 bg-muted/50 p-4 rounded-lg">
              {["propietario", "residente", "personal", "directiva", "contratista"].map(rol => (
                <div key={rol} className="flex items-center space-x-2">
                  <Checkbox 
                    id={`rol-${rol}`} 
                    checked={roles.includes(rol)}
                    onCheckedChange={() => toggleRole(rol)}
                  />
                  <Label htmlFor={`rol-${rol}`} className="capitalize">{rol}</Label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-amber-600 uppercase tracking-widest border-b pb-2">Alertas de Seguridad (Vulnerabilidad)</h3>
            <div className="grid grid-cols-2 gap-3 p-4 rounded-lg border border-amber-500/20 bg-amber-500/5">
              {condicionesEspeciales.map(cond => (
                <div key={cond.id} className="flex items-center space-x-2">
                  <Checkbox 
                    id={`cond-${cond.id}`} 
                    checked={condiciones.includes(cond.id)}
                    onCheckedChange={() => toggleCondicion(cond.id)}
                  />
                  <Label htmlFor={`cond-${cond.id}`}>{cond.nombre}</Label>
                </div>
              ))}
            </div>
          </div>

        </div>
      </ScrollArea>
      
      <div className="flex justify-end gap-2 pt-4 border-t mt-4">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit">{isEditing ? "Guardar Cambios" : "Crear Persona"}</Button>
      </div>
    </form>
  )
}
