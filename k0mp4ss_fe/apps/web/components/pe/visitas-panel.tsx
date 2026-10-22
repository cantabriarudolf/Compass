"use client"

import * as React from "react"
import { useCompassStore } from "@/lib/store"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Switch } from "@workspace/ui/components/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { IconCheck, IconScan, IconTrash } from "@tabler/icons-react"
import { AvisoTruncamiento, LIMITE_SELECT } from "@/components/pe/aviso-truncamiento"
import type { BitacoraVisitaPE } from "@/lib/schemas"

function escaneoDNISimulado(): { nombre: string; dni: string } {
  const nombres = ["Camila Rojas Fuentes", "Matías Sepúlveda Muñoz", "Valentina Herrera Soto", "Diego Cifuentes Vega"]
  const cuerpo = String(Math.floor(10000000 + Math.random() * 79999999))
  let suma = 0
  let factor = 2
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor
    factor = factor === 7 ? 2 : factor + 1
  }
  const dv = 11 - (suma % 11)
  const dvStr = dv === 11 ? "0" : dv === 10 ? "K" : String(dv)
  return { nombre: nombres[Math.floor(Math.random() * nombres.length)]!, dni: `${cuerpo}-${dvStr}` }
}

interface FormVisita {
  nombre: string
  dni: string
  patente: string
  unidadId: string
  destinoPersonaId: string
  jornadaId: string
  origenAgenda: "pre_agendada" | "sin_aviso"
  notas: string
}

