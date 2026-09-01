"use client"

import * as React from "react"
import { useCompassStore } from "@/lib/store"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { IconCheck, IconTrash } from "@tabler/icons-react"
import type { IngresoContratistaPE } from "@/lib/schemas"

interface FormContratista {
  contratistaId: string
  motivo: string
  unidadId: string
  jornadaId: string
  agendadoPor: "residente" | "administracion"
  personaAgendaId: string
}

export function ContratistasPanel({
  diaReporte,
  onError,
  onSuccess,
}: {
  diaReporte: string
  onError: (msg: string | null) => void
  onSuccess: (msg: string | null) => void
}) {
  const unidades = useCompassStore((s) => s.unidades)
  const personas = useCompassStore((s) => s.personas)
  const maestros = useCompassStore((s) => s.maestros)
  const ingresosContratistas = useCompassStore((s) => s.ingresosContratistasPE)
  const saveIngresoContratistaPE = useCompassStore((s) => s.saveIngresoContratistaPE)
  const confirmarIngresoContratistaPE = useCompassStore((s) => s.confirmarIngresoContratistaPE)
  const removeIngresoContratistaPE = useCompassStore((s) => s.removeIngresoContratistaPE)

  const [formCont, setFormCont] = React.useState<FormContratista>({
    contratistaId: "",
    motivo: "",
    unidadId: "",
    jornadaId: "j-manana",
    agendadoPor: "administracion",
    personaAgendaId: "",
  })

  const jornadas = maestros.jornadas

  const refUnidad = (id?: string) => {
    if (!id) return "—"
    const u = unidades.find((x) => x.id === id)
    return u ? `${u.etiqueta} ${u.numero}` : id
  }
  const nombrePersona = (id?: string) => {
    if (!id) return "—"
    const p = personas.find((x) => x.id === id)
    return p ? `${p.nombres} ${p.apellidos}` : id
  }

  const guardarContratista = () => {
    if (!formCont.contratistaId) {
      onError("Seleccione la empresa del maestro de contratistas.")
      return
    }
    if (formCont.motivo.trim().length < 5) {
      onError("Se exige detallar el motivo específico del ingreso.")
      return
    }
    const ingreso: IngresoContratistaPE = {
      id: `pe-cont-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      contratistaId: formCont.contratistaId,
      motivo: formCont.motivo.trim(),
      unidadId: formCont.unidadId || undefined,
      fecha: diaReporte,
      jornadaId: formCont.jornadaId,
      agendadoPor: formCont.agendadoPor,
      personaAgendaId: formCont.agendadoPor === "residente" ? formCont.personaAgendaId || undefined : undefined,
      estado: "agendado",
    }
    const r = saveIngresoContratistaPE(ingreso)
    if (!r.ok) {
      onError(r.error ?? "No se pudo registrar el ingreso.")
      return
    }
    setFormCont({ ...formCont, motivo: "" })
    onError(null)
    onSuccess("Contratista agendado. Conserjería confirma el ingreso al llegar.")
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Agendamiento de contratista</CardTitle>
          <CardDescription>Residente particular o administración · motivo específico obligatorio.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Empresa (maestro) *</Label>
            <Select value={formCont.contratistaId || undefined} onValueChange={(v) => setFormCont({ ...formCont, contratistaId: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                {maestros.contratistas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ct-motivo">Motivo específico del ingreso *</Label>
            <Input id="ct-motivo" value={formCont.motivo} onChange={(e) => setFormCont({ ...formCont, motivo: e.target.value })} placeholder="Ej.: reparación de fuga en cocina U-201" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label>Jornada</Label>
              <Select value={formCont.jornadaId} onValueChange={(v) => setFormCont({ ...formCont, jornadaId: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {jornadas.map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Agendado por</Label>
              <Select value={formCont.agendadoPor} onValueChange={(v) => setFormCont({ ...formCont, agendadoPor: v as "residente" | "administracion" })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="administracion">Administración</SelectItem>
                  <SelectItem value="residente">Residente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {formCont.agendadoPor === "residente" && (
            <div className="flex flex-col gap-1.5">
              <Label>Residente solicitante</Label>
              <Select value={formCont.personaAgendaId || "__none"} onValueChange={(v) => setFormCont({ ...formCont, personaAgendaId: v === "__none" ? "" : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sin identificar</SelectItem>
                  {personas.slice(0, 100).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nombreCompleto}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label>Unidad destino</Label>
            <Select value={formCont.unidadId || "__none"} onValueChange={(v) => setFormCont({ ...formCont, unidadId: v === "__none" ? "" : v })}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Áreas comunes</SelectItem>
                {unidades
                  .filter((u) => !u.id.startsWith("u-E-"))
                  .slice(0, 100)
                  .map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.etiqueta} {u.numero}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={guardarContratista}>
            <IconCheck className="mr-1 size-4" /> Agendar ingreso
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ingresos del día ({diaReporte})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {ingresosContratistas.filter((i) => i.fecha === diaReporte).length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Sin contratistas agendados para esta fecha.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-3">Empresa</th>
                  <th className="p-3">Motivo</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {ingresosContratistas
                  .filter((i) => i.fecha === diaReporte)
                  .map((i) => (
                    <tr key={i.id} className="border-b last:border-0">
                      <td className="p-3">
                        {maestros.contratistas.find((c) => c.id === i.contratistaId)?.nombre ?? i.contratistaId}
                        <span className="block text-xs text-muted-foreground">
                          {refUnidad(i.unidadId)} · {jornadas.find((j) => j.id === i.jornadaId)?.nombre}
                        </span>
                      </td>
                      <td className="p-3 max-w-[220px]">
                        {i.motivo}
                        <span className="block text-xs text-muted-foreground">Agendó: {i.agendadoPor === "residente" ? nombrePersona(i.personaAgendaId) : "Administración"}</span>
                      </td>
                      <td className="p-3">
                        {i.estado === "agendado" ? (
                          <Badge variant="secondary">Agendado</Badge>
                        ) : i.estado === "ingresado" ? (
                          <Badge variant="outline">Ingresado {i.horaIngreso}</Badge>
                        ) : (
                          <Badge variant="destructive">Cancelado</Badge>
                        )}
                      </td>
                      <td className="p-3">
                        {i.estado === "agendado" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const r = confirmarIngresoContratistaPE(i.id)
                                if (!r.ok) onError(r.error ?? "")
                                else onSuccess("Ingreso de contratista confirmado.")
                              }}
                            >
                              Confirmar
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                const r = removeIngresoContratistaPE(i.id)
                                if (!r.ok) onError(r.error ?? "")
                              }}
                            >
                              <IconTrash className="size-4" />
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
