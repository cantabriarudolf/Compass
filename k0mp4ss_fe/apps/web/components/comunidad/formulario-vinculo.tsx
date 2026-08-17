"use client"

import * as React from "react"
import { Unidad, MicroSector, MacroSector } from "@/data/inventario/estructura"
import { useCompassStore, StoreResult } from "@/lib/store"
import { RolVinculo, VinculoUnidad } from "@/data/comunidad/vinculos"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { IconSearch } from "@tabler/icons-react"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

const ROLES_VINCULO: { id: RolVinculo; nombre: string }[] = [
  { id: "propietario", nombre: "Propietario" },
  { id: "arrendatario", nombre: "Arrendatario" },
  { id: "copropietario", nombre: "Copropietario / Familiar" },
  { id: "ocupante", nombre: "Ocupante" },
]

const ESTADOS_INMOBILIARIOS: { id: NonNullable<VinculoUnidad["estadoOcupacionPropiedad"]>; nombre: string }[] = [
  { id: "habitada", nombre: "Habitada" },
  { id: "proxima_vacancia", nombre: "Próxima Vacancia" },
  { id: "en_arriendo", nombre: "En Arriendo" },
  { id: "arrendada", nombre: "Arrendada" },
  { id: "en_venta", nombre: "En Venta" },
]

function etiquetaUnidad(u: Unidad) {
  return `${u.etiqueta} ${u.numero}`
}

function nombreSector(unidad: Unidad, microPorId: Map<string, MicroSector>, macroPorId: Map<string, MacroSector>) {
  const micro = microPorId.get(unidad.microSectorId)
  const macro = micro ? macroPorId.get(micro.macroSectorId) : undefined
  return macro ? `${macro.etiqueta} ${macro.nombre}`.trim() : "Otros"
}

interface FormularioVinculoUnidadProps {
  vinculo?: VinculoUnidad;
  // IDs de unidades con vínculo ACTIVO de la persona (excluir el propio vínculo en modo edición)
  unidadesVinculadasIds: string[];
  onSave: (data: Omit<VinculoUnidad, "id" | "personaId">) => StoreResult;
  onCancel: () => void;
}

