"use client"

import * as React from "react"
import { ROLES_PERSONA, ExtensionGobernanzaSchema, formatoErrorZod } from "@/lib/schemas"
import type { Persona } from "@/lib/schemas"
import { StoreResult } from "@/lib/store"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { ScrollArea } from "@workspace/ui/components/scroll-area"

interface FormularioGobernanzaProps {
  persona: Persona
  onSave: (persona: Persona) => StoreResult
  onCancel: () => void
}

const CARGOS = ["presidente", "tesorero", "secretario", "director"] as const

const CARGO_LABEL: Record<(typeof CARGOS)[number], string> = {
  presidente: "Presidente",
  tesorero: "Tesorero",
  secretario: "Secretario",
  director: "Director",
}

export function FormularioGobernanza({ persona, onSave, onCancel }: FormularioGobernanzaProps) {
  const ficha = persona.datosGobernanza
  const isEditing = !!ficha

  const [cargo, setCargo] = React.useState<string>(ficha?.cargoDirectiva ?? "")
  const [fechaAsuncion, setFechaAsuncion] = React.useState(ficha?.fechaAsuncion ?? "")
  const [firmaDigital, setFirmaDigital] = React.useState(ficha?.firmaDigital ?? "")
  const [error, setError] = React.useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    const candidata = {
      id: ficha?.id ?? `g-${persona.id}`,
      cargoDirectiva: cargo,
      fechaAsuncion,
      ...(firmaDigital.trim() ? { firmaDigital: firmaDigital.trim() } : {}),
    }
    const validacion = ExtensionGobernanzaSchema.safeParse(candidata)
    if (!validacion.success) {
      setError(formatoErrorZod(validacion.error))
      return
    }

    // SAFETY: la ficha solo persiste con rol directiva (el store depura
    // datosGobernanza sin rol para no dejar miembros fantasmas en el quórum).
    const roles = persona.roles.includes("directiva")
      ? persona.roles
      : ([...persona.roles, "directiva"] as unknown as (typeof ROLES_PERSONA[number])[])

    const resultado = onSave({ ...persona, roles, datosGobernanza: validacion.data })
    if (resultado && !resultado.ok) {
      setError(resultado.error ?? "No se pudo guardar la ficha.")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1 overflow-y-auto pr-4 max-h-[60vh]">
        <div className="grid gap-6 py-4">
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive font-medium">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-widest border-b pb-2">
              Ficha de {persona.nombres} {persona.apellidos}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cargoDirectiva">Cargo directivo *</Label>
                <Select value={cargo} onValueChange={setCargo}>
                  <SelectTrigger id="cargoDirectiva"><SelectValue placeholder="Seleccioná el cargo" /></SelectTrigger>
                  <SelectContent>
                    {CARGOS.map(c => (
                      <SelectItem key={c} value={c}>{CARGO_LABEL[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fechaAsuncion">Fecha de asunción *</Label>
                <Input
                  id="fechaAsuncion"
                  type="date"
                  value={fechaAsuncion}
                  onChange={e => setFechaAsuncion(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="firmaDigital">Firma digitalizada (URL, opcional)</Label>
                <Input
                  id="firmaDigital"
                  type="url"
                  value={firmaDigital}
                  onChange={e => setFirmaDigital(e.target.value)}
                  placeholder="https://cdn.ejemplo.com/firmas/p-1.png"
                />
                <p className="text-xs text-muted-foreground">
                  Media por referencia (D1): solo URL, jamás base64 ni Blob.
                </p>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>

      <div className="flex shrink-0 justify-end gap-2 pt-4 border-t mt-4 bg-popover">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit">{isEditing ? "Guardar cambios" : "Registrar ficha"}</Button>
      </div>
    </form>
  )
}
