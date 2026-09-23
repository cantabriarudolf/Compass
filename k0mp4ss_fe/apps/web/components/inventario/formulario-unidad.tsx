"use client"

import * as React from "react"
import { Unidad } from "@/data/inventario/estructura"
import { useCompassStore, StoreResult } from "@/lib/store"
import { identificadorNormalizado } from "@/lib/normalizacion"
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
  macroSectorId?: string;
  microSectorId?: string;
  trigger?: React.ReactNode;
  onSave?: (data: Partial<Unidad>) => StoreResult | void;
}

interface FormularioUnidadContentProps {
  unidad?: Unidad;
  macroSectorId?: string;
  microSectorId?: string;
  onSave?: (data: Partial<Unidad>) => StoreResult | void;
  onCancel?: () => void;
}

function FormularioUnidadContent({ unidad, macroSectorId, microSectorId, onSave, onCancel }: FormularioUnidadContentProps) {
  const tiposUnidad = useCompassStore(s => s.tiposUnidad)
  const estadosOcupacion = useCompassStore(s => s.maestros.estadosOcupacion)
  const categoriasUnidad = useCompassStore(s => s.maestros.categoriasUnidad)
  const macroSectores = useCompassStore(s => s.macroSectores)
  const microSectores = useCompassStore(s => s.microSectores)
  const isEditing = !!unidad;

  const initialMacroId = React.useMemo(() => {
    if (unidad) {
      const micro = microSectores.find(m => m.id === unidad.microSectorId)
      return micro?.macroSectorId || ""
    }
    if (macroSectorId && macroSectorId !== "todos") return macroSectorId
    return ""
  }, [unidad, macroSectorId, microSectores])

  const initialMicroId = React.useMemo(() => {
    if (unidad) return unidad.microSectorId
    if (microSectorId && microSectorId !== "todos") return microSectorId
    return ""
  }, [unidad, microSectorId])

  // Estados para manejo dinámico de herencia
  const [tipoId, setTipoId] = React.useState(unidad?.tipoUnidadId || "")
  const [categoria, setCategoria] = React.useState(unidad?.etiqueta || categoriasUnidad[0]?.nombre || "")
  const [metraje, setMetraje] = React.useState(unidad?.metraje || 0)
  const [prorrateo, setProrrateo] = React.useState((unidad?.prorrateo || 0) * 100)

  // Sector seleccionado para ubicar la unidad
  const [macroId, setMacroId] = React.useState(initialMacroId)
  const [microId, setMicroId] = React.useState(() => {
    if (initialMicroId) return initialMicroId
    if (initialMacroId) {
      const micros = microSectores.filter(m => m.macroSectorId === initialMacroId)
      if (micros.length === 1 && micros[0]) return micros[0].id
    }
    return ""
  })

  const microsFiltrados = React.useMemo(
    () => microSectores.filter(m => m.macroSectorId === macroId),
    [microSectores, macroId]
  )

  const handleMacroChange = (id: string) => {
    setMacroId(id)
    const microsDelNuevoMacro = microSectores.filter(m => m.macroSectorId === id)
    if (microsDelNuevoMacro.length === 1 && microsDelNuevoMacro[0]) {
      setMicroId(microsDelNuevoMacro[0].id)
    } else {
      const microValido = microsDelNuevoMacro.some(m => m.id === microId)
      if (!microValido) setMicroId("")
    }
  }

  const handleTipoChange = (id: string) => {
    setTipoId(id)
    const tipoEncontrado = tiposUnidad.find(t => t.id === id)
    if (tipoEncontrado) {
      setMetraje(tipoEncontrado.metraje)
      setCategoria(tipoEncontrado.categoria)
    }
  }

  const [errorGuardado, setErrorGuardado] = React.useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!microId) return
    setErrorGuardado(null)

    const formData = new FormData(e.currentTarget)
    
    const data: Partial<Unidad> = {
      microSectorId: microId,
      tipoUnidadId: tipoId,
      etiqueta: categoria,
      numero: identificadorNormalizado(formData.get("numero") as string),
      metraje: Number(metraje),
      prorrateo: Number(prorrateo) / 100,
      rolSii: identificadorNormalizado(formData.get("rolSii") as string),
      estadoId: formData.get("estadoId") as string,
      servicios: {
        agua: { cliente: identificadorNormalizado(formData.get("agua_cliente") as string), medidor: identificadorNormalizado(formData.get("agua_medidor") as string) },
        luz: { cliente: identificadorNormalizado(formData.get("luz_cliente") as string), medidor: identificadorNormalizado(formData.get("luz_medidor") as string) },
        gas: { cliente: identificadorNormalizado(formData.get("gas_cliente") as string), medidor: identificadorNormalizado(formData.get("gas_medidor") as string) },
      }
    }
    const resultado = onSave?.(data)
    if (resultado && !resultado.ok) {
      setErrorGuardado(resultado.error ?? "No se pudo guardar la unidad.")
      return
    }
    onCancel?.()
  }

  const puedeGuardar = !!microId && !!tipoId

  return (
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
        {/* Sección 1: Ubicación Jerárquica */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg border">
          <div className="space-y-2">
            <Label className="text-xs font-bold">Macro-Sector</Label>
            {macroSectores.length === 0 ? (
              <div className="rounded-md border border-dashed p-3 space-y-1">
                <p className="text-[10px] text-destructive font-medium">
                  No hay sectores creados todavía.
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Las categorías de Maestros Administrativos (Torre, Piso…) definen los tipos de Macro y Micro Sectores que se pueden crear. Cerrá este diálogo y usá el botón Nuevo Macro-Sector.
                </p>
              </div>
            ) : (
              <Select value={macroId} onValueChange={handleMacroChange}>
                <SelectTrigger><SelectValue placeholder="Seleccione sector..." /></SelectTrigger>
                <SelectContent>
                  {macroSectores.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.etiqueta} {m.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold">Sub-Sector</Label>
            <Select value={microId} onValueChange={setMicroId} disabled={!macroId || macroSectores.length === 0}>
              <SelectTrigger><SelectValue placeholder={macroId ? "Seleccione sub-sector..." : "Primero elija un macro-sector"} /></SelectTrigger>
              <SelectContent>
                {microsFiltrados.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.etiqueta} {m.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {macroId && microsFiltrados.length === 0 && (
              <p className="text-[10px] text-destructive font-medium">
                Este sector no tiene sub-sectores. Cerrá el formulario y usá el botón + junto a Sub-Sectores para crear uno.
              </p>
            )}
          </div>
        </div>

        {/* Sección 2: Identificación y Categoría Física */}
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
            <Input name="numero" defaultValue={unidad?.numero} placeholder="Ej: 101, 14-B" required onBlur={(e) => { e.currentTarget.value = identificadorNormalizado(e.currentTarget.value) }} />
          </div>
        </div>

        {/* Sección 3: Datos Técnicos y SII */}
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
            <Input name="rolSii" defaultValue={unidad?.rolSii} placeholder="123-45" onBlur={(e) => { e.currentTarget.value = identificadorNormalizado(e.currentTarget.value) }} />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-bold">Estado de Ocupación</Label>
          <Select name="estadoId" defaultValue={unidad?.estadoId || "vacante"}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {estadosOcupacion.map(e => (
                <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sección 4: Servicios Básicos (Agua, Luz, Gas) */}
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

      {errorGuardado && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive font-medium">
          {errorGuardado}
        </div>
      )}

      <DialogFooter className="border-t pt-4">
        <Button variant="ghost" type="button" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" className="gap-2" disabled={!puedeGuardar}>
          {isEditing ? "Actualizar Ficha" : "Registrar Unidad"}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function FormularioUnidad({ unidad, macroSectorId, microSectorId, trigger, onSave }: FormularioUnidadProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [formKey, setFormKey] = React.useState(0)

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (open) setFormKey(k => k + 1)
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || <Button size="sm">Nueva Unidad</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <FormularioUnidadContent
          key={formKey}
          unidad={unidad}
          macroSectorId={macroSectorId}
          microSectorId={microSectorId}
          onSave={onSave}
          onCancel={() => setIsOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