export function VisitasPanel({
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
  const visitas = useCompassStore((s) => s.bitacoraVisitasPE)
  const saveBitacoraVisitaPE = useCompassStore((s) => s.saveBitacoraVisitaPE)
  const ingresarBitacoraVisitaPE = useCompassStore((s) => s.ingresarBitacoraVisitaPE)
  const removeBitacoraVisitaPE = useCompassStore((s) => s.removeBitacoraVisitaPE)

  const [formVisita, setFormVisita] = React.useState<FormVisita>({
    nombre: "",
    dni: "",
    patente: "",
    unidadId: "",
    destinoPersonaId: "",
    jornadaId: "j-manana",
    origenAgenda: "sin_aviso",
    notas: "",
  })

  const jornadas = maestros.jornadas

  // Listas de opciones: se recortan a LIMITE_SELECT para no montar cientos de
  // SelectItem, y el recorte se declara en pantalla (nunca en silencio).
  const unidadesDestino = unidades.filter((u) => !u.id.startsWith("u-E-"))
  const unidadesVisibles = unidadesDestino.slice(0, LIMITE_SELECT)
  const personasVisibles = personas.slice(0, LIMITE_SELECT)

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

  const guardarVisita = () => {
    if (!formVisita.nombre.trim() || !formVisita.dni.trim()) {
      onError("Nombre y DNI de la visita son obligatorios.")
      return
    }
    if (!formVisita.unidadId && !formVisita.destinoPersonaId) {
      onError("Indique la unidad o el residente destino.")
      return
    }
    const esAgendada = formVisita.origenAgenda === "pre_agendada"
    const visita: BitacoraVisitaPE = {
      id: `pe-vis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fecha: diaReporte,
      nombre: formVisita.nombre.trim(),
      dni: formVisita.dni.trim(),
      patente: formVisita.patente.trim() || undefined,
      unidadId: formVisita.unidadId || undefined,
      destinoPersonaId: formVisita.destinoPersonaId || undefined,
      jornadaId: formVisita.jornadaId,
      origenAgenda: formVisita.origenAgenda,
      agendadaPorPersonaId: undefined,
      estado: esAgendada ? "agendada" : "ingresada",
      notas: formVisita.notas.trim() || undefined,
    }
    const r = saveBitacoraVisitaPE(visita)
    if (!r.ok) {
      onError(r.error ?? "No se pudo registrar la visita.")
      return
    }
    setFormVisita({ ...formVisita, nombre: "", dni: "", patente: "", notas: "" })
    onError(null)
    onSuccess(esAgendada ? "Visita pre-agendada a la espera del ingreso." : "Visita registrada e ingresada.")
  }

  const escanearDNI = () => {
    const sim = escaneoDNISimulado()
    setFormVisita((f) => ({ ...f, nombre: sim.nombre, dni: sim.dni }))
    onSuccess("Escaneo DNI simulado completado: identidad autocompletada (feature local).")
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            Registro de visita
            <Button size="sm" variant="outline" onClick={escanearDNI}>
              <IconScan className="mr-1 size-4" /> Escanear DNI
            </Button>
          </CardTitle>
          <CardDescription>Pre-agendamiento o llegada sin aviso. * obligatorios.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="v-nombre">Nombre *</Label>
              <Input id="v-nombre" value={formVisita.nombre} onChange={(e) => setFormVisita({ ...formVisita, nombre: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="v-dni">DNI *</Label>
              <Input id="v-dni" value={formVisita.dni} onChange={(e) => setFormVisita({ ...formVisita, dni: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="v-patente">Patente</Label>
              <Input id="v-patente" value={formVisita.patente} onChange={(e) => setFormVisita({ ...formVisita, patente: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Jornada</Label>
              <Select value={formVisita.jornadaId} onValueChange={(v) => setFormVisita({ ...formVisita, jornadaId: v })}>
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
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label>Unidad destino</Label>
              <Select value={formVisita.unidadId || "__none"} onValueChange={(v) => setFormVisita({ ...formVisita, unidadId: v === "__none" ? "" : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sin unidad</SelectItem>
                  {unidadesVisibles.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.etiqueta} {u.numero}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <AvisoTruncamiento mostrados={unidadesVisibles.length} total={unidadesDestino.length} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Residente destino</Label>
              <Select value={formVisita.destinoPersonaId || "__none"} onValueChange={(v) => setFormVisita({ ...formVisita, destinoPersonaId: v === "__none" ? "" : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sin residente</SelectItem>
                  {personasVisibles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nombreCompleto}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <AvisoTruncamiento mostrados={personasVisibles.length} total={personas.length} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={formVisita.origenAgenda === "pre_agendada"}
              onCheckedChange={(v) => setFormVisita({ ...formVisita, origenAgenda: v ? "pre_agendada" : "sin_aviso" })}
            />
            Pre-agendada (espera confirmación de ingreso)
          </label>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="v-notas">Notas</Label>
            <Input id="v-notas" value={formVisita.notas} onChange={(e) => setFormVisita({ ...formVisita, notas: e.target.value })} />
          </div>
          <Button onClick={guardarVisita}>
            <IconCheck className="mr-1 size-4" /> Registrar visita
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Control del día seleccionado ({diaReporte})</CardTitle>
          <CardDescription>Las visitas agendadas se sellan al llegar.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {visitas.filter((v) => v.fecha === diaReporte).length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Sin visitas registradas para esta fecha.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-3">Nombre</th>
                  <th className="p-3">Destino</th>
                  <th className="p-3">Jornada</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {visitas
                  .filter((v) => v.fecha === diaReporte)
                  .map((v) => (
                    <tr key={v.id} className="border-b last:border-0">
                      <td className="p-3">
                        {v.nombre}
                        <span className="block text-xs text-muted-foreground">
                          {v.dni}
                          {v.patente ? ` · ${v.patente}` : ""}
                        </span>
                      </td>
                      <td className="p-3">
                        {refUnidad(v.unidadId)}
                        {v.destinoPersonaId ? <span className="block text-xs text-muted-foreground">{nombrePersona(v.destinoPersonaId)}</span> : null}
                      </td>
                      <td className="p-3">{jornadas.find((j) => j.id === v.jornadaId)?.nombre ?? "—"}</td>
                      <td className="p-3">
                        {v.estado === "ingresada" ? (
                          <Badge variant="outline">Ingresada {v.horaIngreso}</Badge>
                        ) : v.estado === "agendada" ? (
                          <Badge variant="secondary">Agendada</Badge>
                        ) : (
                          <Badge variant="destructive">Cancelada</Badge>
                        )}
                      </td>
                      <td className="p-3 flex gap-1">
                        {v.estado === "agendada" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const r = ingresarBitacoraVisitaPE(v.id)
                              if (!r.ok) onError(r.error ?? "")
                              else onSuccess(`Visita ${v.nombre} ingresada.`)
                            }}
                          >
                            Marcar Ingresada
                          </Button>
                        )}
                        {v.estado !== "ingresada" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              const r = removeBitacoraVisitaPE(v.id)
                              if (!r.ok) onError(r.error ?? "")
                            }}
                          >
                            <IconTrash className="size-4" />
                          </Button>
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