export function FormularioVinculoUnidad({ vinculo, unidadesVinculadasIds, onSave, onCancel }: FormularioVinculoUnidadProps) {
  const isEditing = !!vinculo
  const unidades = useCompassStore(s => s.unidades)
  const microSectores = useCompassStore(s => s.microSectores)
  const macroSectores = useCompassStore(s => s.macroSectores)
  const microPorId = React.useMemo(() => new Map(microSectores.map(m => [m.id, m])), [microSectores])
  const macroPorId = React.useMemo(() => new Map(macroSectores.map(m => [m.id, m])), [macroSectores])

  const [busqueda, setBusqueda] = React.useState("")
  const [unidadId, setUnidadId] = React.useState(vinculo?.unidadId ?? "")
  const [rol, setRol] = React.useState<RolVinculo | "">(vinculo?.rol ?? "")
  const [fechaInicio, setFechaInicio] = React.useState(vinculo?.fechaInicio ?? "")
  const [fechaFin, setFechaFin] = React.useState(vinculo?.fechaFin ?? "")
  const [permiteVerFinanzas, setPermiteVerFinanzas] = React.useState(vinculo?.permiteVerFinanzas ?? false)
  const [estadoOcupacionPropiedad, setEstadoOcupacionPropiedad] = React.useState<VinculoUnidad["estadoOcupacionPropiedad"]>(vinculo?.estadoOcupacionPropiedad ?? "habitada")
  const [errores, setErrores] = React.useState<Record<string, string>>({})

  const unidadesDisponibles = React.useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const base = unidades.filter(u => !unidadesVinculadasIds.includes(u.id))
    if (!q) return base
    return base.filter(u =>
      etiquetaUnidad(u).toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q)
    )
  }, [busqueda, unidades, unidadesVinculadasIds])

  const unidadesPorSector = React.useMemo(() => {
    const grupos = new Map<string, Unidad[]>()
    for (const u of unidadesDisponibles) {
      const nombre = nombreSector(u, microPorId, macroPorId)
      if (!grupos.has(nombre)) grupos.set(nombre, [])
      grupos.get(nombre)!.push(u)
    }
    return [...grupos.entries()]
  }, [unidadesDisponibles, microPorId, macroPorId])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const nuevosErrores: Record<string, string> = {}
    if (!unidadId) nuevosErrores.unidadId = "Debes seleccionar una unidad."
    if (!rol) nuevosErrores.rol = "Debes seleccionar un rol."
    if (!fechaInicio) nuevosErrores.fechaInicio = "La fecha de inicio es obligatoria."
    if (fechaInicio && fechaFin && fechaFin < fechaInicio) {
      nuevosErrores.fechaFin = "La fecha de fin no puede ser anterior a la fecha de inicio."
    }
    if (unidadId && unidadesVinculadasIds.includes(unidadId)) {
      nuevosErrores.unidadId = "Esta persona ya posee un vínculo activo con esta unidad."
    }

    setErrores(nuevosErrores)
    if (Object.keys(nuevosErrores).length > 0) return

    const resultado = onSave({
      unidadId,
      rol: rol as RolVinculo,
      fechaInicio,
      ...(fechaFin ? { fechaFin } : {}),
      ...(rol === "propietario"
        ? { estadoOcupacionPropiedad: estadoOcupacionPropiedad ?? "habitada", permiteVerFinanzas }
        : { permiteVerFinanzas: false }),
    })
    if (resultado && !resultado.ok) {
      setErrores({ global: resultado.error ?? "No se pudo guardar el vínculo." })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full max-h-[80vh]">
      <ScrollArea className="flex-1 pr-4">
        <div className="grid gap-6 py-4">

          {errores.global && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive font-medium">
              {errores.global}
            </div>
          )}

          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-widest border-b pb-2">Unidad Física</h3>
            <div className="space-y-2">
              <Label>Unidad del Inventario *</Label>
              <div className="relative">
                <IconSearch className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Buscar por etiqueta o código (Depto 101, u-A-101...)"
                  className="pl-8"
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                />
              </div>
              <Select value={unidadId} onValueChange={(v) => { setUnidadId(v); setErrores(prev => ({ ...prev, unidadId: "" })) }}>
                <SelectTrigger className="w-full" aria-invalid={!!errores.unidadId}>
                  <SelectValue placeholder="Selecciona una unidad..." />
                </SelectTrigger>
                <SelectContent>
                  {unidadesPorSector.length === 0 && (
                    <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                      No hay unidades disponibles para vincular.
                    </p>
                  )}
                  {unidadesPorSector.map(([sector, unidadesSector]) => (
                    <SelectGroup key={sector}>
                      <SelectLabel className="uppercase text-xs text-muted-foreground">{sector}</SelectLabel>
                      {unidadesSector.map(u => (
                        <SelectItem key={u.id} value={u.id}>
                          {etiquetaUnidad(u)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              {errores.unidadId && <p className="text-xs text-destructive">{errores.unidadId}</p>}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-widest border-b pb-2">Rol de Vinculación</h3>
            <div className="space-y-2">
              <Label>Rol *</Label>
              <Select value={rol} onValueChange={(v) => { setRol(v as RolVinculo); setErrores(prev => ({ ...prev, rol: "" })) }}>
                <SelectTrigger className="w-full" aria-invalid={!!errores.rol}>
                  <SelectValue placeholder="Selecciona el rol..." />
                </SelectTrigger>
                <SelectContent>
                  {ROLES_VINCULO.map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errores.rol && <p className="text-xs text-destructive">{errores.rol}</p>}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-widest border-b pb-2">Vigencia</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fecha-inicio">Fecha de Inicio *</Label>
                <Input
                  id="fecha-inicio"
                  type="date"
                  value={fechaInicio}
                  onChange={e => setFechaInicio(e.target.value)}
                  aria-invalid={!!errores.fechaInicio}
                  required
                />
                {errores.fechaInicio && <p className="text-xs text-destructive">{errores.fechaInicio}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="fecha-fin">Fecha de Fin</Label>
                <Input
                  id="fecha-fin"
                  type="date"
                  value={fechaFin}
                  onChange={e => setFechaFin(e.target.value)}
                  aria-invalid={!!errores.fechaFin}
                  placeholder="Solo para registros históricos"
                />
                {errores.fechaFin && <p className="text-xs text-destructive">{errores.fechaFin}</p>}
              </div>
            </div>
          </div>

          {rol === "propietario" && (
            <div className="space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-widest border-b pb-2">Configuración Inmobiliaria</h3>

              <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div>
                  <Label htmlFor="permite-ver-finanzas">Privacidad Financiera</Label>
                  <p className="text-xs text-muted-foreground">Permite que los residentes de la unidad vean los gastos comunes asociados.</p>
                </div>
                <Switch
                  id="permite-ver-finanzas"
                  checked={permiteVerFinanzas}
                  onCheckedChange={setPermiteVerFinanzas}
                />
              </div>

              <div className="space-y-2">
                <Label>Estado Ocupación de la Propiedad</Label>
                <Select value={estadoOcupacionPropiedad} onValueChange={(v) => setEstadoOcupacionPropiedad(v as VinculoUnidad["estadoOcupacionPropiedad"])}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecciona el estado..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ESTADOS_INMOBILIARIOS.map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

        </div>
      </ScrollArea>

      <div className="flex justify-end gap-2 pt-4 border-t mt-4">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit">{isEditing ? "Guardar Cambios" : "Vincular Unidad"}</Button>
      </div>
    </form>
  )
}
